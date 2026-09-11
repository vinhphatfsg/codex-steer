import { collectEvidence, verifyEvidence } from "./evidence.mjs";
import { decodeCursor, threadSnapshot, fetchThread } from "./observe.mjs";

export const kindLabels = { decision: "ユーザー決定の伝達", review: "レビュー", hypothesis: "仮説（未確定）", suggestion: "任意提案" };

export async function prepareDirective(threadId, body, options, id) {
  const { source, kind, evidence = [], basedOn } = options;
  if (!source && !kind && !evidence.length && !basedOn) return { wireText: body, metadata: null };
  if (kind && !Object.hasOwn(kindLabels, kind)) throw new Error("--kind must be decision, review, hypothesis, or suggestion.");
  if (source != null && (!source.trim() || source.length > 80 || /[\r\n\x00-\x1f]/.test(source))) throw new Error("--source must be a non-empty single line (up to 80 characters).");
  const observed = basedOn ? decodeCursor(basedOn, threadId) : null;
  const refs = await collectEvidence(evidence);
  const metadata = { source: source ?? "external", kind: kind ?? "review", evidence: refs, based_on: basedOn ?? null };
  const lines = [`[codex-steer ${id}]`, `送信者: ${metadata.source}`, `種類: ${kindLabels[metadata.kind]}`];
  for (const ref of refs) lines.push(`根拠: ${JSON.stringify(ref.ref)}${ref.sha256 ? ` (sha256:${ref.sha256})` : " (参照URL)"}`);
  if (observed) lines.push(`観測対象ターン: ${observed.active_turn_id ?? "停止中"}`);
  return { metadata, wireText: lines.join("\n") + "\n\n" + body, async beforeSend(thread, client) {
    if (observed) {
      if (thread.historyMode === "paginated" || thread.turns?.some(t => t.itemsView && t.itemsView !== "full")) thread = await fetchThread(client, threadId);
      const current = threadSnapshot(thread);
      if (current.user_revision !== observed.user_revision || current.state.active_turn_id !== observed.active_turn_id) throw Object.assign(new Error("New user input or a different turn was observed. Read the task again before sending."), { code: "STALE_OBSERVATION" });
    }
    await verifyEvidence(refs);
  } };
}
