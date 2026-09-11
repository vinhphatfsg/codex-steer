import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const ID = "01a04373-3770-71e0-a2e3-a3c196f5f5b1";
function cli(args, input) {
  const result = spawnSync(process.execPath, ["bin/codex-steer.mjs", "--json", ...args], { encoding: "utf8", input });
  return { status: result.status, result: JSON.parse(result.stdout), stderr: result.stderr };
}

test("default live send remains gated until CP4-CP6 pass", () => {
  const { status, result } = cli(["send", ID, "test"]);
  assert.equal(status, 1);
  assert.match(result.error.message, /awaiting real Desktop validation/);
});

test("background dry run keeps command, UUID/link, shorthand and stdin interfaces", () => {
  for (const args of [["send", ID], [`codex://threads/${ID}`]]) {
    const { status, result } = cli([...args, "-", "--dry-run", "--backend", "app-server"], "日本語\nline 2");
    assert.equal(status, 0);
    assert.equal(result.data.thread_id, ID);
    assert.equal(result.data.backend, "app-server");
    assert.equal(result.data.message_characters, 10);
    assert.equal(result.data.sent, false);
    assert.equal(JSON.stringify(result).includes("line 2"), false);
  }
});

test("UI-only flags require explicit UI backend", () => {
  for (const options of [["--keep-focus"], ["--wait-ms", "10"]]) {
    const { status, result } = cli(["send", ID, "test", "--backend", "app-server", "--dry-run", ...options]);
    assert.equal(status, 1);
    assert.match(result.error.message, /require --backend ui/);
  }
  const { result } = cli(["send", ID, "test", "--backend", "ui", "--dry-run", "--keep-focus"]);
  assert.equal(result.data.backend, "desktop-ui");
  assert.equal(result.data.focus_policy, "keep-codex-focused");
});

test("option terminator preserves literal flags in messages", () => {
  const { result } = cli(["send", ID, "--dry-run", "--", "--backend", "ui"]);
  assert.equal(result.data.backend, "app-server");
  assert.equal(result.data.message_characters, "--backend ui".length);
});

test("desktop start dry run does not launch or inspect Desktop", () => {
  const { status, result } = cli(["desktop", "start", "--dry-run"]);
  assert.equal(status, 0);
  assert.equal(result.data.started, false);
});

test("unknown backend and empty messages fail before doing any work", () => {
  assert.equal(cli(["send", ID, "x", "--backend", "typo"]).status, 1);
  assert.equal(cli(["send", ID, "", "--backend", "app-server", "--dry-run"]).status, 1);
});
