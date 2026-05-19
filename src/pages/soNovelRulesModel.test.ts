import assert from "node:assert/strict";
import test from "node:test";
import {
  activeRuleFileName,
  customOnlyRules,
  isOfficialActive,
  isOfficialInstalled,
  officialRuleNameForLabel,
  validateRuleImport,
} from "./soNovelRulesModel.ts";

test("official rule helpers map labels to installed rule names", () => {
  assert.equal(officialRuleNameForLabel("main.json"), "main");
  assert.equal(isOfficialInstalled("main.json", ["main"]), true);
  assert.equal(isOfficialInstalled("main.json", ["custom"]), false);
});

test("customOnlyRules filters bundled official rule names", () => {
  assert.equal(JSON.stringify(customOnlyRules(["main", "my-rule", "rate-limit"])), JSON.stringify(["my-rule"]));
});

test("active rule helpers use json file names", () => {
  assert.equal(activeRuleFileName("my-rule"), "my-rule.json");
  assert.equal(isOfficialActive("main.json", "main.json"), true);
  assert.equal(isOfficialActive("main.json", "cloudflare.json"), false);
});

test("validateRuleImport rejects empty or unsafe imports", () => {
  assert.equal(validateRuleImport("", "{}"), "请输入规则名称");
  assert.equal(validateRuleImport("bad/name", "{}"), "规则名称只能包含字母、数字、下划线和短横线");
  assert.equal(validateRuleImport("safe-name", ""), "请输入 JSON 内容");
  assert.equal(validateRuleImport("safe-name", "{}"), null);
});
