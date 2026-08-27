import test from "node:test";
import assert from "node:assert/strict";
import { buildSendPlan, sendDesktopMessage } from "../src/desktop.mjs";

const THREAD_ID = "01a04373-3770-71e0-a2e3-a3c196f5f5b1";

test("builds a redacted send plan", () => {
  const plan = buildSendPlan(THREAD_ID, "方針を変更して", 2000, {
    follow_up_mode: "queue",
    composer_enter_behavior: "enter",
    submit_shortcut: "command",
  });
  assert.equal(plan.thread_id, THREAD_ID);
  assert.equal(plan.wait_ms, 2000);
  assert.equal(plan.message_characters, 7);
  assert.equal(plan.delivery_strategy, "deep-link-prefill");
  assert.equal(plan.delivery_action, "steer");
  assert.equal(plan.submit_shortcut, "command");
  assert.equal("message" in plan, false);
});

test("uses a normal submission shortcut for a stopped thread", () => {
  const settings = {
    follow_up_mode: "queue",
    composer_enter_behavior: "enter",
    submit_shortcut: "command",
  };
  const plan = buildSendPlan(THREAD_ID, "通常送信", 1500, settings, { newTurn: true });
  assert.equal(plan.delivery_action, "new-turn");
  assert.equal(plan.submit_shortcut, "plain");
});

test("respects command-based new-turn submission settings", () => {
  const settings = {
    follow_up_mode: "queue",
    composer_enter_behavior: "cmdAlways",
    submit_shortcut: "command-shift",
  };
  const plan = buildSendPlan(THREAD_ID, "通常送信", 1500, settings, { newTurn: true });
  assert.equal(plan.submit_shortcut, "command");
});

test("dry run does not touch the desktop", () => {
  const result = sendDesktopMessage(THREAD_ID, "test", { dryRun: true });
  assert.equal(result.sent, false);
  assert.equal(result.dry_run, true);
});

test("rejects invalid wait time", () => {
  assert.throws(
    () => sendDesktopMessage(THREAD_ID, "test", { dryRun: true, waitMs: -1 }),
    /--wait-ms/,
  );
});
