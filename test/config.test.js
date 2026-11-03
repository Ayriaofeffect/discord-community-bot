const test = require("node:test");
const assert = require("node:assert/strict");
const { config, loadConfig, validateConfig, DEFAULTS } = require("../lib/config");

test("the repo's bot.config.js has no problems", () => {
  assert.deepEqual(validateConfig(config), []);
});

test("loadConfig keeps your values and fills in the rest from defaults", () => {
  const cfg = loadConfig({ appName: "Quest Log", players: { table: "profiles", scoreColumn: "points" } });
  assert.equal(cfg.appName, "Quest Log");
  assert.equal(cfg.players.table, "profiles");
  assert.equal(cfg.players.scoreColumn, "points");
  assert.equal(cfg.players.idColumn, DEFAULTS.players.idColumn);
  assert.equal(cfg.leaderboard.size, DEFAULTS.leaderboard.size);
  assert.deepEqual(validateConfig(cfg), []);
});

test("lists in your config replace the default lists", () => {
  const cfg = loadConfig({ moderation: { rules: ["Only one rule"] } });
  assert.deepEqual(cfg.moderation.rules, ["Only one rule"]);
  assert.equal(cfg.moderation.timeoutMinutes, DEFAULTS.moderation.timeoutMinutes);
});

test("the loaded config is frozen so code can't change it by accident", () => {
  const cfg = loadConfig({});
  assert.ok(Object.isFrozen(cfg));
  assert.ok(Object.isFrozen(cfg.players));
  assert.ok(Object.isFrozen(cfg.moderation.rules));
});

test("validateConfig explains common mistakes in plain English", () => {
  const problems = validateConfig(
    loadConfig({
      players: { scoreColumn: "total points" },
      linking: { method: "magic" },
      leaderboard: { size: 100 },
      levelUp: { roleRewards: [{ level: 5, roleId: "123" }] },
    })
  );
  assert.equal(problems.length, 4);
  assert.match(problems.join("\n"), /players\.scoreColumn/);
  assert.match(problems.join("\n"), /linking\.method/);
  assert.match(problems.join("\n"), /leaderboard\.size/);
  assert.match(problems.join("\n"), /roleRewards\[0\]\.roleId/);
});
