const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../lib/config");
const { getCommandDefinitions } = require("../commands");
const { commandsUrl, registerCommands } = require("../scripts/register-commands");
const { IDS } = require("./helpers/fakes");

// Discord's rules for command names and descriptions.
function checkCommand(command, where) {
  assert.match(command.name, /^[a-z0-9_-]{1,32}$/, `${where}: bad name`);
  assert.ok(command.description.length >= 1 && command.description.length <= 100, `${where}: description length`);
  for (const option of command.options || []) checkCommand(option, `${where} ${option.name}`);
}

test("every command definition follows Discord's rules", () => {
  const long = loadConfig({ appName: "A Very Long App Name ".repeat(10).trim() });
  for (const cfg of [loadConfig({}), long]) {
    const commands = getCommandDefinitions(cfg);
    assert.equal(new Set(commands.map((c) => c.name)).size, commands.length, "names must be unique");
    for (const command of commands) checkCommand(command, `/${command.name}`);
  }
});

test("admin commands are hidden from non-admins by default", () => {
  const byName = Object.fromEntries(getCommandDefinitions(loadConfig({})).map((c) => [c.name, c]));
  assert.equal(byName.mod.default_member_permissions, "32");
  assert.equal(byName.ask.default_member_permissions, "32");
  assert.equal(byName.stats.default_member_permissions, undefined);

  const openAsk = Object.fromEntries(getCommandDefinitions(loadConfig({ assistant: { adminOnly: false } })).map((c) => [c.name, c]));
  assert.equal(openAsk.ask.default_member_permissions, undefined);
});

test("the /link option follows linking.method, and /ask can be turned off", () => {
  const byCode = getCommandDefinitions(loadConfig({})).find((c) => c.name === "link");
  assert.equal(byCode.options[0].name, "code");
  const byName = getCommandDefinitions(loadConfig({ linking: { method: "name" } })).find((c) => c.name === "link");
  assert.equal(byName.options[0].name, "name");

  const names = getCommandDefinitions(loadConfig({ assistant: { enabled: false } })).map((c) => c.name);
  assert.ok(!names.includes("ask"));
});

test("register script builds global and server URLs, and checks IDs", () => {
  assert.equal(commandsUrl(IDS.app), `https://discord.com/api/v10/applications/${IDS.app}/commands`);
  assert.equal(commandsUrl(IDS.app, IDS.guild), `https://discord.com/api/v10/applications/${IDS.app}/guilds/${IDS.guild}/commands`);
  assert.throws(() => commandsUrl("not-an-id"), /DISCORD_APP_ID/);
});

test("register script PUTs the command list with the bot token", async () => {
  const sent = [];
  const fetchImpl = async (url, options) => {
    sent.push({ url, options });
    return new Response(JSON.stringify(JSON.parse(options.body)), { status: 200 });
  };
  const commands = getCommandDefinitions(loadConfig({}));
  await registerCommands({ appId: IDS.app, token: "token-for-tests", commands, fetchImpl });
  await registerCommands({ appId: IDS.app, token: "token-for-tests", guildId: IDS.guild, commands, fetchImpl });

  assert.equal(sent[0].options.method, "PUT");
  assert.equal(sent[0].options.headers.Authorization, "Bot token-for-tests");
  assert.deepEqual(JSON.parse(sent[0].options.body)[0].contexts, [0]); // global keeps contexts
  assert.equal(JSON.parse(sent[1].options.body)[0].contexts, undefined); // server-only drops it
});
