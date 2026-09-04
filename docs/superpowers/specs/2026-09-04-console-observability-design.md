# Console Observability Rebuild — Design

Date: 2026-09-04

## Problem

`/dashboard/console-log` is a black `<pre>` that dumps 200 formatted strings. Three
concrete defects, not just styling:

1. `src/lib/consoleLogBuffer.js` — `toLogLine(level, args)` accepts the console level
   and discards it. Every captured line is a bare string, so `console.warn` and
   `console.log` are indistinguishable downstream.
2. `ConsoleLogClient.js` — recovers the level by matching `/\[(\w+)\]/g` and reading
   `match[1]` (the *second* match). Real bracket tags are `[AUTH]`, `[CHAT]`, `[DB]`,
   `[RTK]`, never `[WARN]`. The lookup returns `undefined` for effectively every line
   and falls through to `text-green-400` — level colouring is dead code.
3. The scroll container is force-scrolled to the bottom on every batch, so history
   cannot be read while traffic flows.

There is also no request identity: a request's lifecycle lines (`▶` dispatch,
`⚙` savers, `📊` done, `✗` error, `🔑` refresh) are correlated only by one of eight
emoji dots hashed from the session seed, so two concurrent requests to the same
provider collide.

## Decisions

**Structure is built server-side, at capture.** The buffer stores parsed records
instead of strings. The level comes from the console method actually invoked, so it is
true rather than guessed; parse cost is paid once per line regardless of how many
browser tabs are open; export and facets get real fields. `text` is retained verbatim
so raw mode stays byte-exact.

**Request id is a monotonic base36 counter rendered as 4 chars** (`#0a3f`). Chosen
over random hex: collision-free inside any buffer window (random 4-hex collides ~30%
of the time across 200 live ids), shorter, and ordering is visible. It resets on
restart, which is correct because the buffer is in-process and resets too.

**The console never queries the DB for its main list.** Usage → Details stays as-is
and owns persisted history; the console links into it.

## Architecture

Four layers, each independently testable.

### Capture
- `src/shared/utils/consoleLogRecord.js` (new) — pure `parseConsoleLine(level, text)`
  returning `{level, severity, kind, time, dot, symbol, reqId, tag, message, text,
  fields}`. Recognises every emitter in the repo: the `line`/`errorLine` symbol family
  (`▶ ⚙ 📊 ✗ 🔑 ⚡`), the `debug/info/warn/error` icon family (`🔍 ℹ️ ⚠️ ❌`),
  `request/response/stream` (`📥 📤 💥 🌊`), bare `[TAG]` logs, and unparseable text.
  Per-kind field extraction feeds the inspector, facets and stats.
- `src/lib/consoleLogBuffer.js` — calls the parser, assigns `seq`/`at`, keeps the
  existing 100 ms / 50-line batching, ANSI stripping and `global` state. Max size
  becomes settable via `setConsoleBufferMax()` (module-level, never a per-line DB
  read). `getConsoleLogs()` returns records; `getConsoleLogLines()` returns strings.

### Request identity
- `src/sse/utils/logger.js` — `nextReqId()`; `line()`/`errorLine()` take an optional
  4th `reqId` argument and emit `[time] #id dot symbol message`. Additive: omitting it
  reproduces the old shape exactly.
- `open-sse/handlers/chatCore.js` — allocates `reqId` next to the existing `reqTag`
  and threads it through `sharedCtx` → the four handlers → `createStreamController`,
  along exactly the path `reqTag` already travels.
- Terminal output gains the id. This is intended and visible outside the dashboard.

### Transport
Unchanged. The SSE route keeps its `init`/`line`/`lines`/`clear` protocol and its
abort-bound idempotent cleanup (which works around `ReadableStream.cancel()` not
always firing in Next.js). Only the payload values become objects.

### Presentation
`src/app/(dashboard)/dashboard/console-log/`:
- `ConsoleLogClient.js` — orchestration
- `components/ConsoleToolbar.js`, `ConsoleStats.js`, `ConsoleStream.js`,
  `RequestInspector.js`, `RawConsole.js`
- `hooks/useConsoleStream.js`, `hooks/useConsoleFilters.js`
- `utils/consoleGroups.js` — pure: records → request groups, facets, stats

Grouping and stats as pure functions is what makes them testable without a DOM.

### Visual language
Restrained colour: severity is a left border plus a small dot, not a whole-line tint;
only errors take a strong colour. Compact rows, tabular numerals for numeric columns,
monospace for data (ids, models, token counts) and sans for labels. Follow mode
auto-scrolls only while pinned to the bottom and disengages the moment the user
scrolls up, surfacing a "N new · jump to latest" pill. Sticky group headers, children
on a hairline rail. Keys: `/` search, `j`/`k` selection, `Esc` clear. Rendered-window
cap with "load older" instead of a virtualization dependency.

Facets (provider, model, status, level) are derived from what is actually in the
buffer. Stats (in-flight, req/min, error rate, p50/p95, tokens) are computed from the
same groups and labelled as *the buffer window* — the Usage page owns global stats.

Export is client-side: copy a line, copy a group verbatim, download the filtered view
as `.log` (exact bytes) or `.json` (structured). No new endpoint.

Filters, follow, raw choice and density persist to `localStorage`; buffer size is a
real setting (`consoleBufferMaxLines`, default 500) editable from the console.

## Linking to persisted details

`requestDetails` gains a `reqId` column (`syncSchemaFromTables` applies additive
`ALTER TABLE ADD COLUMN` on next boot — no migration file) stamped at the four
`saveRequestDetail` call sites. `getRequestDetails` accepts a `reqId` filter; the
existing `/api/usage/request-details` route forwards it; `usage/page.js` reads
`?reqId=` and passes it into `RequestDetailsTab`.

The console's "full details" action is therefore a link to
`/dashboard/usage?tab=details&reqId=<id>` — no new endpoint, no duplicated drawer, and
the existing payload redaction in that route is preserved unchanged.

`enableObservability` defaults to **false**, so on a default install nothing is
persisted. The action renders disabled with a tooltip pointing at the setting.

## Known limitation

Only lines emitted through `log.line`/`log.errorLine` carry a request id. The
`log.info/warn/debug` family and bare `console.log` lines (`[RTK]`, `[HEADROOM]`,
`[TOOLDEDUP]`) have no request context at their call sites and render as standalone
system rows. Ambient attribution via `AsyncLocalStorage` in the logger would fix this
without touching call sites; it is deliberately out of scope because context
propagation into stream transform callbacks that outlive `handleChatCore` is unproven.

## Compatibility constraints

- `[RTK] saved …B / …B (…%) via […] hits=N` is regex-parsed out of the log file by
  `tests/unit/rtk.e2e.test.js` and `rtk.multi-provider.e2e.test.js`. Format unchanged.
- `sanitizeHeaders` redaction and the request-details route's payload redaction are
  untouched; the console surfaces no header or body content.
- No provider, alias or OAuth change, so the three `tests/__baseline__/verify-*.mjs`
  snapshots must stay byte-identical.

## Testing

Unit: `parseConsoleLine` against fixtures drawn from every real emitter (symbol
family, icon family, ANSI-wrapped `request()`, bare `[TAG]`, multi-line stack traces,
garbage); grouping and stats (in-flight detection, error grouping, percentiles, orphan
lines, out-of-order arrival); buffer (`text` survives verbatim, changed max is
honoured). Then the app driven through the Playground with terminal output compared
side by side.

Regressions judged against the baseline captured this session (2052 pass / 100 fail),
since committed `known-fails.txt` is stale.
