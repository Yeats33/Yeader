import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIG_FIELDS,
  dumpIni,
  getFieldValue,
  parseIni,
  updateConfigValue,
} from "./soNovelConfigModel.ts";

test("parseIni extracts known config fields and preserves raw lines", () => {
  const parsed = parseIni("[web]\n# comment\nport = 7765\nunknown = keep\n");
  const portField = CONFIG_FIELDS.find((field) => field.section === "web" && field.key === "port");

  assert.equal(portField !== undefined, true);
  assert.equal(getFieldValue(parsed.config, portField!), "7765");
  assert.equal(dumpIni(parsed), "[web]\n# comment\nport = 7765\nunknown = keep\n");
});

test("dumpIni writes updated known values in place", () => {
  const parsed = parseIni("[download]\nextname = epub\n");
  const updated = {
    ...parsed,
    config: updateConfigValue(parsed.config, "download", "extname", "txt"),
  };

  assert.equal(dumpIni(updated), "[download]\nextname = txt\n");
});

test("updateConfigValue ignores unknown fields", () => {
  const parsed = parseIni("[web]\nport = 7765\n");
  const updated = updateConfigValue(parsed.config, "web", "bad-key", "1");

  assert.equal(JSON.stringify(updated), JSON.stringify(parsed.config));
});
