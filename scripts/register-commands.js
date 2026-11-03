// scripts/register-commands.js
// Tells Discord which slash commands this bot has.
// Run it once after setup, and again whenever you add or change a command.
//
//   npm run register            (reads your .env file)
//   npm run register -- --clear (removes all commands in that scope)
//
// Needs: DISCORD_APP_ID and DISCORD_TOKEN.
// Optional: DISCORD_GUILD_ID. With it, commands appear in that one server
// right away. Without it, they are registered globally for every server.

const { config, validateConfig } = require("../lib/config");
const { env, hasEnv } = require("../lib/env");
const { getCommandDefinitions } = require("../commands");

const API = "https://discord.com/api/v10";
const SNOWFLAKE = /^\d{17,20}$/;

function commandsUrl(appId, guildId) {
  if (!SNOWFLAKE.test(appId)) throw new Error("DISCORD_APP_ID should be the 17-20 digit Application ID.");
  if (guildId && !SNOWFLAKE.test(guildId)) throw new Error("DISCORD_GUILD_ID should be your 17-20 digit server ID.");
  return guildId ? `${API}/applications/${appId}/guilds/${guildId}/commands` : `${API}/applications/${appId}/commands`;
}

async function registerCommands({ appId, token, guildId, commands, fetchImpl = fetch }) {
  // "contexts" (where a command can be used) only applies to global commands.
  const body = guildId ? commands.map(({ contexts, ...rest }) => rest) : commands;
  const res = await fetchImpl(commandsUrl(appId, guildId), {
    method: "PUT", // PUT replaces the whole list, so removed commands disappear too
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord said ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function main(args) {
  const missing = ["DISCORD_APP_ID", "DISCORD_TOKEN"].filter((name) => !hasEnv(name));
  if (missing.length) {
    console.error(`Missing ${missing.join(" and ")}. Add them to your .env file (see .env.example).`);
    process.exitCode = 1;
    return;
  }

  const problems = validateConfig(config);
  if (problems.length) {
    console.warn("bot.config.js has problems (fix these too):");
    for (const problem of problems) console.warn(`  - ${problem}`);
  }

  const clear = args.includes("--clear");
  const guildId = env("DISCORD_GUILD_ID");
  const commands = clear ? [] : getCommandDefinitions(config);
  const scope = guildId ? "your server (DISCORD_GUILD_ID)" : "all servers (global)";

  console.log(clear ? `Removing all commands from ${scope}...` : `Registering ${commands.length} commands for ${scope}...`);
  const saved = await registerCommands({ appId: env("DISCORD_APP_ID"), token: env("DISCORD_TOKEN"), guildId, commands });
  for (const command of saved) console.log(`  /${command.name} — ${command.description}`);
  console.log(clear ? "Done. Commands removed." : "Done! Type / in your server to see them.");
  if (!guildId && !clear) console.log("Tip: global commands can take a little while to show up. Restart Discord (Ctrl+R) if needed.");
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error("Could not register commands:", err.message);
    process.exitCode = 1;
  });
}

module.exports = { registerCommands, commandsUrl, main };
