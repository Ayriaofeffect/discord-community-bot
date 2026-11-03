// lib/players.js
// Every query against YOUR players table lives in this file.
// Table and column names come from bot.config.js (players + linking sections).
//
// Each function takes the database client first (`db`), so tests can pass a fake one.

const { config: defaultConfig } = require("./config");
const { databaseError } = require("./supabase");

// The columns we ask for. We never select "*", so private columns stay private.
function playerColumns(cfg = defaultConfig) {
  const p = cfg.players;
  const columns = [p.idColumn, p.nameColumn, p.levelColumn, p.scoreColumn, p.discordIdColumn];
  for (const { column } of p.statsColumns) columns.push(column);
  return [...new Set(columns)].join(",");
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Turns a database row into the same simple shape, whatever your columns are called.
function mapPlayer(row, cfg = defaultConfig) {
  if (!row) return null;
  const p = cfg.players;
  const discordId = row[p.discordIdColumn];
  return {
    id: row[p.idColumn],
    name: row[p.nameColumn] ?? "Unknown",
    level: toNumber(row[p.levelColumn]),
    score: toNumber(row[p.scoreColumn]),
    discordId: discordId ? String(discordId) : null,
    row,
  };
}

async function findPlayerByDiscordId(db, discordId, cfg = defaultConfig) {
  const p = cfg.players;
  const { data, error } = await db
    .from(p.table)
    .select(playerColumns(cfg))
    .eq(p.discordIdColumn, String(discordId))
    .limit(1);
  if (error) throw databaseError("look up a player by Discord ID", error);
  return mapPlayer(data && data[0], cfg);
}

async function getTopPlayers(db, limit, cfg = defaultConfig) {
  const p = cfg.players;
  const { data, error } = await db
    .from(p.table)
    .select(playerColumns(cfg))
    .order(p.scoreColumn, { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw databaseError("load the leaderboard", error);
  return (data || []).map((row) => mapPlayer(row, cfg));
}

// 1 + the number of players with a higher score.
async function getLeaderboardPosition(db, player, cfg = defaultConfig) {
  const p = cfg.players;
  const { count, error } = await db
    .from(p.table)
    .select(p.idColumn, { count: "exact", head: true })
    .gt(p.scoreColumn, player.score);
  if (error) throw databaseError("work out a leaderboard position", error);
  return (count || 0) + 1;
}

// Links a Discord account to a player.
// Returns { status, player } where status is one of:
//   "linked", "already_linked", "not_found", "ambiguous", "invalid"
async function linkDiscordAccount(db, { input, discordId }, cfg = defaultConfig) {
  const p = cfg.players;
  const { method, codeColumn } = cfg.linking;
  const value = String(input ?? "").trim();
  if (!value || value.length > 100) return { status: "invalid" };

  const existing = await findPlayerByDiscordId(db, discordId, cfg);
  if (existing) return { status: "already_linked", player: existing };

  // Step 1: find exactly one matching player.
  let find = db.from(p.table).select(playerColumns(cfg));
  if (method === "code") {
    find = find.eq(codeColumn, value.toUpperCase());
  } else {
    // "name" mode only claims players that are not linked yet.
    find = find.eq(p.nameColumn, value).is(p.discordIdColumn, null);
  }
  const { data: matches, error: findError } = await find.limit(2);
  if (findError) throw databaseError("find the player to link", findError);
  if (!matches || matches.length === 0) return { status: "not_found" };
  if (matches.length > 1) return { status: "ambiguous" };

  // Step 2: update that one row. The extra filters make the update fail safely
  // if someone else claimed the same code or name a moment earlier.
  const changes = { [p.discordIdColumn]: String(discordId) };
  if (method === "code") changes[codeColumn] = null; // codes work once
  let update = db.from(p.table).update(changes).eq(p.idColumn, matches[0][p.idColumn]);
  update = method === "code" ? update.eq(codeColumn, value.toUpperCase()) : update.is(p.discordIdColumn, null);

  const { data: updated, error: updateError } = await update.select(playerColumns(cfg));
  if (updateError) {
    if (updateError.code === "23505") return { status: "already_linked" }; // unique discord_id
    throw databaseError("save the Discord link", updateError);
  }
  if (!updated || updated.length === 0) return { status: "not_found" };
  return { status: "linked", player: mapPlayer(updated[0], cfg) };
}

module.exports = {
  playerColumns,
  mapPlayer,
  findPlayerByDiscordId,
  getTopPlayers,
  getLeaderboardPosition,
  linkDiscordAccount,
};
