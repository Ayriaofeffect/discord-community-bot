// lib/permissions.js
// Who counts as an "admin" for /mod and /ask: anyone with Administrator or
// Manage Server permission in your Discord server.

const ADMINISTRATOR = 1n << 3n;
const MANAGE_GUILD = 1n << 5n;

// Used when registering admin-only commands, so Discord hides them from
// everyone else. Server owners can change this later in
// Server Settings > Integrations.
const ADMIN_PERMISSION = String(MANAGE_GUILD);

// interaction.member.permissions is a number sent as a string.
function isAdminInteraction(interaction) {
  const raw = interaction && interaction.member && interaction.member.permissions;
  if (!raw) return false; // DMs have no member, so no admin rights
  try {
    return (BigInt(raw) & (ADMINISTRATOR | MANAGE_GUILD)) !== 0n;
  } catch {
    return false;
  }
}

module.exports = { ADMIN_PERMISSION, isAdminInteraction };
