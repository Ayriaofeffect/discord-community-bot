// commands/help.js — /help: list what the bot can do.
// This is the simplest command, so it's a good one to copy for new commands.

const { truncate } = require("../lib/format");
const replies = require("../lib/replies");

module.exports = {
  name: "help",

  definition: (cfg) => ({
    name: "help",
    type: 1,
    description: truncate(`See what the ${cfg.appName} bot can do`, 100),
    contexts: [0],
  }),

  async run(ctx) {
    const { cfg } = ctx;
    const lines = ctx.commandDefinitions.map(
      (command) => `**/${command.name}** — ${command.description}${command.default_member_permissions ? " *(admins)*" : ""}`
    );
    if (cfg.moderation.enabled) lines.push("", "I also watch the chat for spam and rule breaks.");

    return replies.embed(
      {
        title: `${cfg.appName} bot`,
        description: lines.join("\n"),
        color: cfg.embedColor,
        footer: {
          text: ctx.db
            ? "Database: connected"
            : "Database: not connected yet, so /stats, /leaderboard and /link are off",
        },
      },
      { ephemeral: true }
    );
  },
};
