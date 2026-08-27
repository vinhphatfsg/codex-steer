import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

for (const scriptName of ["send.applescript", "inspect.applescript"]) {
  test(`${scriptName} compiles`, { skip: process.platform !== "darwin" }, async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "codex-steer-script-"));
    const source = fileURLToPath(new URL(`../scripts/${scriptName}`, import.meta.url));
    const result = spawnSync("/usr/bin/osacompile", ["-o", path.join(output, "script.scpt"), source], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  });
}
