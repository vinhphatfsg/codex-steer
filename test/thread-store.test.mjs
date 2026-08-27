import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listLocalThreads } from "../src/thread-store.mjs";

test("lists local session metadata without exposing transcript content", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-steer-test-"));
  const day = path.join(root, "2026", "08", "27");
  await mkdir(day, { recursive: true });
  const id = "01a04373-3770-71e0-a2e3-a3c196f5f5b1";
  const file = path.join(day, `rollout-${id}.jsonl`);
  const metadata = {
    type: "session_meta",
    payload: {
      id,
      timestamp: "2026-08-27T00:00:00.000Z",
      cwd: "/tmp/project",
      originator: "Codex Desktop",
    },
  };
  await writeFile(file, `${JSON.stringify(metadata)}\n{"secret":"not returned"}\n`);

  const result = await listLocalThreads({ sessionsRoot: root, limit: 10, desktopOnly: true });
  assert.equal(result.length, 1);
  assert.equal(result[0].thread_id, id);
  assert.equal(result[0].cwd, "/tmp/project");
  assert.equal(JSON.stringify(result).includes("not returned"), false);
});
