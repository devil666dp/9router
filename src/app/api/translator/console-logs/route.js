import { NextResponse } from "next/server";
import {
  clearConsoleLogs, getConsoleLogs, getConsoleBufferMax, setConsoleBufferMax, initConsoleLogCapture,
} from "@/lib/consoleLogBuffer";
import { updateSettings } from "@/lib/localDb";

initConsoleLogCapture();

export async function GET() {
  try {
    const logs = getConsoleLogs();
    return NextResponse.json({ success: true, logs, maxLines: getConsoleBufferMax() });
  } catch (error) {
    console.error("Error getting console logs:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * Resize the console ring buffer.
 *
 * Persisted in settings and applied to the running process immediately, since the
 * buffer reads its cap from module state (appendLine runs on every console.* call and
 * must never touch the DB).
 */
export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requested = Number(body.maxLines);
    if (!Number.isFinite(requested)) {
      return NextResponse.json({ success: false, error: "maxLines must be a number" }, { status: 400 });
    }

    const applied = setConsoleBufferMax(requested);
    await updateSettings({ consoleBufferMaxLines: applied });

    return NextResponse.json({ success: true, maxLines: applied });
  } catch (error) {
    console.error("Error updating console buffer size:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    clearConsoleLogs();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing console logs:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
