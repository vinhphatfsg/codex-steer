import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { normalizeThreadId } from "./thread-id.mjs";
import { discoverRuntime } from "./runtime.mjs";
import { RpcClient } from "./rpc.mjs";

export const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const mutableStatus = new Set(["inProgress", "running", "pending"]);
function invalidCursor() { return Object.assign(new Error("Cursor is invalid or history changed. Read again without --since."), { code: "STALE_CURSOR" }); }

export function decodeCursor(value, threadId) {
  try {
    if (typeof value !== "string" || value.length > 1024 * 1024) throw invalidCursor();
    const c = JSON.parse(Buffer.from(value, "base64url").toString());
    if (c.v !== 1 || c.thread_id !== threadId || !Number.isSafeInteger(c.count) || c.count < 0 || !Array.isArray(c.open)
      || !c.open.every(x => Number.isSafeInteger(x.index) && x.index >= 0 && x.index < c.count && typeof x.hash === "string")
      || new Set(c.open.map(x => x.index)).size !== c.open.length || typeof c.prefix !== "string") throw invalidCursor();
    return c;
  } catch { throw invalidCursor(); }
}

function project(item, turnId) {
  if (!item?.id || ["reasoning", "hookPrompt"].includes(item.type)) return null;
  const event = { id: item.id, turn_id: turnId, type: item.type };
  if (item.type === "userMessage") {
    event.client_message_id = item.clientId ?? null;
    event.text = (item.content ?? []).filter(x => x.type === "text").map(x => x.text).join("\n");
    event.attachments = (item.content ?? []).filter(x => x.type !== "text").map(x => ({ type: x.type, path: x.path ?? null, url: x.url ?? null }));
  } else if (item.type === "agentMessage" || item.type === "plan") {
    event.text = item.text; event.phase = item.phase ?? null;
    if (item.questions) event.questions = item.questions;
  } else if (item.type === "commandExecution") {
    Object.assign(event, { command: item.command, cwd: item.cwd, status: item.status, exit_code: item.exitCode ?? null, output: item.aggregatedOutput ?? "" });
  } else if (item.type === "fileChange") {
    event.status = item.status;
    event.changes = (item.changes ?? []).map(x => ({ path: x.path, kind: x.kind, diff: x.diff }));
  } else {
    // Only public metadata: never expose reasoning, arbitrary tool arguments or blobs.
    for (const key of ["status", "tool", "server", "path", "query", "text"]) if (item[key] != null) event[key] = item[key];
  }
  return event;
}

export function threadSnapshot(thread) {
  const events = [];
  for (const turn of thread.turns ?? []) {
    if (turn.itemsView && turn.itemsView !== "full") throw new Error("Incomplete turn history. Cannot produce a reliable cursor.");
    events.push({ id: turn.id, turn_id: turn.id, type: "turn", status: turn.status });
    for (const item of turn.items ?? []) { const event = project(item, turn.id); if (event) events.push(event); }
  }
  const active = (thread.turns ?? []).filter(t => t.status === "inProgress");
  const flags = thread.status?.activeFlags;
  const state = { thread_id: thread.id, status: thread.status?.type ?? "unknown", active_turn_id: active.length === 1 ? active[0].id : null,
    attention: Array.isArray(flags) ? flags : thread.status?.type === "active" ? null : [], cwd: thread.cwd ?? null, title: thread.name ?? null };
  return { state, events, hashes: events.map(digest), user_revision: digest(events.filter(e => e.type === "userMessage")) };
}

function prefixHash(hashes, count, open) {
  const excluded = new Set(open.map(x => x.index));
  return digest(hashes.slice(0, count).map((h, i) => excluded.has(i) ? null : h));
}

function trimEvent(event, maxChars, includeOutput) {
  const copy = { ...event };
  const clip = value => typeof value === "string" && value.length > maxChars ? value.slice(0, maxChars) + "\n[truncated]" : value;
  for (const key of ["text", "command"]) if (key in copy) copy[key] = clip(copy[key]);
  if ("output" in copy) { if (includeOutput) copy.output = clip(copy.output); else delete copy.output; }
  if (copy.changes) copy.changes = copy.changes.map(x => ({ path: x.path, kind: x.kind, ...(includeOutput ? { diff: clip(x.diff) } : {}) }));
  return copy;
}

export function readSnapshot(thread, { since, limit = 50, maxChars = 2000, includeOutput = false } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(maxChars) || maxChars < 100 || maxChars > 20000) throw new Error("Invalid read limit or max-chars.");
  const s = threadSnapshot(thread), old = since ? decodeCursor(since, thread.id) : null;
  if (old && (old.count > s.events.length || prefixHash(s.hashes, old.count, old.open) !== old.prefix)) throw invalidCursor();
  const updates = old ? old.open.filter(x => s.hashes[x.index] !== x.hash).map(x => x.index) : [];
  const added = Array.from({ length: s.events.length - (old?.count ?? Math.max(0, s.events.length - limit)) }, (_, i) => i + (old?.count ?? Math.max(0, s.events.length - limit)));
  const selected = [...updates, ...added].slice(0, limit), selectedSet = new Set(selected);
  const count = old ? Math.max(old.count, ...selected.map(i => i + 1)) : s.events.length;
  const open = [];
  for (let i = 0; i < count; i++) {
    const pending = old?.open.find(x => x.index === i && s.hashes[i] !== x.hash && !selectedSet.has(i));
    if (pending || mutableStatus.has(s.events[i].status) || i === count - 1) open.push({ index: i, hash: pending?.hash ?? s.hashes[i] });
  }
  const stateHash = digest(s.state);
  const cursor = Buffer.from(JSON.stringify({ v: 1, thread_id: thread.id, count, open, prefix: prefixHash(s.hashes, count, open), state: stateHash,
    active_turn_id: s.state.active_turn_id, user_revision: s.user_revision })).toString("base64url");
  return { ...s.state, events: selected.map(i => ({ ...trimEvent(s.events[i], maxChars, includeOutput), change: old && i < old.count ? "updated" : "added" })),
    running_commands: s.events.filter(e => e.type === "commandExecution" && mutableStatus.has(e.status)).map(e => trimEvent(e, maxChars, includeOutput)),
    cursor, changed: !old || selected.length > 0 || old.state !== stateHash, has_more: updates.length + added.length > selected.length,
    omitted_older_events: old ? 0 : Math.max(0, s.events.length - limit), observed_at: new Date().toISOString() };
}

export async function fetchThread(client, threadId, metadata) {
  let thread = metadata ?? (await client.request("thread/read", { threadId, includeTurns: false })).thread;
  if (thread?.id !== threadId || !Array.isArray(thread.turns)) throw new Error("App Server returned invalid task history.");
  if (thread.historyMode === "paginated") {
    const turns = [], seen = new Set(); let cursor;
    do {
      const page = await client.request("thread/turns/list", { threadId, itemsView: "full", sortDirection: "asc", limit: 100, ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(page.data) || (page.nextCursor && seen.has(page.nextCursor))) throw new Error("Invalid history pagination.");
      turns.push(...page.data); cursor = page.nextCursor; seen.add(cursor);
    } while (cursor);
    thread = { ...thread, turns };
  } else {
    thread = (await client.request("thread/read", { threadId, includeTurns: true })).thread;
    if (thread?.id !== threadId || !Array.isArray(thread.turns)) throw new Error("App Server returned invalid task history.");
  }
  return thread;
}

export async function observeThread(threadInput, options = {}, { discover = discoverRuntime, connect = RpcClient.connect, sleep = delay, now = () => performance.now() } = {}) {
  const threadId = normalizeThreadId(threadInput);
  if (options.since) decodeCursor(options.since, threadId);
  const { paths } = await discover(); const client = await connect(paths.socket);
  try {
    if (!options.watch) return readSnapshot(await fetchThread(client, threadId), options);
    const { until = "change", timeoutMs = 30000, pollMs = 1000 } = options;
    if (!["change", "idle", "attention"].includes(until) || !Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60000 || !Number.isInteger(pollMs) || pollMs < 250 || pollMs > 10000) throw new Error("Invalid watch condition, timeout-ms or poll-ms.");
    const deadline = now() + timeoutMs;
    let baseline = options.since;
    while (true) {
      const result = readSnapshot(await fetchThread(client, threadId), { ...options, since: baseline });
      const met = until === "idle" ? ["idle", "notLoaded"].includes(result.status) : until === "attention" ? result.status === "systemError" || (result.attention?.length ?? 0) > 0 : baseline && result.changed;
      if (met) return { ...result, timed_out: false, reason: until };
      if (!baseline) baseline = result.cursor;
      if (now() >= deadline) return { ...readSnapshot(await fetchThread(client, threadId), { ...options, since: baseline }), timed_out: true, reason: "timeout" };
      await sleep(Math.min(pollMs, Math.max(0, deadline - now())));
    }
  } finally { client.close(); }
}

export function printObservation(data, statusOnly = false) {
  console.log(`${data.thread_id}  ${data.status}${data.attention?.length ? "  " + data.attention.join(", ") : ""}`);
  if (data.active_turn_id) console.log(`turn: ${data.active_turn_id}`);
  if (!statusOnly) for (const event of data.events) console.log(`[${event.type}${event.status ? ":" + event.status : ""}] ${event.text ?? event.command ?? event.changes?.map(x => x.path).join(", ") ?? event.id}${event.output ? "\n" + event.output : ""}`);
  if (data.reason) console.log(`reason: ${data.reason}`);
  if (data.has_more) console.log("未取得の項目があります。cursorで続きを取得してください。");
  console.log(`cursor: ${data.cursor}`);
}
