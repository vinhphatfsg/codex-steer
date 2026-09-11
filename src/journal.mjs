import { randomUUID } from "node:crypto";
import { sendAppServerMessage } from "./app-server.mjs";
import { normalizeThreadId } from "./thread-id.mjs";
import { digest, fetchThread } from "./observe.mjs";
import { readRecord, writeRecord, listRecords, withStoreLock } from "./store.mjs";
import { discoverRuntime } from "./runtime.mjs";
import { RpcClient } from "./rpc.mjs";
import { prepareDirective } from "./directive.mjs";

export async function getMessage(threadInput, id, options = {}) {
  const threadId = normalizeThreadId(threadInput);
  const entry = await readRecord("messages", id, options);
  if (!entry || entry.thread_id !== threadId || entry.id !== id || entry.schema !== 1) throw new Error("Message record not found for this task.");
  return entry;
}

export function messageSummary(entry, includeText = false) {
  const { body, wire_text, ...data } = entry;
  return includeText ? { ...data, body, wire_text } : data;
}

export async function listMessages(threadInput, { includeText = false, pending = false, ...options } = {}) {
  const threadId = normalizeThreadId(threadInput);
  return (await listRecords("messages", options)).filter(e => e?.thread_id === threadId && (!pending || !["applied", "dismissed"].includes(e.response?.status)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at)).map(e => messageSummary(e, includeText));
}

export async function sendTrackedMessage(threadInput, body, options = {}, { send = sendAppServerMessage, ...storage } = {}) {
  const threadId = normalizeThreadId(threadInput);
  if (options.dryRun) {
    const prepared = await prepareDirective(threadId, body, options, "preview");
    return { ...await send(threadId, prepared.wireText, options), ...(prepared.metadata ? { metadata: prepared.metadata, freshness_checked: false } : {}) };
  }
  return withStoreLock(`message-${threadId}`, async () => {
    const id = randomUUID(), created = new Date().toISOString();
    const prepared = await prepareDirective(threadId, body, options, id);
    let entry = { schema: 1, id, client_message_id: id, thread_id: threadId, created_at: created, updated_at: created, body, wire_text: prepared.wireText, metadata: prepared.metadata,
      message_sha256: digest(prepared.wireText), delivery_status: "unknown", sent: null, attempt_state: "prepared", response: { status: "unreported" } };
    await writeRecord("messages", id, entry, storage);
    try {
      const receipt = await send(threadId, prepared.wireText, { ...options, clientMessageId: id, beforeSend: prepared.beforeSend });
      entry = { ...entry, ...receipt, id, attempt_state: "finished", updated_at: new Date().toISOString() };
      try { await writeRecord("messages", id, entry, storage); } catch { return { ...receipt, message_id: id, journal_update_required: true }; }
      return { ...receipt, message_id: id };
    } catch (error) {
      entry = { ...entry, sent: Object.hasOwn(error, "sent") ? error.sent : error.uncertain ? null : false, delivery_status: error.delivery_status ?? (error.uncertain ? "unknown" : "not_sent"), attempt_state: "finished", updated_at: new Date().toISOString(), error_code: error.code ?? "NOT_SENT" };
      try { await writeRecord("messages", id, entry, storage); } catch { error.journal_update_required = true; }
      error.client_message_id = id; error.message_id = id;
      throw error;
    }
  }, storage);
}

export async function reconcileMessages(threadInput, id, options = {}, { discover = discoverRuntime, connect = RpcClient.connect } = {}) {
  const threadId = normalizeThreadId(threadInput);
  // Validate the local target before connecting.
  if (id) await getMessage(threadId, id, options);
  const { paths } = await discover(); const client = await connect(paths.socket);
  try {
    const thread = await fetchThread(client, threadId);
    return await withStoreLock(`message-${threadId}`, async () => {
      const entries = id ? [await getMessage(threadId, id, options)] : await listMessages(threadId, { ...options, includeText: true });
      const items = thread.turns.flatMap(t => t.items.map(i => ({ ...i, turn_id: t.id })));
      const result = [];
      for (const entry of entries) {
        const matches = items.filter(i => i.type === "userMessage" && i.clientId === entry.client_message_id);
        const matchingText = matches.length === 1 && digest(matches[0].content.filter(c => c.type === "text").map(c => c.text).join("\n")) === entry.message_sha256;
        const verification = { status: matchingText ? "stored" : matches.length ? "conflict" : "not_observed", checked_at: new Date().toISOString(), matching_items: matches.length };
        if (matchingText) Object.assign(verification, { item_id: matches[0].id, turn_id: matches[0].turn_id });
        const updated = { ...entry, verification, updated_at: verification.checked_at, ...(matchingText ? { delivery_status: "accepted", sent: true, turn_id: matches[0].turn_id } : {}) };
        await writeRecord("messages", entry.id, updated, options);
        result.push(messageSummary(updated, options.includeText));
      }
      return result;
    }, options);
  } finally { client.close(); }
}

export async function markMessage(threadInput, id, { status, note, evidence = [], by = "local", ...options }) {
  const threadId = normalizeThreadId(threadInput);
  if (!["acknowledged", "applied", "dismissed"].includes(status) || !note?.trim() || !by?.trim()) throw new Error("mark requires --status acknowledged|applied|dismissed and a non-empty --note.");
  if (status === "applied" && !evidence.length) throw new Error("applied requires --evidence (a test result, diff or artifact reference).");
  return withStoreLock(`message-${threadId}`, async () => {
    const entry = await getMessage(threadId, id, options);
    const response = { status, note, evidence, reported_by: by, reported_at: new Date().toISOString(), basis: "explicit_report" };
    const updated = { ...entry, response, reports: [...entry.reports ?? [], response], updated_at: response.reported_at };
    await writeRecord("messages", id, updated, options);
    return messageSummary(updated);
  }, options);
}
