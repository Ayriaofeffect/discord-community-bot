// lib/config.js
// Loads bot.config.js, fills in anything you left out with safe defaults,
// and checks it for common mistakes. Every other file reads table names,
// column names and messages from here, never from hard-coded strings.

const DEFAULTS = {
  appName: "My App",
  embedColor: 0x5865f2,

  players: {
    table: "players",
    idColumn: "id",
    nameColumn: "username",
    levelColumn: "level",
    scoreColumn: "xp",
    discordIdColumn: "discord_id",
    statsColumns: [
      { column: "level", label: "Level" },
      { column: "xp", label: "XP" },
    ],
  },

  linking: {
    method: "code",
    codeColumn: "discord_link_code",
  },

  leaderboard: {
    size: 10,
    scoreLabel: "XP",
  },

  levelUp: {
    message: "🎉 {mention} just reached **level {level}**!",
    mentionPlayer: true,
    roleRewards: [],
    keepLowerRoles: false,
  },

  moderation: {
    enabled: true,
    instructions:
      "You are a calm, fair moderator for the {app} Discord server. Flag clear rule breaks only.",
    rules: [
      "Be kind. No insults, harassment, or hate speech.",
      "No sexual content or graphic violence.",
      "No threats, and never share someone else's personal information.",
      "No spam, scams, or advertising without permission.",
    ],
    minMessageLength: 10,
    skipChannelIds: [],
    skipUserIds: [],
    skipModerators: true,
    newAccountDays: 7,
    spam: { maxMessages: 5, perSeconds: 5, maxDuplicates: 3 },
    suspiciousLinks: ["discord.gg/", "discord.com/invite/", "free nitro"],
    strikesBeforeTimeout: 3,
    timeoutMinutes: 10,
    quarantineOnHighSeverity: true,
    maxTokens: 1024,
  },

  assistant: {
    enabled: true,
    adminOnly: true,
    systemPrompt:
      "You are the friendly helper bot for the {app} Discord server. Answer in a few short sentences.",
    includeAppData: true,
    maxTokens: 1500,
  },

  tables: {
    settings: "bot_config",
    announcements: "bot_announcements",
  },
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Objects are merged key by key. Arrays and plain values are replaced.
function mergeDeep(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(base[key]) && isPlainObject(value) ? mergeDeep(base[key], value) : value;
  }
  return result;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// Builds a full config from your settings. Pass nothing to get the defaults.
function loadConfig(userConfig = {}) {
  const copy = JSON.parse(JSON.stringify(mergeDeep(DEFAULTS, userConfig || {})));
  return deepFreeze(copy);
}

// Postgres table/column names: letters, numbers and underscores.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SNOWFLAKE = /^\d{17,20}$/;

// Returns a list of plain-English problems. An empty list means "looks good".
function validateConfig(cfg) {
  const problems = [];
  const checkName = (path, value) => {
    if (typeof value !== "string" || !IDENTIFIER.test(value)) {
      problems.push(`${path} should be a table or column name (letters, numbers, _), got ${JSON.stringify(value)}.`);
    }
  };
  const checkPositiveInt = (path, value, max = Infinity) => {
    if (!Number.isInteger(value) || value < 1 || value > max) {
      problems.push(`${path} should be a whole number from 1 to ${max === Infinity ? "any size" : max}, got ${JSON.stringify(value)}.`);
    }
  };

  if (typeof cfg.appName !== "string" || !cfg.appName.trim()) problems.push("appName should be your app's name.");

  const p = cfg.players || {};
  for (const key of ["table", "idColumn", "nameColumn", "levelColumn", "scoreColumn", "discordIdColumn"]) {
    checkName(`players.${key}`, p[key]);
  }
  if (!Array.isArray(p.statsColumns)) {
    problems.push("players.statsColumns should be a list like [{ column: \"level\", label: \"Level\" }].");
  } else {
    p.statsColumns.forEach((entry, i) => {
      checkName(`players.statsColumns[${i}].column`, entry && entry.column);
      if (!entry || typeof entry.label !== "string" || !entry.label.trim()) {
        problems.push(`players.statsColumns[${i}].label should be a short text label.`);
      }
    });
  }

  const linking = cfg.linking || {};
  if (!["code", "name"].includes(linking.method)) {
    problems.push(`linking.method should be "code" or "name", got ${JSON.stringify(linking.method)}.`);
  }
  if (linking.method === "code") checkName("linking.codeColumn", linking.codeColumn);

  checkPositiveInt("leaderboard.size", cfg.leaderboard && cfg.leaderboard.size, 25);

  const levelUp = cfg.levelUp || {};
  if (typeof levelUp.message !== "string" || !levelUp.message.trim()) {
    problems.push("levelUp.message should be a message like \"{mention} reached level {level}!\".");
  }
  if (!Array.isArray(levelUp.roleRewards)) {
    problems.push("levelUp.roleRewards should be a list (it can be empty).");
  } else {
    levelUp.roleRewards.forEach((reward, i) => {
      if (!reward || !Number.isInteger(reward.level) || reward.level < 1) {
        problems.push(`levelUp.roleRewards[${i}].level should be a whole number like 5.`);
      }
      if (!reward || typeof reward.roleId !== "string" || !SNOWFLAKE.test(reward.roleId)) {
        problems.push(`levelUp.roleRewards[${i}].roleId should be a Discord role ID (17-20 digits, in quotes).`);
      }
    });
  }

  const mod = cfg.moderation || {};
  if (!Array.isArray(mod.rules) || mod.rules.some((rule) => typeof rule !== "string")) {
    problems.push("moderation.rules should be a list of plain-English rules.");
  }
  if (!Array.isArray(mod.suspiciousLinks) || mod.suspiciousLinks.some((s) => typeof s !== "string")) {
    problems.push("moderation.suspiciousLinks should be a list of text snippets.");
  }
  for (const key of ["skipChannelIds", "skipUserIds"]) {
    if (!Array.isArray(mod[key]) || mod[key].some((id) => !SNOWFLAKE.test(String(id)))) {
      problems.push(`moderation.${key} should be a list of Discord IDs in quotes (it can be empty).`);
    }
  }
  const spam = mod.spam || {};
  checkPositiveInt("moderation.spam.maxMessages", spam.maxMessages);
  checkPositiveInt("moderation.spam.perSeconds", spam.perSeconds);
  checkPositiveInt("moderation.spam.maxDuplicates", spam.maxDuplicates);
  checkPositiveInt("moderation.strikesBeforeTimeout", mod.strikesBeforeTimeout);
  checkPositiveInt("moderation.timeoutMinutes", mod.timeoutMinutes, 40320); // Discord max is 28 days

  const tables = cfg.tables || {};
  checkName("tables.settings", tables.settings);
  checkName("tables.announcements", tables.announcements);

  return problems;
}

let userConfig = {};
try {
  userConfig = require("../bot.config.js");
} catch (err) {
  if (err && err.code === "MODULE_NOT_FOUND" && String(err.message).includes("bot.config")) {
    console.warn("[config] bot.config.js not found. Using defaults.");
  } else {
    throw err; // A typo inside bot.config.js should be loud, not silent.
  }
}

const config = loadConfig(userConfig);

module.exports = { config, loadConfig, validateConfig, DEFAULTS };
