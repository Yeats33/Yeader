import assert from "node:assert/strict";
import test from "node:test";

import { createAppApi } from "./api.ts";
import { renderAppShell } from "./render.ts";

test("renderAppShell includes the reserved backend modules and bookshelf preview", async () => {
  const snapshot = await createAppApi().getAppShellSnapshot();
  const html = renderAppShell(snapshot);

  assert.match(html, /Yeader Workbench/);
  assert.match(html, /书架预览/);
  assert.match(html, /书源管理/);
  assert.match(html, /搜索聚合/);
  assert.match(html, /后端接口已预留/);
});
