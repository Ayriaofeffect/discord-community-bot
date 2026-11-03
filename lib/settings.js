// lib/settings.js
// Moderation settings that admins can change with /mod.
//
// Where settings come from:
//   - With a database: the bot_config table (one row per setting).
//     A setting that has no row yet uses the value from bot.config.js.
//   - Without a database: bot.config.js only (read-only, /mod can't save).
//   - MOD_SKIP_CHANNEL_IDS / MOD_SKIP_USER_IDS env vars are always added on top.

const { config: defaultConfig } = require("./config");
const { envList } = require("./env");
const { databaseError } = require("./supabase");

const SETTING_KEYS = {
  rules: "moderation_rules",
  skipChannelIds: "skip_channel_ids",
  skipUserIds: "skip_user_ids",
};

const MAX_RULES = 30;
const MAX_RULE_LENGTH = 300;

function unique(list) {
  return [...new Set(list.map(String))];
}

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function defaultStoredSettings(cfg = defaultConfig) {
  return {
    rules: [...cfg.moderation.rules],
    skipChannelIds: [...cfg.moderation.skipChannelIds].map(String),
    skipUserIds: [...cfg.moderation.skipUserIds].map(String),
  };
}

// rows: [{ key, value }] from the bot_config table.
function mergeStoredSettings(defaults, rows) {
  const stored = { ...defaults };
  for (const row of rows || []) {
    for (const [name, key] of Object.entries(SETTING_KEYS)) {
      if (row.key === key && isStringList(row.value)) stored[name] = [...row.value];
    }
  }
  return stored;
}

function withEnv(stored) {
  return {
    rules: [...stored.rules],
    skipChannelIds: unique([...stored.skipChannelIds, ...envList("MOD_SKIP_CHANNEL_IDS")]),
    skipUserIds: unique([...stored.skipUserIds, ...envList("MOD_SKIP_USER_IDS")]),
  };
}

let cache = null; // { value, at }

// Returns { source, rules, skipChannelIds, skipUserIds, stored }.
// `stored` is what /mod edits (without the env var extras).
// maxAgeMs > 0 reuses a recent result (the worker uses 60 seconds).
async function loadSettings({ db, cfg = defaultConfig, maxAgeMs = 0 } = {}) {
  if (maxAgeMs > 0 && cache && Date.now() - cache.at < maxAgeMs) return cache.value;

  const defaults = defaultStoredSettings(cfg);
  let stored = defaults;
  let source = "bot.config.js";

  if (db) {
    const { data, error } = await db
      .from(cfg.tables.settings)
      .select("key, value")
      .in("key", Object.values(SETTING_KEYS));
    if (error) {
      console.error("[settings] Could not read bot settings, using bot.config.js:", error.message);
      source = "bot.config.js (database error)";
    } else {
      stored = mergeStoredSettings(defaults, data);
      source = "database";
    }
  }

  const value = { source, ...withEnv(stored), stored };
  cache = { value, at: Date.now() };
  return value;
}

function clearSettingsCache() {
  cache = null;
}

// Saves one setting (a list of strings) to the bot_config table.
async function saveSetting(db, name, value, updatedBy, cfg = defaultConfig) {
  const key = SETTING_KEYS[name];
  if (!key) throw new Error(`Unknown setting "${name}".`);
  const { error } = await db.from(cfg.tables.settings).upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ? String(updatedBy) : null,
  });
  if (error) throw databaseError(`save the ${key} setting`, error);
  clearSettingsCache();
}

// ── Pure list helpers used by /mod ──────────────────────────

function addRule(rules, text) {
  const rule = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!rule) return { ok: false, error: "The rule is empty." };
  if (rule.length > MAX_RULE_LENGTH) return { ok: false, error: `Keep rules under ${MAX_RULE_LENGTH} characters.` };
  if (rules.length >= MAX_RULES) return { ok: false, error: `You already have ${MAX_RULES} rules. Remove one first.` };
  return { ok: true, rules: [...rules, rule], rule };
}

function removeRule(rules, number) {
  const index = Number(number) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= rules.length) {
    return { ok: false, error: rules.length ? `Pick a number from 1 to ${rules.length}.` : "There are no rules to remove." };
  }
  const next = [...rules];
  const [removed] = next.splice(index, 1);
  return { ok: true, rules: next, removed };
}

// Adds the id if it's missing, removes it if it's there.
function toggleId(list, id) {
  const value = String(id);
  return list.includes(value)
    ? { list: list.filter((item) => item !== value), added: false }
    : { list: [...list, value], added: true };
}

module.exports = {
  SETTING_KEYS,
  loadSettings,
  clearSettingsCache,
  saveSetting,
  defaultStoredSettings,
  mergeStoredSettings,
  addRule,
  removeRule,
  toggleId,
};
