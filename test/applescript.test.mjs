import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("AppleScript compiles", { skip: process.platform !== "darwin" }, async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "codex-steer-script-"));
  const source = fileURLToPath(new URL("../scripts/send.applescript", import.meta.url));
  const result = spawnSync("/usr/bin/osacompile", ["-o", path.join(output, "send.scpt"), source], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});
