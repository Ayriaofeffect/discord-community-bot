// commands/link.js — /link: connect your Discord account to your app account.
//
// Two ways to link (bot.config.js -> linking.method):
//   "code" (default): your app shows the player a one-time code. Safer.
//   "name": the player types their username. Easier, but anyone could claim
//           a name that isn't linked yet.

const { NO_DATABASE_MESSAGE } = require("../lib/supabase");
const { linkDiscordAccount } = require("../lib/players");
const { syncLevelRoles } = require("../lib/roles");
const { cleanName, truncate } = require("../lib/format");
const replies = require("../lib/replies");

function optionName(cfg) {
  return cfg.linking.method === "code" ? "code" : "name";
}

function howToLink(cfg) {
  return cfg.linking.method === "code"
    ? `You haven't linked your account yet. Get a link code in ${cfg.appName}, then use \`/link code:YOURCODE\`.`
    : `You haven't linked your account yet. Use \`/link name:your-${cfg.appName}-username\`.`;
}

module.exports = {
  name: "link",
  howToLink,

  definition: (cfg) => ({
    name: "link",
    type: 1,
    description: truncate(`Link your Discord account to your ${cfg.appName} account`, 100),
    contexts: [0],
    options: [
      {
        name: optionName(cfg),
        description: truncate(
          cfg.linking.method === "code" ? `The link code from ${cfg.appName}` : `Your ${cfg.appName} username`,
          100
        ),
        type: 3, // text
        required: true,
        max_length: 100,
      },
    ],
  }),

  async run(ctx) {
    const { cfg } = ctx;
    if (!ctx.db) return replies.message(NO_DATABASE_MESSAGE, { ephemeral: true });

    const input = ctx.getOption(optionName(cfg));
    const result = await linkDiscordAccount(ctx.db, { input, discordId: ctx.userId }, cfg);
    const say = (text) => replies.message(text, { ephemeral: true });

    switch (result.status) {
      case "linked": {
        const player = result.player;
        return {
          response: say(`✅ Linked to **${cleanName(player.name)}**! Try \`/stats\`.`),
          // Give level roles right away (if roleRewards are set up).
          background: async () => {
            const roles = await syncLevelRoles({ discordId: ctx.userId, level: player.level, cfg });
            if (!roles.skipped) console.log("[/link] Synced level roles:", roles);
          },
        };
      }
      case "already_linked":
        return say(
          result.player
            ? `You're already linked to **${cleanName(result.player.name)}**. To change it, ask an admin.`
            : "This Discord account is already linked to a player. To change it, ask an admin."
        );
      case "not_found":
        return say(
          cfg.linking.method === "code"
            ? `That code didn't work. Check it in ${cfg.appName} and try again. Each code works once.`
            : `I couldn't find an unlinked player named **${cleanName(input)}**. Names must match exactly.`
        );
      case "ambiguous":
        return say("More than one player matches that. Please ask an admin for help.");
      default:
        return say(howToLink(cfg));
    }
  },
};
