# 9Router Android — Material 3 client (preview)

Native Kotlin / Jetpack Compose companion for the existing Next.js server. **This is a first native implementation, not full frontend parity or a verified release APK.** All runtime data and mutations use the existing backend; no replacement server or database is added.

## Build and download

GitHub Actions workflow: **Android build**, triggered by push, pull_request and workflow_dispatch. It installs JDK 17, Android SDK 35/build-tools 35.0.0 and Gradle 8.11.1, then runs from `android/`:

```sh
gradle --no-daemon :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
```

On success, download the **9router-debug** artifact from the workflow run. APK path: `android/app/build/outputs/apk/debug/app-debug.apk`. Test and lint reports are uploaded separately as `android-reports`. A signed release/Play Store deployment is not configured.

For local development, install JDK 17, Android SDK 35, Gradle 8.11.1 and Android Studio with AGP 8.9 support. Internet access to Google/Maven Central is required.

```sh
cd android
# One-time setup with installed Gradle 8.11.1; creates the standard wrapper.
gradle wrapper --gradle-version 8.11.1 --distribution-type bin
./gradlew testDebugUnitTest lintDebug assembleDebug
# Requires a connected emulator/device:
./gradlew connectedDebugAndroidTest
```

Open `android/` in Android Studio. No downloaded wrapper JAR is included in this initial patch. CI installs pinned Gradle directly and does not require a wrapper.

## Connect to the existing backend

1. Start 9Router normally on the host (default development port: 20127).
2. Set a custom dashboard password locally before connecting remotely. The backend deliberately refuses remote login using a fresh installation's public default password.
3. Enter a trusted HTTPS server origin, such as `https://router.example.com`, without `/v1` or `/dashboard`. Reverse proxies must preserve the existing API paths and cookies.
4. Enter the dashboard password, not a model API key. Passwords are not persisted. Server-configured no-login mode is respected but never enabled by this app.
5. Debug builds also permit `http://10.0.2.2:20127` for the emulator or `http://127.0.0.1:20127` with `adb reverse tcp:20127 tcp:20127`. LAN HTTP is not enabled. Release builds require HTTPS with a normally trusted certificate; no trust-all TLS manager is present.

This is a remote client, not a phone-hosted Next.js runtime. Tunnel/Tailscale installation, host credential imports, MCP processes and local-only Headroom controls stay on the server host. Opening a browser on the phone does not make these operations local.

## Native coverage

- Material3 light/dark/system themes, Android 12+ dynamic color, semantic colors, tonal cards, bottom navigation below 600dp and rail above it, constrained content and scrollable IME-aware forms.
- Password/status login, encrypted cookie sessions, server switching, logout, 429 retry countdown and error display.
- Endpoint copy; API-key list/create/reveal/copy/pause/delete. No automatic default-key provisioning.
- Configured provider connections: search/filter, API-key creation, name/priority/default-model/proxy-pool editing, activate/delete and provider-wide tests.
- Combos: CRUD, ordered model IDs, all kinds, fallback/round-robin, LLM-only Fusion with judge/cost warning, vision/audio adapters preserving other entries.
- Usage: expandable server statistics and breakdowns with period selection. Paginated request-detail metadata (20/page), local search and backend redaction.
- Quota: on-demand per-connection responses, including provider-specific unavailable/error messages.
- Proxy pools: individual CRUD/test, existing proxy/relay registration, strict/noProxy/type/active settings and confirmed deletion.
- RTK/Headroom/Caveman/Ponytail toggles; account/combo routing defaults; observability; password change; appearance; sign-out.

## Browser handoffs and remaining work

Browser-labelled buttons use the same server origin. They **do not inject or share the native session cookie**. Expect a separate browser login. Returning from browser SSO does not authenticate the native app. Native SSO requires a designed server-assisted authorization-code/PKCE handoff; SSO-only deployments must use the browser dashboard in this version.

Remaining native work: provider catalogue/model picker, OAuth/device/provider-specific setup, imports and custom nodes; media generation/playgrounds/file upload/download and specialized media forms; interactive charts and live SSE console; translator stages; CLI/MCP setup; skill catalogue; SSO/admin network/backups/sticky limits/tunnel/shutdown/update UI; bulk proxies and relay deployment; advanced compression settings; localization. Browser links are not claims of native parity.

Model entry is line-based rather than drag-and-drop. Provider creation currently requires the exact provider ID from the web catalogue. Quota refresh is manual. Provider quota 401 errors do not erase the dashboard cookie.

## Security and lifecycle

Same-origin `auth_token` cookie jar checks scheme/host/port/path/expiry. AES-GCM encryption uses Android Keystore; backup disabled; no passwords/API keys persisted or logged. FLAG_SECURE protects screenshots/recents. Explicit key copies mark the clipboard sensitive, but clipboard data still leaves the app.

Redirects and automatic network retries are disabled; mutations are not silently replayed. Payloads are bounded to 4 MiB. OkHttp calls are asynchronous and cancellable. ViewModel survives rotation; form secrets are not saved in Bundle and may require re-entry. Minimal fields are sent on updates. Fresh settings are fetched before map merges, but cross-client edits can still race because the backend does not expose conditional version updates here.

The app does not add CLI-token/trusted-peer headers or weaken backend authentication/local-only restrictions.

## Validation status

The authoring sandbox had JDK 25 but no Android SDK, Gradle, emulator or outbound dependency downloads. XML/YAML and source-package checks are not compilation or runtime tests. JUnit and Compose tests are included but were not run there. No native screenshot, TalkBack, foldable or device QA pass is claimed. **Require green CI before merging.**

Before release, test API 26/35; 390/600/840/1200dp widths and split-screen/foldables; 200% fonts; keyboard/TalkBack; dark/dynamic themes; IME; session restore/expiry; 401/403/409/429; offline/reconnect; and CRUD against a disposable backend, not production.

See FRONTEND-AUDIT.md for reviewed source scope and feature mapping.
