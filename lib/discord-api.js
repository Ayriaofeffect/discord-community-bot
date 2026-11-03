// lib/discord-api.js
// A few Discord REST API calls the serverless functions need.
// (The Railway worker uses discord.js instead.)

const { env } = require("./env");

const API = "https://discord.com/api/v10";
const SNOWFLAKE = /^\d{17,20}$/;
const WEBHOOK_URL = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/;

function assertId(value, what) {
  if (!SNOWFLAKE.test(String(value ?? ""))) throw new Error(`${what} should be a Discord ID (17-20 digits).`);
  return String(value);
}

// Sends one request. Returns parsed JSON (or null for empty / 404 responses).
async function discordRequest(path, { method = "GET", body, useBotToken = true, reason } = {}) {
  const headers = { "Content-Type": "application/json", "User-Agent": "DiscordBot (discord-community-bot, 1.0)" };
  if (useBotToken) {
    const token = env("DISCORD_TOKEN");
    if (!token) throw new Error("DISCORD_TOKEN is not set.");
    headers.Authorization = `Bot ${token}`;
  }
  if (reason) headers["X-Audit-Log-Reason"] = encodeURIComponent(reason.slice(0, 400));

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord API ${method} ${path.split("?")[0]} failed with ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function getGuildMember(guildId, userId) {
  return discordRequest(`/guilds/${assertId(guildId, "DISCORD_GUILD_ID")}/members/${assertId(userId, "User ID")}`);
}

function addMemberRole(guildId, userId, roleId, reason) {
  return discordRequest(
    `/guilds/${assertId(guildId, "DISCORD_GUILD_ID")}/members/${assertId(userId, "User ID")}/roles/${assertId(roleId, "Role ID")}`,
    { method: "PUT", reason }
  );
}

function removeMemberRole(guildId, userId, roleId, reason) {
  return discordRequest(
    `/guilds/${assertId(guildId, "DISCORD_GUILD_ID")}/members/${assertId(userId, "User ID")}/roles/${assertId(roleId, "Role ID")}`,
    { method: "DELETE", reason }
  );
}

// Replaces the "Bot is thinking..." message after a deferred reply.
// Uses the interaction token, so no bot token is needed.
function editOriginalResponse(applicationId, interactionToken, body) {
  const token = encodeURIComponent(String(interactionToken));
  return discordRequest(`/webhooks/${assertId(applicationId, "Application ID")}/${token}/messages/@original`, {
    method: "PATCH",
    body,
    useBotToken: false,
  });
}

// Posts a message through a channel webhook (DISCORD_WEBHOOK_URL).
async function postChannelWebhook(url, body) {
  if (!WEBHOOK_URL.test(String(url ?? ""))) {
    throw new Error("DISCORD_WEBHOOK_URL doesn't look like a Discord webhook URL.");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Posting to the Discord webhook failed with ${res.status}: ${text.slice(0, 200)}`);
  }
}

module.exports = {
  discordRequest,
  getGuildMember,
  addMemberRole,
  removeMemberRole,
  editOriginalResponse,
  postChannelWebhook,
};
