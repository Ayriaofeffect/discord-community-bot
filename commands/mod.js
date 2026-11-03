// commands/mod.js — /mod: admins view and change AI moderation settings.
//
//   /mod show                   rules + skipped channels and people
//   /mod add-rule rule:...      add a rule
//   /mod remove-rule number:N   remove a rule
//   /mod skip-channel channel:  turn moderation off/on for a channel
//   /mod skip-user user:        turn moderation off/on for a person
//
// Changes are saved in the bot_config table. Without a database, /mod show
// still works, and the other commands explain how to edit bot.config.js.

const { envList } = require("../lib/env");
const { ADMIN_PERMISSION } = require("../lib/permissions");
const { loadSettings, saveSetting, addRule, removeRule, toggleId } = require("../lib/settings");
const { escapeMarkdown, truncate } = require("../lib/format");
const replies = require("../lib/replies");

const say = (text) => replies.message(text, { ephemeral: true });

function showEmbed(settings, cfg) {
  const rules = settings.rules.length
    ? settings.rules.map((rule, i) => `**${i + 1}.** ${escapeMarkdown(rule)}`).join("\n")
    : "No rules yet. Add one with `/mod add-rule`.";
  return {
    title: "Moderation settings",
    color: cfg.embedColor,
    fields: [
      {
        name: "Saved in",
        value:
          settings.source === "database"
            ? `Database (\`${cfg.tables.settings}\` table)`
            : `${settings.source} — read-only until a database is connected`,
      },
      { name: `Rules (${settings.rules.length})`, value: truncate(rules, 1024) },
      { name: "Skipped channels", value: truncate(settings.skipChannelIds.map((id) => `<#${id}>`).join(", ") || "None", 1024) },
      { name: "Skipped people", value: truncate(settings.skipUserIds.map((id) => `<@${id}>`).join(", ") || "None", 1024) },
    ],
    footer: cfg.moderation.skipModerators
      ? { text: "People with Manage Messages permission are never moderated." }
      : undefined,
  };
}

module.exports = {
  name: "mod",

  definition: () => ({
    name: "mod",
    type: 1,
    description: "Admins: view and change AI moderation settings",
    contexts: [0],
    default_member_permissions: ADMIN_PERMISSION,
    options: [
      { type: 1, name: "show", description: "Show the rules and who or what is skipped" },
      {
        type: 1,
        name: "add-rule",
        description: "Add a moderation rule",
        options: [{ type: 3, name: "rule", description: "The rule, in plain English", required: true, max_length: 300 }],
      },
      {
        type: 1,
        name: "remove-rule",
        description: "Remove a rule by its number",
        options: [{ type: 4, name: "number", description: "The rule number from /mod show", required: true, min_value: 1 }],
      },
      {
        type: 1,
        name: "skip-channel",
        description: "Turn moderation off (or back on) in a channel",
        options: [{ type: 7, name: "channel", description: "The channel", required: true }],
      },
      {
        type: 1,
        name: "skip-user",
        description: "Turn moderation off (or back on) for a person",
        options: [{ type: 6, name: "user", description: "The person", required: true }],
      },
    ],
  }),

  async run(ctx) {
    const { cfg, db } = ctx;
    if (!ctx.isAdmin) return say("Only server admins (Manage Server permission) can use `/mod`.");

    const settings = await loadSettings({ db, cfg });
    if (ctx.subcommand === "show" || !ctx.subcommand) {
      return replies.embed(showEmbed(settings, cfg), { ephemeral: true });
    }

    if (!db) {
      return say(
        "No database is connected, so I can't save changes. " +
          "Edit the `moderation` section of bot.config.js instead, then redeploy the worker."
      );
    }
    if (settings.source !== "database") {
      return say("I couldn't read the current settings from the database, so I won't save over them. Check the logs.");
    }

    const stored = settings.stored;
    const by = ctx.userId;
    const later = "The moderation worker picks this up within a minute.";

    if (ctx.subcommand === "add-rule") {
      const result = addRule(stored.rules, ctx.getOption("rule"));
      if (!result.ok) return say(`❌ ${result.error}`);
      await saveSetting(db, "rules", result.rules, by, cfg);
      return say(`✅ Added rule #${result.rules.length}: ${escapeMarkdown(result.rule)}\n${later}`);
    }

    if (ctx.subcommand === "remove-rule") {
      const result = removeRule(stored.rules, ctx.getOption("number"));
      if (!result.ok) return say(`❌ ${result.error}`);
      await saveSetting(db, "rules", result.rules, by, cfg);
      return say(`✅ Removed: ${escapeMarkdown(result.removed)}\n${result.rules.length} rule(s) left. ${later}`);
    }

    if (ctx.subcommand === "skip-channel" || ctx.subcommand === "skip-user") {
      const isChannel = ctx.subcommand === "skip-channel";
      const id = String(ctx.getOption(isChannel ? "channel" : "user") ?? "");
      if (!/^\d{17,20}$/.test(id)) return say("❌ That doesn't look like a valid channel or person.");

      const name = isChannel ? "skipChannelIds" : "skipUserIds";
      const envName = isChannel ? "MOD_SKIP_CHANNEL_IDS" : "MOD_SKIP_USER_IDS";
      const label = isChannel ? `<#${id}>` : `<@${id}>`;
      const { list, added } = toggleId(stored[name], id);
      await saveSetting(db, name, list, by, cfg);

      if (added) return say(`✅ ${label} is now skipped by moderation. ${later}`);
      const note = envList(envName).includes(id)
        ? `\nNote: it's also listed in the ${envName} environment variable, so it stays skipped until you remove it there.`
        : "";
      return say(`✅ ${label} is moderated again. ${later}${note}`);
    }

    return say("Unknown option. Try `/mod show`.");
  },
};
