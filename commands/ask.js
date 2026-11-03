// commands/ask.js — /ask: ask the Claude-powered helper a question.
// Admin-only by default (bot.config.js -> assistant.adminOnly), because every
// question costs a little money on your Anthropic account.

const { isClaudeConfigured } = require("../lib/claude");
const { askAssistant, NOT_SET_UP } = require("../lib/assistant");
const { editOriginalResponse } = require("../lib/discord-api");
const { ADMIN_PERMISSION } = require("../lib/permissions");
const { cleanName, escapeMarkdown, truncate } = require("../lib/format");
const replies = require("../lib/replies");

module.exports = {
  name: "ask",
  isEnabled: (cfg) => cfg.assistant.enabled,

  definition: (cfg) => ({
    name: "ask",
    type: 1,
    description: truncate(`Ask the AI helper a question about ${cfg.appName}`, 100),
    contexts: [0],
    ...(cfg.assistant.adminOnly ? { default_member_permissions: ADMIN_PERMISSION } : {}),
    options: [{ name: "question", description: "What do you want to know?", type: 3, required: true, max_length: 500 }],
  }),

  async run(ctx) {
    const { cfg, interaction } = ctx;
    if (cfg.assistant.adminOnly && !ctx.isAdmin) {
      return replies.message("Only server admins can use `/ask` here.", { ephemeral: true });
    }
    if (!isClaudeConfigured()) return replies.message(NOT_SET_UP, { ephemeral: true });

    const question = String(ctx.getOption("question") ?? "").trim();
    if (!question) return replies.message("Type a question after `/ask`.", { ephemeral: true });

    // Claude can take more than 3 seconds, so we reply "thinking..." first,
    // then edit that message with the real answer.
    return {
      response: replies.deferred(),
      background: async () => {
        const answer = await askAssistant({
          question,
          discordId: ctx.userId,
          username: ctx.username,
          db: ctx.db,
          cfg,
        });
        const asked = escapeMarkdown(truncate(question.replace(/\s+/g, " "), 300));
        const content = truncate(`> **${cleanName(ctx.username)} asked:** ${asked}\n\n${answer}`, 2000);
        await editOriginalResponse(interaction.application_id, interaction.token, {
          content,
          allowed_mentions: replies.NO_PINGS,
        });
      },
    };
  },
};
