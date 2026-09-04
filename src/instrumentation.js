export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initConsoleLogCapture, setConsoleBufferMax } = await import("@/lib/consoleLogBuffer");
    initConsoleLogCapture();

    // Apply the persisted console buffer size. Read once here rather than per line:
    // the capture path runs on every console.* call in the process.
    try {
      const { getSettings } = await import("@/lib/localDb");
      const settings = await getSettings();
      if (settings?.consoleBufferMaxLines) setConsoleBufferMax(settings.consoleBufferMaxLines);
    } catch { /* first boot before migrations — the default cap stands */ }

    // Server-only: lets capabilities.js read the synced catalog without pulling
    // node:fs into the dashboard's browser bundle.
    const { installCatalogSource } = await import("open-sse/providers/catalogOverride.js");
    await installCatalogSource();

    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();
  }
}
