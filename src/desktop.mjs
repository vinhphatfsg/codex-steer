import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { threadDeepLink } from "./thread-id.mjs";
import { readDesktopSettings } from "./settings.mjs";

const APP_PATH = "/Applications/ChatGPT.app";
const APP_BUNDLE_ID = "com.openai.codex";
const OPEN = "/usr/bin/open";
const OSASCRIPT = "/usr/bin/osascript";
const SEND_SCRIPT = fileURLToPath(new URL("../scripts/send.applescript", import.meta.url));

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    ...options,
  });
}

export function desktopDoctor() {
  const desktopSettings = readDesktopSettings();
  const checks = {
    macos: process.platform === "darwin",
    chatgpt_app: existsSync(APP_PATH),
    open_command: existsSync(OPEN),
    osascript_command: existsSync(OSASCRIPT),
    send_script: existsSync(SEND_SCRIPT),
    accessibility: false,
  };

  if (checks.macos && checks.osascript_command) {
    const result = run(OSASCRIPT, [
      "-e",
      'tell application "System Events" to return UI elements enabled',
    ], { timeout: 3000 });
    checks.accessibility = result.status === 0 && result.stdout.trim() === "true";
  }

  return {
    ready: Object.values(checks).every(Boolean),
    backend: "desktop-ui",
    desktop_settings: desktopSettings,
    checks,
    remediation: checks.accessibility
      ? null
      : "Enable Accessibility for your terminal app in System Settings > Privacy & Security > Accessibility.",
  };
}

export function openDesktopThread(threadId) {
  const deepLink = threadDeepLink(threadId);
  const result = run(OPEN, ["-b", APP_BUNDLE_ID, deepLink]);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Failed to open ${deepLink}`);
  }
  return { thread_id: threadId, deep_link: deepLink, backend: "desktop-ui" };
}

export function buildSendPlan(threadId, message, waitMs = 1500, desktopSettings = readDesktopSettings()) {
  return {
    thread_id: threadId,
    deep_link: threadDeepLink(threadId),
    backend: "desktop-ui",
    wait_ms: waitMs,
    follow_up_mode: desktopSettings.follow_up_mode,
    composer_enter_behavior: desktopSettings.composer_enter_behavior,
    submit_shortcut: desktopSettings.submit_shortcut,
    message_characters: [...message].length,
  };
}

export function sendDesktopMessage(threadId, message, { dryRun = false, waitMs = 1500 } = {}) {
  if (message.trim() === "") throw new Error("Message must not be empty.");
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 30000) {
    throw new Error("--wait-ms must be an integer between 0 and 30000.");
  }

  const desktopSettings = readDesktopSettings();
  const plan = buildSendPlan(threadId, message, waitMs, desktopSettings);
  if (dryRun) return { ...plan, dry_run: true, sent: false };

  const doctor = desktopDoctor();
  if (!doctor.ready) {
    const missing = Object.entries(doctor.checks)
      .filter(([, ok]) => !ok)
      .map(([name]) => name)
      .join(", ");
    throw new Error(`Desktop backend is not ready: ${missing}. ${doctor.remediation ?? ""}`.trim());
  }

  openDesktopThread(threadId);
  const result = run(OSASCRIPT, [SEND_SCRIPT, String(waitMs), desktopSettings.submit_shortcut], {
    env: { ...process.env, CODEX_STEER_MESSAGE: message },
    timeout: waitMs + 15000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Codex Desktop did not accept the steering message.");
  }

  return { ...plan, dry_run: false, sent: true };
}
