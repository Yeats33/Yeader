import assert from "node:assert/strict";
import test from "node:test";

import { createAppApi } from "./api.ts";

test("createAppApi returns a reserved backend snapshot for the workbench shell", async () => {
  const api = createAppApi();
  const snapshot = await api.getAppShellSnapshot();

  assert.equal(snapshot.runtime.mode, "mock");
  assert.match(snapshot.runtime.note, /后端接口已预留/);
  assert.equal(snapshot.importChannels.length, 3);
  assert.equal(snapshot.bookshelf.length, 3);
  assert.equal(snapshot.apiCapabilities[0]?.status, "reserved");
});
