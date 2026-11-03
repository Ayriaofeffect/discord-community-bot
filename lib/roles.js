// lib/roles.js
// Optional: give Discord roles based on level (bot.config.js -> levelUp.roleRewards).

const { config: defaultConfig } = require("./config");
const { env } = require("./env");
const discordApi = require("./discord-api");

// Pure function: works out which reward roles to add and remove.
//   currentRoleIds: roles the member has now
//   level:          the player's level
//   rewards:        [{ level: 5, roleId: "..." }, ...]
//   keepLowerRoles: true = keep every earned role, false = only the highest one
function computeRoleChanges({ currentRoleIds = [], level, rewards = [], keepLowerRoles = false }) {
  const valid = rewards
    .filter((r) => r && r.roleId && Number.isFinite(Number(r.level)))
    .map((r) => ({ level: Number(r.level), roleId: String(r.roleId) }));
  const earned = valid.filter((r) => Number(level) >= r.level).sort((a, b) => a.level - b.level);

  let target;
  if (keepLowerRoles) target = new Set(earned.map((r) => r.roleId));
  else target = new Set(earned.length ? [earned[earned.length - 1].roleId] : []);

  const current = new Set(currentRoleIds.map(String));
  const add = [...target].filter((id) => !current.has(id));
  const remove = [...new Set(valid.map((r) => r.roleId))].filter((id) => !target.has(id) && current.has(id));
  return { add, remove };
}

// Applies the role changes through the Discord API.
// Returns { added, removed } or { skipped: "reason" }.
async function syncLevelRoles({ discordId, level, cfg = defaultConfig, api = discordApi }) {
  const rewards = cfg.levelUp.roleRewards || [];
  if (rewards.length === 0) return { skipped: "No roleRewards in bot.config.js." };
  if (!env("DISCORD_TOKEN") || !env("DISCORD_GUILD_ID")) {
    return { skipped: "DISCORD_TOKEN or DISCORD_GUILD_ID is not set." };
  }
  if (!discordId) return { skipped: "Player is not linked to Discord." };

  const guildId = env("DISCORD_GUILD_ID");
  const member = await api.getGuildMember(guildId, discordId);
  if (!member) return { skipped: "Player is not in the Discord server." };

  const { add, remove } = computeRoleChanges({
    currentRoleIds: member.roles || [],
    level,
    rewards,
    keepLowerRoles: cfg.levelUp.keepLowerRoles,
  });
  const reason = `Level ${level} role reward`;
  for (const roleId of add) await api.addMemberRole(guildId, discordId, roleId, reason);
  for (const roleId of remove) await api.removeMemberRole(guildId, discordId, roleId, reason);
  return { added: add, removed: remove };
}

module.exports = { computeRoleChanges, syncLevelRoles };
