// commands/leaderboard.js — /leaderboard: the top players by score.

const { NO_DATABASE_MESSAGE } = require("../lib/supabase");
const { getTopPlayers } = require("../lib/players");
const { formatLeaderboard, truncate } = require("../lib/format");
const replies = require("../lib/replies");

module.exports = {
  name: "leaderboard",

  definition: (cfg) => ({
    name: "leaderboard",
    type: 1,
    description: truncate(`See the top ${cfg.appName} players`, 100),
    contexts: [0],
  }),

  async run(ctx) {
    if (!ctx.db) return replies.message(NO_DATABASE_MESSAGE, { ephemeral: true });
    const top = await getTopPlayers(ctx.db, ctx.cfg.leaderboard.size, ctx.cfg);
    return replies.embed(formatLeaderboard(top, ctx.cfg));
  },
};
