// lib/format.js
// Pure helpers that turn data into Discord text and embeds.
// "Pure" means no network or database calls, which makes them easy to test.

const MEDALS = ["🥇", "🥈", "🥉"];

function truncate(text, max) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Stops names like "*bob*" or "[click](link)" from changing Discord formatting.
function escapeMarkdown(text) {
  return String(text ?? "").replace(/([\\*_~`|>[\]])/g, "\\$1");
}

// Makes a player name safe to show: one line, not too long, no formatting tricks.
function cleanName(name, max = 64) {
  const oneLine = String(name ?? "").replace(/\s+/g, " ").trim() || "Unknown";
  return escapeMarkdown(truncate(oneLine, max));
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("en-US") : "0";
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return truncate(JSON.stringify(value), 1024);
  return escapeMarkdown(truncate(value, 1000));
}

// Fills in {placeholders}. Unknown placeholders are left as they are.
// Values are inserted once, so a value containing "{x}" is never expanded again.
function renderTemplate(template, vars = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) && vars[key] !== null && vars[key] !== undefined
      ? String(vars[key])
      : match
  );
}

// players: objects from lib/players.js mapPlayer() -> { name, score, ... }
function formatLeaderboard(players, cfg) {
  const label = cfg.leaderboard.scoreLabel;
  if (!players || players.length === 0) {
    return {
      title: `🏆 ${cfg.appName} leaderboard`,
      description: "Nobody is on the leaderboard yet.",
      color: cfg.embedColor,
    };
  }
  const lines = players.map((player, index) => {
    const place = MEDALS[index] || `**${index + 1}.**`;
    return `${place} **${cleanName(player.name)}** — ${formatNumber(player.score)} ${label}`;
  });
  return {
    title: `🏆 ${cfg.appName} leaderboard`,
    description: truncate(lines.join("\n"), 4096),
    color: cfg.embedColor,
    footer: { text: `Top ${players.length} by ${label}` },
  };
}

function formatStats(player, position, cfg) {
  const fields = cfg.players.statsColumns.map(({ column, label }) => ({
    name: truncate(label, 256),
    value: formatValue(player.row ? player.row[column] : undefined),
    inline: true,
  }));
  if (position) fields.push({ name: "Leaderboard", value: `#${formatNumber(position)}`, inline: true });
  return {
    title: truncate(`${String(player.name ?? "Unknown").replace(/\s+/g, " ")} — ${cfg.appName} stats`, 256),
    color: cfg.embedColor,
    fields: fields.slice(0, 25),
  };
}

// event: { name, oldLevel, newLevel, discordId } from lib/levelup.js
// Returns a Discord message body. allowed_mentions makes sure only the player
// can be pinged, even if their name is "@everyone".
function buildLevelUpMessage(event, cfg) {
  const canMention = cfg.levelUp.mentionPlayer && /^\d{17,20}$/.test(String(event.discordId || ""));
  const name = cleanName(event.name);
  const mention = canMention ? `<@${event.discordId}>` : `**${name}**`;
  const content = renderTemplate(cfg.levelUp.message, {
    mention,
    name,
    level: event.newLevel,
    oldLevel: event.oldLevel,
    app: cfg.appName,
  });
  return {
    content: truncate(content, 2000),
    allowed_mentions: { parse: [], users: canMention ? [String(event.discordId)] : [] },
  };
}

module.exports = {
  truncate,
  escapeMarkdown,
  cleanName,
  formatNumber,
  formatValue,
  renderTemplate,
  formatLeaderboard,
  formatStats,
  buildLevelUpMessage,
};
