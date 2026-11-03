// api/interactions.js
// Vercel function: Discord sends every slash command here.
// Set this URL in the Discord Developer Portal as the
// "Interactions Endpoint URL":  https://YOUR-PROJECT.vercel.app/api/interactions
//
// Needs: DISCORD_PUBLIC_KEY (to check that requests really come from Discord).

const { verifyKey, InteractionType, InteractionResponseType } = require("discord-interactions");
const { env, hasEnv } = require("../lib/env");
const { sendJson, readRawBody, runInBackground } = require("../lib/http");
const { routeCommand } = require("../commands");

// Discord signs every request. If the signature doesn't match your app's
// public key, the request didn't come from Discord and we refuse it.
async function verifyDiscordRequest(req, rawBody) {
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  if (typeof signature !== "string" || typeof timestamp !== "string") return false;
  try {
    return await verifyKey(rawBody, signature, timestamp, env("DISCORD_PUBLIC_KEY"));
  } catch {
    return false;
  }
}

// createHandler lets tests swap in a fake signature check or router.
function createHandler({ verify = verifyDiscordRequest, route = routeCommand, runLater = runInBackground } = {}) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "Method not allowed. Discord sends POST requests here." });
    }
    if (!hasEnv("DISCORD_PUBLIC_KEY")) {
      console.error("[interactions] DISCORD_PUBLIC_KEY is not set. Add it in Vercel and redeploy.");
      return sendJson(res, 500, { error: "DISCORD_PUBLIC_KEY is not set on the server." });
    }

    let rawBody;
    try {
      rawBody = await readRawBody(req);
    } catch {
      return sendJson(res, 400, { error: "Could not read the request body." });
    }

    if (!(await verify(req, rawBody))) {
      return sendJson(res, 401, { error: "Invalid request signature" });
    }

    let interaction;
    try {
      interaction = JSON.parse(rawBody);
    } catch {
      return sendJson(res, 400, { error: "Body is not valid JSON." });
    }

    // Discord sends a PING when you save the Interactions Endpoint URL.
    if (interaction.type === InteractionType.PING) {
      return sendJson(res, 200, { type: InteractionResponseType.PONG });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const { response, background } = await route(interaction);
      sendJson(res, 200, response);
      if (background) runLater(background); // e.g. finish a slow /ask answer
      return;
    }

    return sendJson(res, 400, { error: "Unsupported interaction type." });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.verifyDiscordRequest = verifyDiscordRequest;
