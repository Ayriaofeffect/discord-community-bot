// lib/replies.js
// Builders for slash-command responses.
// allowed_mentions { parse: [] } means a reply can never ping @everyone,
// roles, or users by accident, even if it contains text like "@everyone".

const { InteractionResponseType, InteractionResponseFlags } = require("discord-interactions");

const NO_PINGS = Object.freeze({ parse: [] });

function message(content, { ephemeral = false } = {}) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      allowed_mentions: NO_PINGS,
      ...(ephemeral ? { flags: InteractionResponseFlags.EPHEMERAL } : {}),
    },
  };
}

function embed(embedObject, { ephemeral = false, content } = {}) {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      ...(content ? { content } : {}),
      embeds: [embedObject],
      allowed_mentions: NO_PINGS,
      ...(ephemeral ? { flags: InteractionResponseFlags.EPHEMERAL } : {}),
    },
  };
}

// "Bot is thinking..." — use when the answer takes longer than 3 seconds.
function deferred({ ephemeral = false } = {}) {
  return {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    ...(ephemeral ? { data: { flags: InteractionResponseFlags.EPHEMERAL } } : {}),
  };
}

module.exports = { message, embed, deferred, NO_PINGS };
