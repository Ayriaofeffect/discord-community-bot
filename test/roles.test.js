const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../lib/config");
const { computeRoleChanges, syncLevelRoles } = require("../lib/roles");
const { withEnv, IDS } = require("./helpers/fakes");

const rewards = [
  { level: 5, roleId: IDS.role5 },
  { level: 10, roleId: IDS.role10 },
];

test("keeps only the highest earned role by default", () => {
  assert.deepEqual(computeRoleChanges({ currentRoleIds: [IDS.role5, "999"], level: 12, rewards }), {
    add: [IDS.role10],
    remove: [IDS.role5],
  });
});

test("can keep every earned role", () => {
  assert.deepEqual(computeRoleChanges({ currentRoleIds: [], level: 12, rewards, keepLowerRoles: true }), {
    add: [IDS.role5, IDS.role10],
    remove: [],
  });
});

test("does nothing below the first reward, and removes rewards you no longer qualify for", () => {
  assert.deepEqual(computeRoleChanges({ currentRoleIds: [], level: 2, rewards }), { add: [], remove: [] });
  assert.deepEqual(computeRoleChanges({ currentRoleIds: [IDS.role10], level: 6, rewards }), {
    add: [IDS.role5],
    remove: [IDS.role10],
  });
});

test("syncLevelRoles skips politely when it isn't set up", async () => {
  const none = loadConfig({});
  assert.match((await syncLevelRoles({ discordId: IDS.user, level: 5, cfg: none })).skipped, /No roleRewards/);

  const withRewards = loadConfig({ levelUp: { roleRewards: rewards } });
  await withEnv({ DISCORD_TOKEN: undefined, DISCORD_GUILD_ID: undefined }, async () => {
    assert.match((await syncLevelRoles({ discordId: IDS.user, level: 5, cfg: withRewards })).skipped, /DISCORD_TOKEN/);
  });
});

test("syncLevelRoles applies the changes through the Discord API", async () => {
  const calls = [];
  const api = {
    getGuildMember: async () => ({ roles: [IDS.role5] }),
    addMemberRole: async (...args) => calls.push(["add", ...args.slice(0, 3)]),
    removeMemberRole: async (...args) => calls.push(["remove", ...args.slice(0, 3)]),
  };
  const cfg = loadConfig({ levelUp: { roleRewards: rewards } });
  await withEnv({ DISCORD_TOKEN: "token-for-tests", DISCORD_GUILD_ID: IDS.guild }, async () => {
    const result = await syncLevelRoles({ discordId: IDS.user, level: 10, cfg, api });
    assert.deepEqual(result, { added: [IDS.role10], removed: [IDS.role5] });
  });
  assert.deepEqual(calls, [
    ["add", IDS.guild, IDS.user, IDS.role10],
    ["remove", IDS.guild, IDS.user, IDS.role5],
  ]);
});
