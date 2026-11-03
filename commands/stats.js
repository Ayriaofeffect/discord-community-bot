// commands/stats.js — /stats: show your own stats from the app.

const { NO_DATABASE_MESSAGE } = require("../lib/supabase");
const { findPlayerByDiscordId, getLeaderboardPosition } = require("../lib/players");
const { formatStats, truncate } = require("../lib/format");
const replies = require("../lib/replies");
const { howToLink } = require("./link");

module.exports = {
  name: "stats",

  definition: (cfg) => ({
    name: "stats",
    type: 1,
    description: truncate(`See your ${cfg.appName} stats`, 100),
    contexts: [0],
  }),

  async run(ctx) {
    if (!ctx.db) return replies.message(NO_DATABASE_MESSAGE, { ephemeral: true });

    const player = await findPlayerByDiscordId(ctx.db, ctx.userId, ctx.cfg);
    if (!player) return replies.message(howToLink(ctx.cfg), { ephemeral: true });

    const position = await getLeaderboardPosition(ctx.db, player, ctx.cfg);
    return replies.embed(formatStats(player, position, ctx.cfg));
  },
};
