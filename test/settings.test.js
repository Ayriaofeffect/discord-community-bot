const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../lib/config");
const { loadSettings, mergeStoredSettings, defaultStoredSettings, addRule, removeRule, toggleId } = require("../lib/settings");
const { createFakeDb, withEnv, IDS } = require("./helpers/fakes");

const cfg = loadConfig({ moderation: { rules: ["Default rule"] } });

test("without a database, settings come from bot.config.js plus env vars", async () => {
  await withEnv({ MOD_SKIP_CHANNEL_IDS: `${IDS.channel}, ${IDS.channel}`, MOD_SKIP_USER_IDS: undefined }, async () => {
    const settings = await loadSettings({ db: null, cfg });
    assert.equal(settings.source, "bot.config.js");
    assert.deepEqual(settings.rules, ["Default rule"]);
    assert.deepEqual(settings.skipChannelIds, [IDS.channel]); // de-duplicated
    assert.deepEqual(settings.stored.skipChannelIds, []); // env extras are not "stored"
  });
});

test("database rows replace defaults; missing rows keep defaults", async () => {
  const db = createFakeDb(() => ({ data: [{ key: "skip_user_ids", value: [IDS.user] }], error: null }));
  const settings = await loadSettings({ db, cfg });
  assert.equal(settings.source, "database");
  assert.deepEqual(settings.rules, ["Default rule"]);
  assert.deepEqual(settings.skipUserIds, [IDS.user]);
  assert.equal(db.queries[0].table, "bot_config");
});

test("a database error falls back to bot.config.js", async () => {
  const db = createFakeDb(() => ({ data: null, error: { message: "relation does not exist" } }));
  const settings = await loadSettings({ db, cfg });
  assert.match(settings.source, /database error/);
  assert.deepEqual(settings.rules, ["Default rule"]);
});

test("bad rows are ignored", () => {
  const merged = mergeStoredSettings(defaultStoredSettings(cfg), [{ key: "moderation_rules", value: "not a list" }]);
  assert.deepEqual(merged.rules, ["Default rule"]);
});

test("rule and ID helpers", () => {
  assert.deepEqual(addRule(["a"], "  be   nice "), { ok: true, rules: ["a", "be nice"], rule: "be nice" });
  assert.equal(addRule([], "").ok, false);
  assert.deepEqual(removeRule(["a", "b"], 1), { ok: true, rules: ["b"], removed: "a" });
  assert.equal(removeRule(["a"], 5).ok, false);
  assert.deepEqual(toggleId([], IDS.user), { list: [IDS.user], added: true });
  assert.deepEqual(toggleId([IDS.user], IDS.user), { list: [], added: false });
});
