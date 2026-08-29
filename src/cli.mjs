import { readFileSync } from "node:fs";
import { desktopDoctor, inspectDesktopUi, openDesktopThread, sendDesktopMessage } from "./desktop.mjs";
import { normalizeThreadId, threadDeepLink } from "./thread-id.mjs";
import { listLocalThreads } from "./thread-store.mjs";

const VERSION = "0.7.0";

const HELP = `codex-steer ${VERSION}

Send steering messages to local Codex Desktop threads from a terminal.

Usage:
  codex-steer doctor [--json]
  codex-steer threads list [--limit N] [--desktop-only] [--json]
  codex-steer thread resolve <UUID|codex://threads/...> [--json]
  codex-steer open <THREAD> [--json]
  codex-steer debug-ui <THREAD> [--wait-ms N] [--json]
  codex-steer send <THREAD> <MESSAGE...> [--new-turn] [--keep-focus] [--dry-run] [--wait-ms N] [--json]
  codex-steer <THREAD> <MESSAGE...> [--new-turn] [--keep-focus] [--dry-run] [--wait-ms N] [--json]

Use '-' as MESSAGE to read a multiline message from stdin.

Send options:
  --new-turn    Submit as a normal new turn instead of steering an active turn.
  --keep-focus  Leave Codex focused after sending; the default restores the previous app.
  --wait-ms N   Wait for the deep link to load before submitting (0-30000).
`;

function success(command, data, json) {
  if (json) console.log(JSON.stringify({ ok: true, command, data }));
  return data;
}

function fail(error, json) {
  const message = error instanceof Error ? error.message : String(error);
  if (json) console.log(JSON.stringify({ ok: false, error: { message } }));
  else console.error(`codex-steer: ${message}`);
  process.exitCode = 1;
}

function takeOption(args, name, defaultValue) {
  const index = args.indexOf(name);
  if (index === -1) return defaultValue;
  const value = args[index + 1];
  if (value == null) throw new Error(`${name} requires a value.`);
  args.splice(index, 2);
  return value;
}

function takeFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function readMessage(parts) {
  if (parts.length === 1 && parts[0] === "-") return readFileSync(0, "utf8");
  return parts.join(" ");
}

function printThreads(threads) {
  if (threads.length === 0) {
    console.log("No local Codex threads found.");
    return;
  }
  for (const thread of threads) {
    const location = thread.cwd ? `  ${thread.cwd}` : "";
    console.log(`${thread.thread_id}  ${thread.updated_at}${location}`);
  }
}

export async function main(argv) {
  const args = [...argv];
  const json = takeFlag(args, "--json");

  try {
    if (takeFlag(args, "--version")) {
      if (json) success("version", { version: VERSION }, true);
      else console.log(VERSION);
      return;
    }
    if (args.length === 0 || takeFlag(args, "--help") || args[0] === "help") {
      console.log(HELP);
      return;
    }

    let command = args.shift();
    if (command === "doctor") {
      const report = desktopDoctor();
      success("doctor", report, json);
      if (!json) {
        console.log(report.ready ? "Desktop backend: ready" : "Desktop backend: not ready");
        for (const [name, ok] of Object.entries(report.checks)) {
          console.log(`  ${ok ? "ok" : "missing"}  ${name}`);
        }
        if (report.remediation) console.log(`\n${report.remediation}`);
      }
      if (!report.ready) process.exitCode = 1;
      return;
    }

    if (command === "threads") {
      if (args.shift() !== "list") throw new Error("Expected: codex-steer threads list");
      const limit = Number.parseInt(takeOption(args, "--limit", "20"), 10);
      const desktopOnly = takeFlag(args, "--desktop-only");
      if (args.length > 0) throw new Error(`Unexpected argument: ${args[0]}`);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        throw new Error("--limit must be an integer between 1 and 500.");
      }
      const threads = await listLocalThreads({ limit, desktopOnly });
      success("threads.list", { threads, count: threads.length }, json);
      if (!json) printThreads(threads);
      return;
    }

    if (command === "thread") {
      if (args.shift() !== "resolve") throw new Error("Expected: codex-steer thread resolve <THREAD>");
      if (args.length !== 1) throw new Error("thread resolve requires exactly one thread ID or URL.");
      const threadId = normalizeThreadId(args[0]);
      const data = { thread_id: threadId, deep_link: threadDeepLink(threadId) };
      success("thread.resolve", data, json);
      if (!json) console.log(threadId);
      return;
    }

    if (command === "open") {
      if (args.length !== 1) throw new Error("open requires exactly one thread ID or URL.");
      const threadId = normalizeThreadId(args[0]);
      const data = openDesktopThread(threadId);
      success("open", data, json);
      if (!json) console.log(`Opened ${data.deep_link}`);
      return;
    }

    if (command === "debug-ui") {
      const waitMs = Number.parseInt(takeOption(args, "--wait-ms", "1500"), 10);
      if (args.length !== 1) throw new Error("debug-ui requires exactly one thread ID or URL.");
      const threadId = normalizeThreadId(args[0]);
      const data = inspectDesktopUi(threadId, { waitMs });
      success("debug-ui", data, json);
      if (!json) console.log(data.diagnostic);
      return;
    }

    if (command !== "send") {
      args.unshift(command);
      command = "send";
    }

    const dryRun = takeFlag(args, "--dry-run");
    const newTurn = takeFlag(args, "--new-turn");
    const keepFocus = takeFlag(args, "--keep-focus");
    const waitMs = Number.parseInt(takeOption(args, "--wait-ms", "1500"), 10);
    const threadInput = args.shift();
    if (!threadInput) throw new Error("send requires a thread ID or codex://threads URL.");
    const message = readMessage(args);
    if (message.trim() === "") throw new Error("send requires a non-empty message.");
    const threadId = normalizeThreadId(threadInput);
    const data = sendDesktopMessage(threadId, message, { dryRun, waitMs, newTurn, keepFocus });
    success("send", data, json);
    if (!json) {
      console.log(dryRun
        ? `Dry run: would ${newTurn ? "start a new turn in" : "steer"} ${threadId} (${data.message_characters} characters)`
        : newTurn
          ? `Sent a new-turn message to ${threadId}`
          : `Sent steering message to ${threadId}`);
    }
  } catch (error) {
    fail(error, json);
  }
}
