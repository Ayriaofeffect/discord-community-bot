// api/levelup-webhook.js
// Vercel function: a Supabase database webhook calls this when a row in your
// players table changes. If the level went up, we post an announcement in
// Discord and (optionally) update the player's level roles.
//
// URL:     https://YOUR-PROJECT.vercel.app/api/levelup-webhook
// Header:  x-webhook-secret: <the same value as WEBHOOK_SECRET>
// Needs:   WEBHOOK_SECRET, DISCORD_WEBHOOK_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Setup steps are in supabase/schema.sql and the README.

const { config: defaultConfig } = require("../lib/config");
const { env } = require("../lib/env");
const { safeEqual } = require("../lib/security");
const { sendJson, readJsonBody } = require("../lib/http");
const { safeGetSupabase } = require("../lib/supabase");
const { detectLevelUp, dedupeKey, claimAnnouncement } = require("../lib/levelup");
const { buildLevelUpMessage } = require("../lib/format");
const { postChannelWebhook } = require("../lib/discord-api");
const { syncLevelRoles } = require("../lib/roles");

function createHandler({
  cfg = defaultConfig,
  getDb = safeGetSupabase,
  post = postChannelWebhook,
  syncRoles = syncLevelRoles,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed. Use POST." });

    // 1. Check the shared secret (fails closed if it isn't set).
    const expected = env("WEBHOOK_SECRET");
    if (!expected) {
      console.error("[levelup] WEBHOOK_SECRET is not set. Add it in Vercel and redeploy.");
      return sendJson(res, 500, { error: "WEBHOOK_SECRET is not set on the server." });
    }
    if (!safeEqual(req.headers["x-webhook-secret"], expected)) {
      return sendJson(res, 401, { error: "Invalid webhook secret." });
    }

    // 2. This feature needs the database (for duplicate protection).
    const db = getDb();
    if (!db) {
      return sendJson(res, 503, {
        error: "No database connected. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel, then redeploy.",
      });
    }
    const webhookUrl = env("DISCORD_WEBHOOK_URL");
    if (!webhookUrl) {
      return sendJson(res, 500, { error: "DISCORD_WEBHOOK_URL is not set, so there's nowhere to post level-ups." });
    }

    try {
      let payload;
      try {
        payload = await readJsonBody(req);
      } catch {
        return sendJson(res, 400, { error: "Body is not valid JSON." });
      }

      // 3. Did a level go up?
      const { event, skip } = detectLevelUp(payload, cfg);
      if (skip) return sendJson(res, 200, { ok: true, skipped: skip });

      // 4. Only announce each level once, even if the webhook fires twice.
      if (!(await claimAnnouncement(db, dedupeKey(event), cfg))) {
        return sendJson(res, 200, { ok: true, skipped: "Already announced (duplicate webhook)." });
      }

      // 5. Post it, then update roles (role problems never block the post).
      await post(webhookUrl, buildLevelUpMessage(event, cfg));
      let roles;
      try {
        roles = await syncRoles({ discordId: event.discordId, level: event.newLevel, cfg });
      } catch (err) {
        console.error("[levelup] Role sync failed:", err.message);
        roles = { error: "Role sync failed. Check the Vercel logs." };
      }

      console.log(`[levelup] Announced player ${event.playerId}: level ${event.oldLevel} -> ${event.newLevel}`);
      return sendJson(res, 200, { ok: true, announced: true, roles });
    } catch (err) {
      console.error("[levelup] Failed:", err);
      return sendJson(res, 500, { error: "Something went wrong. Check the Vercel logs." });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
