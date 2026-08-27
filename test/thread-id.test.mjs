import test from "node:test";
import assert from "node:assert/strict";
import { normalizeThreadId, threadComposerDeepLink, threadDeepLink } from "../src/thread-id.mjs";

const THREAD_ID = "01a04373-3770-71e0-a2e3-a3c196f5f5b1";

test("normalizes a UUID", () => {
  assert.equal(normalizeThreadId(THREAD_ID.toUpperCase()), THREAD_ID);
});

test("normalizes a Codex deep link", () => {
  assert.equal(normalizeThreadId(`codex://threads/${THREAD_ID}`), THREAD_ID);
});

test("rejects unrelated URLs and invalid IDs", () => {
  assert.throws(() => normalizeThreadId("codex://new"), /Expected codex/);
  assert.throws(() => normalizeThreadId("not-a-thread"), /Invalid local Codex thread ID/);
});

test("builds a deep link", () => {
  assert.equal(threadDeepLink(THREAD_ID), `codex://threads/${THREAD_ID}`);
});

test("builds a composer-focusing deep link", () => {
  assert.equal(threadComposerDeepLink(THREAD_ID), `codex://threads/${THREAD_ID}?prompt=`);
});
