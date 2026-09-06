# Keys and Providers — 0.2.0

This update supersedes the initial README/audit descriptions for these two tabs only. Other tabs are unchanged. Workflow/artifact remain **Android build** / **9router-debug**.

## Keys

A prominent endpoint card, one-tap endpoint copy, explicit API-key protection state, labelled protection switch, active/total key counts, create-key naming guidance, creation success dialog and copy action, masked previews, reveal/copy controls, created date, and pause/delete in overflow menus. Disabling protection or pausing/deleting keys requires confirmation explaining the impact. Reveal state clears when the screen stops. An expandable setup guide explains Base URL, keys, model selection and why localhost is device-specific.

## Providers

Adaptive provider-card grid with separate custom/sign-in/free/free-tier/API-key/web-session categories. Search matches provider names and account nicknames. All/Added/Needs attention filters. One card per provider, live account counts, and distinct Active/Paused/Not verified/Needs attention labels (a saved account is not claimed to be a verified healthy connection).

Tap a provider for its accounts. Standard API-key setup uses a provider selected by name, a friendly account nickname and the provider's key: no manual provider-ID entry. Priority/default-model options are collapsed. Editing an account preserves its provider and existing proxy fields; a blank replacement key retains the current key. Provider-wide tests explain that every account is tested and credits may be used. Pause/resume/delete remain explicit user actions.

Native custom-provider creation supports OpenAI-compatible Chat Completions/Responses and Anthropic-compatible nodes using the existing `/api/provider-nodes` API. It is intentionally two-step: create the provider, then add its credential-bearing account. A successful mutation closes the form before refreshing; a refresh failure must not invite duplicate creation. Extra recipe/OAuth/advanced-provider setup remains an explicitly labelled browser handoff, with a separate browser session. Logo customization, provider-node edit/delete, OAuth-native callbacks and connection proxy selection are not added in this update.

## Catalogue/build

`android/scripts/provider_catalog.py` reads active static registry imports and bundles only id/name/category/native-key-support metadata. It does not evaluate registry JavaScript or package credentials, transport configuration or model payloads. Hidden and non-LLM entries are omitted. Account/custom-node state remains live from the existing backend; unavailable node metadata does not discard fetched connections. An app newer than its backend may list a provider the backend cannot create; server errors remain visible.

Local builds now require **Python 3** and the full repository checkout, in addition to the documented Android toolchain. `preBuild` generates the catalogue asset from `open-sse/providers/registry`; no root npm install or extra backend endpoint is required. GitHub's Ubuntu runner includes Python 3.

## Validation

Catalogue parser fixtures executed locally for label/category extraction, nested-model isolation, media filtering, advanced-auth fallback and secret exclusion. Added JUnit coverage for key masking, attention states, custom names and provider-card deduplication. Added Compose previews for compact and large-font provider cards. Native rendering, emulator/TalkBack review, and Android compilation of this update still require CI/Android Studio; they were not available in the authoring sandbox. No visual QA pass or full feature parity is claimed.
