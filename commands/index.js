// commands/index.js
// The list of slash commands, and the router that runs the right one.
//
// To add a command:
//   1. Copy commands/help.js to commands/yourcommand.js and change it.
//   2. Add it to the COMMANDS list below.
//   3. Run `npm run register` so Discord knows about it.

const { config: defaultConfig } = require("../lib/config");
const { safeGetSupabase } = require("../lib/supabase");
const { isAdminInteraction } = require("../lib/permissions");
const replies = require("../lib/replies");

const COMMANDS = [
  require("./stats"),
  require("./leaderboard"),
  require("./link"),
  require("./ask"),
  require("./mod"),
  require("./help"),
];

function enabledCommands(cfg = defaultConfig) {
  return COMMANDS.filter((command) => !command.isEnabled || command.isEnabled(cfg));
}

// The JSON Discord needs to register the commands.
function getCommandDefinitions(cfg = defaultConfig) {
  return enabledCommands(cfg).map((command) => command.definition(cfg));
}

const SUBCOMMAND = 1;

function buildContext(interaction, cfg, db) {
  const user = (interaction.member && interaction.member.user) || interaction.user || {};
  const topOptions = (interaction.data && interaction.data.options) || [];
  const sub = topOptions.find((option) => option.type === SUBCOMMAND);
  const options = sub ? sub.options || [] : topOptions;
  return {
    interaction,
    cfg,
    db, // Supabase client, or null when no database is connected
    userId: user.id ? String(user.id) : "",
    username: user.global_name || user.username || "someone",
    isAdmin: isAdminInteraction(interaction),
    subcommand: sub ? sub.name : null,
    commandDefinitions: getCommandDefinitions(cfg),
    getOption(name) {
      const found = options.find((option) => option.name === name);
      return found ? found.value : undefined;
    },
  };
}

// Runs one slash command. Always returns { response, background? }:
//   response   - sent to Discord right away (must happen within 3 seconds)
//   background - optional async function that runs after the response is sent
async function routeCommand(interaction, deps = {}) {
  const cfg = deps.cfg || defaultConfig;
  const name = interaction && interaction.data && interaction.data.name;
  const command = enabledCommands(cfg).find((c) => c.name === name);
  if (!command) {
    return { response: replies.message("I don't know that command. Try /help.", { ephemeral: true }) };
  }
  try {
    const db = "db" in deps ? deps.db : safeGetSupabase();
    const result = await command.run(buildContext(interaction, cfg, db));
    return result && result.response ? result : { response: result };
  } catch (err) {
    console.error(`[/${name}] failed:`, err);
    return {
      response: replies.message("Something went wrong running that command. An admin can check the server logs.", {
        ephemeral: true,
      }),
    };
  }
}

module.exports = { COMMANDS, enabledCommands, getCommandDefinitions, routeCommand, buildContext };
