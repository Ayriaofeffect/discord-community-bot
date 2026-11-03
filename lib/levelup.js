// lib/levelup.js
// Level-up detection and duplicate protection for the database webhook.
//
// Supabase database webhooks send JSON like:
//   { "type": "UPDATE", "table": "players", "record": {...new row...}, "old_record": {...old row...} }

const { config: defaultConfig } = require("./config");
const { databaseError } = require("./supabase");

// Returns { event } when a player's level went up, or { skip: "why not" }.
function detectLevelUp(payload, cfg = defaultConfig) {
  const p = cfg.players;
  if (!payload || typeof payload !== "object") return { skip: "Body is not a database webhook payload." };
  if (payload.type !== "UPDATE") return { skip: `Ignoring ${payload.type || "unknown"} event (only UPDATE is used).` };
  if (payload.table && payload.table !== p.table) {
    return { skip: `Ignoring table "${payload.table}" (players.table in bot.config.js is "${p.table}").` };
  }

  const record = payload.record;
  const old = payload.old_record;
  if (!record || !old) return { skip: "Missing record or old_record." };
  if (record[p.idColumn] === undefined || record[p.idColumn] === null) {
    return { skip: `Row has no "${p.idColumn}" column. Check players.idColumn in bot.config.js.` };
  }

  const newLevel = Number(record[p.levelColumn]);
  const oldLevel = Number(old[p.levelColumn] ?? 0);
  if (!Number.isFinite(newLevel) || !Number.isFinite(oldLevel)) {
    return { skip: `Column "${p.levelColumn}" is missing or not a number. Check players.levelColumn.` };
  }
  if (newLevel <= oldLevel) return { skip: "Level did not go up." };

  const discordId = record[p.discordIdColumn];
  return {
    event: {
      playerId: String(record[p.idColumn]),
      name: record[p.nameColumn],
      oldLevel,
      newLevel,
      discordId: discordId ? String(discordId) : null,
    },
  };
}

function dedupeKey(event) {
  return `levelup:${event.playerId}:${event.newLevel}`;
}

// Webhooks can arrive twice. We insert a row with a unique key first:
// the first insert wins (returns true); a repeat hits the unique key (false).
async function claimAnnouncement(db, key, cfg = defaultConfig) {
  const { error } = await db.from(cfg.tables.announcements).insert({ dedupe_key: key });
  if (!error) return true;
  if (error.code === "23505") return false; // unique_violation = already announced
  throw databaseError("record the announcement", error);
}

module.exports = { detectLevelUp, dedupeKey, claimAnnouncement };
