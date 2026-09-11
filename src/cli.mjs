import { readFileSync } from "node:fs";
import { desktopDoctor, inspectDesktopUi, openDesktopThread, sendDesktopMessage } from "./desktop.mjs";
import { normalizeThreadId, threadDeepLink } from "./thread-id.mjs";
import { listLocalThreads } from "./thread-store.mjs";
import { sendTrackedMessage, listMessages, getMessage, messageSummary, reconcileMessages, markMessage, listInstructions } from "./journal.mjs";
import { appServerDoctor, startDesktop } from "./launcher.mjs";
import { VERSION, helpData, renderHelp } from "./help.mjs";
import { observeThread, printObservation } from "./observe.mjs";

const DEFAULT_SEND_BACKEND = "app-server";

function success(command, data, json) {
  if (json) console.log(JSON.stringify({ ok: true, command, data }));
  return data;
}

function fail(error, json) {
  const message = error instanceof Error ? error.message : String(error);
  if (json) console.log(JSON.stringify({ ok: false, error: {
    message, code: error.code, delivery_status: error.delivery_status,
    sent: error.sent, thread_id: error.thread_id, rpc_code: error.rpc_code,
    message_id: error.message_id, client_message_id: error.client_message_id, journal_update_required: error.journal_update_required,
  } }));
  else console.error(`codex-steer: ${message}`);
  process.exitCode = 1;
}

function takeOption(args, name, defaultValue) {
  const index = args.indexOf(name);
  if (index === -1 || (args.includes("--") && index > args.indexOf("--"))) return defaultValue;
  const value = args[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  args.splice(index, 2);
  return value;
}

function takeFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || (args.includes("--") && index > args.indexOf("--"))) return false;
  args.splice(index, 1);
  return true;
}

function takeOptions(args, name) {
  const values = []; let value;
  while ((value = takeOption(args, name, undefined)) !== undefined) values.push(value);
  return values;
}

function readMessage(parts) {
  if (parts[0] === "--") parts.shift();
  if (parts.length === 1 && parts[0] === "-") return readFileSync(0, "utf8");
  return parts.join(" ");
}

function backendOption(args, fallback) {
  const backend = takeOption(args, "--backend", fallback);
  if (backend != null && !["app-server", "ui"].includes(backend)) throw new Error("--backend must be app-server or ui.");
  return backend;
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
      if (args[0] === "help") args.shift();
      const candidate = args[0] ?? "overview";
      const topic = /^(codex:\/\/|[0-9a-f]{8}-)/i.test(candidate) ? "send" : candidate;
      const data = helpData(topic);
      success("help", data, json);
      if (!json) console.log(renderHelp(data));
      return;
    }

    let command = args.shift();
    if (command === "instructions") {
      const action = args.shift();
      if (action === "list") {
        const all = takeFlag(args, "--all");
        if (args.length !== 1) throw new Error("Expected: instructions list <THREAD> [--all].");
        const data = await listInstructions(args[0], { all });
        success("instructions.list", data, json);
        if (!json) { for (const entry of data.instructions) console.log(`${entry.id}  ${entry.instruction_status}  ${entry.metadata?.source ?? "unspecified"}\n${entry.body}`); if (data.pending_changes.length) console.log(`配送未確認: ${data.pending_changes.map(e => e.id).join(", ")}`); }
        return;
      }
      if (action !== "retract") throw new Error("See codex-steer help instructions.");
      const reason = takeOption(args, "--reason", undefined), source = takeOption(args, "--source", undefined), basedOn = takeOption(args, "--based-on", undefined);
      const dryRun = takeFlag(args, "--dry-run"), newTurn = takeFlag(args, "--new-turn");
      if (args.length !== 2 || !reason?.trim()) throw new Error("Expected: instructions retract <THREAD> <MESSAGE-ID> --reason TEXT.");
      const data = await sendTrackedMessage(args[0], reason, { retracts: args[1], source, basedOn, dryRun, newTurn });
      success("instructions.retract", data, json);
      if (!json) console.log(dryRun ? "撤回の送信プレビューです。" : `撤回を受け付けました。message_id: ${data.message_id}`);
      return;
    }
    if (command === "history") {
      const action = args.shift();
      const includeText = takeFlag(args, "--include-text");
      const pending = takeFlag(args, "--pending");
      const report = action === "mark" ? { status: takeOption(args, "--status", undefined), note: takeOption(args, "--note", undefined), evidence: takeOptions(args, "--evidence"), by: takeOption(args, "--by", "local") } : {};
      const [threadId, id] = args;
      if (!threadId || args.length > 2 || !["list", "show", "check", "mark"].includes(action) || (["show", "mark"].includes(action) && !id) || (action === "list" && id)) throw new Error("See codex-steer help history.");
      const data = action === "list" ? await listMessages(threadId, { includeText, pending }) : action === "show" ? messageSummary(await getMessage(threadId, id), includeText) : action === "check" ? await reconcileMessages(threadId, id, { includeText }) : await markMessage(threadId, id, report);
      success(`history.${action}`, data, json);
      if (!json) for (const entry of Array.isArray(data) ? data : [data]) console.log(`${entry.id}  ${entry.delivery_status}  history:${entry.verification?.status ?? "unchecked"}  response:${entry.response.status}${entry.body ? "\n" + entry.body : ""}`);
      return;
    }
    if (["read", "status", "watch"].includes(command)) {
      const options = command === "status" ? {} : {
        since: takeOption(args, "--since", undefined),
        limit: Number(takeOption(args, "--limit", "50")),
        maxChars: Number(takeOption(args, "--max-chars", "2000")),
        includeOutput: takeFlag(args, "--include-output"),
      };
      if (command === "watch") Object.assign(options, { watch: true, until: takeOption(args, "--until", "change"), timeoutMs: Number(takeOption(args, "--timeout-ms", "30000")), pollMs: Number(takeOption(args, "--poll-ms", "1000")) });
      if (args.length !== 1) throw new Error(`Expected: ${command} <THREAD>. See codex-steer help ${command}.`);
      const data = await observeThread(args[0], options);
      if (command === "status") delete data.events;
      success(command, data, json);
      if (!json) printObservation(data, command === "status");
      return;
    }
    if (command === "doctor") {
      const backend = backendOption(args, "app-server");
      if (args.length) throw new Error(`Unexpected argument: ${args[0]}`);
      const report = backend === "ui" ? desktopDoctor() : await appServerDoctor();
      report.default_send_backend = DEFAULT_SEND_BACKEND;
      report.rollout_status = "enabled";
      success("doctor", report, json);
      if (!json) {
        console.log(`${report.backend}: ${report.ready ? "ready" : "not ready"}`);
        for (const [name, ok] of Object.entries(report.checks)) {
          console.log(`  ${ok ? "ok" : "missing"}  ${name}`);
        }
        if (report.remediation) console.log(`\n${report.remediation}`);
      }
      if (!report.ready) process.exitCode = 1;
      return;
    }

    if (command === "desktop") {
      if (args.shift() !== "start") throw new Error("Expected: codex-steer desktop start");
      const dryRun = takeFlag(args, "--dry-run");
      if (args.length) throw new Error(`Unexpected argument: ${args[0]}`);
      const data = await startDesktop({ dryRun });
      success("desktop.start", data, json);
      if (!json) console.log(dryRun ? "Dry run: would launch Desktop with the shared App Server wrapper." : "Desktop shared App Server is ready.");
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
    const backend = backendOption(args, DEFAULT_SEND_BACKEND);
    const newTurn = takeFlag(args, "--new-turn");
    const directive = { source: takeOption(args, "--source", undefined), kind: takeOption(args, "--kind", undefined), evidence: takeOptions(args, "--evidence"), basedOn: takeOption(args, "--based-on", undefined), supersedes: takeOption(args, "--supersedes", undefined), expiresAt: takeOption(args, "--expires-at", undefined) };
    if (backend === "ui" && (directive.source || directive.kind || directive.evidence.length || directive.basedOn || directive.supersedes || directive.expiresAt)) throw new Error("Directive metadata requires --backend app-server.");
    const keepFocus = takeFlag(args, "--keep-focus");
    const waitInput = takeOption(args, "--wait-ms", undefined);
    if (backend !== "ui" && (keepFocus || waitInput != null)) throw new Error("--keep-focus and --wait-ms require --backend ui.");
    const waitMs = Number(waitInput ?? "1500");
    const threadInput = args.shift();
    if (!threadInput) throw new Error("send requires a thread ID or codex://threads URL.");
    const message = readMessage(args);
    if (message.trim() === "") throw new Error("send requires a non-empty message.");
    const threadId = normalizeThreadId(threadInput);
    const data = backend === "app-server"
      ? await sendTrackedMessage(threadId, message, { dryRun, newTurn, ...directive })
      : sendDesktopMessage(threadId, message, { dryRun, waitMs, newTurn, keepFocus });
    success("send", data, json);
    if (!json) {
      console.log(dryRun
        ? `Dry run: would ${newTurn ? "start a new turn in" : "steer"} ${threadId} (${data.message_characters} characters)`
        : backend === "ui"
          ? `Submitted through Desktop UI for ${threadId}; delivery is unverified.`
          : `App Server accepted input for ${threadId} (turn ${data.turn_id}).`);
      if (data.message_id) console.log(`message_id: ${data.message_id}`);
    }
  } catch (error) {
    fail(error, json);
  }
}
