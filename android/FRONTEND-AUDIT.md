# Frontend-to-Android audit

Baseline: devil666dp/9router master commit `0afdfd064ef364b4e2c7ad6ee098ad80af267e99`, web package 1.5.65.

## Source scope actually read

- `src/shared/components/Sidebar.js`: visible routes and hidden Basic Chat/PXPIPE.
- `src/app/login/page.js`, `src/app/api/auth/login/route.js`, `src/dashboardGuard.js`: dashboard cookies, remote default-password rejection, SSO and host-only boundaries.
- Dashboard providers page and API providers root/[id]: grouping, configured connections and CRUD payloads.
- Dashboard endpoint page/EndpointPageClient and API keys root: key lifecycle, endpoints and tunnels.
- Dashboard combos page and API combos root/[id]: ordered models, kinds, strategy maps and capability adapters.
- Dashboard usage/quota pages and API usage/stats, usage/[connectionId], usage/providers, usage/request-details: periods, per-provider responses, pagination and redaction.
- Dashboard proxy-pools page and `src/shared/constants/proxyTypes.js`: CRUD/test/types, bulk operations and relay deployment.
- Dashboard token-saver page/TokenSaverClient: compression flags, host-managed services and hidden PXPIPE.
- Dashboard profile page: appearance, passwords, SSO settings, backups, routing, proxies, observability and shutdown.
- Dashboard media-providers/[kind] page: categories, connections and kind-specific combos.
- Dashboard console-log page/ConsoleLogClient: stream/inspector/filter/export surface.
- Dashboard translator, skills and cli-tools pages: protocol replay, catalogue and CLI entry point.
- Repository root, app/API directories, package manifest and workflow directory.

This is not an assertion that every child component or hidden route was read. Provider detail/OAuth components, media playgrounds, chart internals, CLI client implementation and console stream internals still need dedicated native-port review. A lookup of usage/components/ProviderLimits.js did not resolve; quota integration relies on the actual API handler instead.

## Coverage

| Area | Native preview | Remaining native work |
| --- | --- | --- |
| Login | Password/status/cookie sessions | SSO code handoff; separate browser session |
| Endpoint/key | Endpoint and key management | Tunnel status/control, security-policy UI |
| Providers | Configured-connection CRUD/search/test | Catalogue, model picker, custom nodes, OAuth/provider forms |
| Combos/adapters | Ordered text models, CRUD, strategy/judge, vision/audio pools | Model catalogue, capability filters, drag-and-drop, specialized media forms |
| Usage | Expandable stats, paginated request metadata | Charts, rich filters, SSE |
| Quota | Per-account on-demand response | Provider gauges, automatic refresh |
| Token saver | Four enable controls | Levels, extras, installation/process UI |
| Proxy pools | Individual CRUD/test/strict settings | Bulk import/test and relay deployment |
| Settings | Theme, routing defaults, observability, password/logout | SSO, backups, network, sticky limits, localization |
| Media | Browser handoff per visible category | Native playgrounds/files |
| CLI/MCP, Console, Translator, Skills | Browser handoffs | Native implementations |
| Host-only routes | Restrictions preserved | Manage on actual host |

## Compatibility and release gates

Dashboard cookies are not model bearer keys. No CLI token, trusted-peer headers, Host spoofing or weakened authentication is added. Provider-unavailable quota messages are shown rather than reported as zero. Backend request-detail redaction is preserved.

All mutations are user-triggered. Delete/pause/test require confirmation. The app does not auto-create keys, install packages or shut down servers. Fusion includes an N+1 billing warning. SSO browser completion is not represented as native login.

Source-only preview. Require CI compilation/lint/unit tests plus separate device, visual and accessibility review. No complete frontend parity or verified APK is claimed.
