// bot/moderator.js
// The always-on moderation worker. Run it on Railway (or your computer).
// Vercel can't do this part, because it needs a live connection to Discord.
//
// What it does with every new message (in this order):
//   1. Skips bots, moderators, and skipped channels/people.
//   2. Spam check: too many messages too fast, or the same message repeated.
//   3. Link check: blocked links/phrases, and links from brand-new accounts.
//   4. AI check: Claude reads the message and your rules (needs ANTHROPIC_API_KEY).
//   5. If someone @mentions the bot, the AI assistant answers (admins by default).
//
// Start it:  npm start              (on Railway)
//            npm run dev:worker     (on your computer, reads .env)
//
// Needs: DISCORD_TOKEN. Optional: ANTHROPIC_API_KEY, MOD_LOG_CHANNEL_ID,
//        QUARANTINE_ROLE_ID, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

const { Client, Events, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const { config: defaultConfig, validateConfig } = require("../lib/config");
const { env, hasEnv } = require("../lib/env");
const { safeGetSupabase, isDatabaseConfigured } = require("../lib/supabase");
const { loadSettings } = require("../lib/settings");
const { isClaudeConfigured, getModel } = require("../lib/claude");
const { moderateMessage, decideAction } = require("../lib/moderation");
const { askAssistant } = require("../lib/assistant");
const { truncate } = require("../lib/format");
const {
  createSpamTracker,
  createStrikeCounter,
  findSuspiciousLink,
  containsLink,
  accountAgeDays,
  isNewAccount,
} = require("../lib/antispam");

const COLORS = { warn: 0xf1c40f, delete: 0xe67e22, timeout: 0xe74c3c, quarantine: 0x8e44ad, info: 0x3498db };

function isModerator(member) {
  return Boolean(member && member.permissions && member.permissions.has(PermissionFlagsBits.ManageMessages));
}

function isAdmin(member) {
  return Boolean(
    member &&
      member.permissions &&
      (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild))
  );
}

function createModerator({ cfg = defaultConfig, getDb = safeGetSupabase } = {}) {
  const mod = cfg.moderation;
  const spam = createSpamTracker(mod.spam);
  const strikes = createStrikeCounter();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // privileged: turn on in the Developer Portal
      GatewayIntentBits.GuildMembers, // privileged: needed for join alerts
    ],
  });

  // ── Mod log ───────────────────────────────────────────────
  async function logToModChannel(title, fields, color = COLORS.info) {
    const channelId = env("MOD_LOG_CHANNEL_ID");
    if (!channelId) return;
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) return;
      await channel.send({
        embeds: [
          {
            title,
            color,
            fields: fields.map((f) => ({ ...f, value: truncate(f.value || "—", 1024) })),
            timestamp: new Date().toISOString(),
          },
        ],
        allowedMentions: { parse: [] },
      });
    } catch (err) {
      console.error("[mod-log] Could not post to the mod log channel:", err.message);
    }
  }

  // ── Actions ───────────────────────────────────────────────
  async function timeoutMember(member, reason) {
    if (!member || !member.moderatable) return "timeout failed (bot role too low, or they are an admin)";
    try {
      await member.timeout(mod.timeoutMinutes * 60 * 1000, reason);
      return `timeout ${mod.timeoutMinutes} min`;
    } catch (err) {
      return `timeout failed (${err.message})`;
    }
  }

  async function quarantineMember(member, reason) {
    const roleId = env("QUARANTINE_ROLE_ID");
    if (!roleId) return timeoutMember(member, reason); // no quarantine role: use a timeout instead
    try {
      await member.roles.add(roleId, reason);
      return "quarantined";
    } catch (err) {
      console.error("[mod] Quarantine failed, using a timeout instead:", err.message);
      return timeoutMember(member, reason);
    }
  }

  // action: "warn" | "delete" | "timeout" | "quarantine"
  async function act(message, action, reason, title, extraFields = []) {
    const member = message.member;
    const results = [];

    if (action === "warn") {
      await message
        .reply({
          content: `⚠️ <@${message.author.id}>, please keep it friendly and follow the server rules.`,
          allowedMentions: { users: [message.author.id], repliedUser: true },
        })
        .catch(() => {});
      results.push("warned");
    } else {
      await message
        .delete()
        .then(() => results.push("message deleted"))
        .catch(() => results.push("delete failed (missing Manage Messages?)"));
      if (action === "timeout") results.push(await timeoutMember(member, reason));
      if (action === "quarantine") results.push(await quarantineMember(member, reason));
    }

    // Tell the person why (DMs can be turned off, so this may fail quietly).
    await message.author
      .send(
        action === "warn"
          ? `Heads up from ${message.guild.name}: ${reason}`
          : `Your message in ${message.guild.name} was removed. Reason: ${reason}`
      )
      .catch(() => {});

    console.log(`[mod] ${action} ${message.author.tag}: ${reason}`);
    await logToModChannel(
      title,
      [
        { name: "Person", value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
        { name: "Channel", value: `<#${message.channelId}>`, inline: true },
        { name: "Action", value: results.join(", "), inline: true },
        { name: "Reason", value: reason },
        ...extraFields,
        { name: "Message", value: truncate(message.content, 1000) },
      ],
      COLORS[action] || COLORS.info
    );
  }

  // ── Moderation pipeline ───────────────────────────────────
  // Returns true if the message was dealt with.
  async function runModeration(message, settings) {
    const content = message.content || "";
    const newAccount = isNewAccount(message.author.createdAt, mod.newAccountDays);

    const spamCheck = spam.check(message.author.id, content);
    if (spamCheck.spam) {
      await act(message, "timeout", spamCheck.reason, "Spam");
      return true;
    }

    const blocked = findSuspiciousLink(content, mod.suspiciousLinks);
    if (blocked) {
      await act(message, newAccount ? "quarantine" : "delete", `Posted a blocked link or phrase ("${blocked}")`, "Blocked link");
      return true;
    }

    if (newAccount && containsLink(content)) {
      await act(message, "delete", `New accounts (under ${mod.newAccountDays} days old) can't post links yet`, "New account link");
      return true;
    }

    if (content.length < mod.minMessageLength || !isClaudeConfigured()) return false;

    const result = await moderateMessage({ content, username: message.author.username, rules: settings.rules, cfg });
    if (!result.flagged) return false;

    const count = strikes.add(message.author.id);
    const action = decideAction(result, count, mod);
    await act(message, action, result.reason || "Broke a server rule", `AI moderation (${result.severity})`, [
      { name: "Category", value: result.category, inline: true },
      { name: "Strikes (24h)", value: String(count), inline: true },
    ]);
    return true;
  }

  // ── @mention assistant ────────────────────────────────────
  async function fetchRecentMessages(message) {
    try {
      const recent = await message.channel.messages.fetch({ limit: 5, before: message.id });
      return [...recent.values()].reverse().map((m) => ({ author: m.author.username, content: m.content }));
    } catch {
      return [];
    }
  }

  async function answerMention(message) {
    if (cfg.assistant.adminOnly && !isAdmin(message.member)) {
      await message.reply({ content: "Only server admins can chat with me. Try `/help`.", allowedMentions: { parse: [] } });
      return;
    }
    if (!isClaudeConfigured()) {
      await message.reply({ content: "My AI isn't set up yet (ANTHROPIC_API_KEY is missing on the worker).", allowedMentions: { parse: [] } });
      return;
    }
    const question = message.content.replace(new RegExp(`<@!?${client.user.id}>`, "g"), "").trim();
    if (!question) {
      await message.reply({ content: "Hi! Ask me something after the @mention.", allowedMentions: { parse: [] } });
      return;
    }
    await message.channel.sendTyping().catch(() => {});
    const answer = await askAssistant({
      question,
      discordId: message.author.id,
      username: message.member?.displayName || message.author.username,
      recentMessages: await fetchRecentMessages(message),
      db: getDb(),
      cfg,
    });
    await message.reply({ content: answer, allowedMentions: { parse: [], repliedUser: true } });
  }

  // ── Event handlers ────────────────────────────────────────
  async function handleMessage(message) {
    if (message.author.bot || !message.inGuild()) return;

    if (mod.enabled) {
      const settings = await loadSettings({ db: getDb(), cfg, maxAgeMs: 60_000 });
      const skipped =
        settings.skipChannelIds.includes(message.channelId) ||
        settings.skipUserIds.includes(message.author.id) ||
        (mod.skipModerators && isModerator(message.member));
      if (!skipped && (await runModeration(message, settings))) return;
    }

    if (cfg.assistant.enabled && client.user && message.mentions.users.has(client.user.id)) {
      await answerMention(message);
    }
  }

  async function handleMemberJoin(member) {
    if (!mod.enabled || !isNewAccount(member.user.createdAt, mod.newAccountDays)) return;
    await logToModChannel(
      "New account joined",
      [
        { name: "Person", value: `<@${member.id}> (${member.user.tag})`, inline: true },
        { name: "Account age", value: `${accountAgeDays(member.user.createdAt)} day(s)`, inline: true },
      ],
      COLORS.warn
    );
  }

  client.once(Events.ClientReady, (ready) => {
    console.log(`[worker] Logged in as ${ready.user.tag}, watching ${ready.guilds.cache.size} server(s).`);
  });
  client.on(Events.MessageCreate, (message) =>
    handleMessage(message).catch((err) => console.error("[worker] Message handler error:", err))
  );
  client.on(Events.GuildMemberAdd, (member) =>
    handleMemberJoin(member).catch((err) => console.error("[worker] Join handler error:", err))
  );

  return { client, handleMessage, handleMemberJoin };
}

function printStartupReport(cfg) {
  const on = (yes, text) => `${yes ? "on " : "off"}  ${text}`;
  const problems = validateConfig(cfg);
  if (problems.length) {
    console.warn("[worker] bot.config.js has problems:");
    for (const problem of problems) console.warn(`  - ${problem}`);
  }
  console.log("[worker] Features:");
  console.log(`  ${on(cfg.moderation.enabled, "Spam and link checks")}`);
  console.log(`  ${on(cfg.moderation.enabled && isClaudeConfigured(), `AI moderation${isClaudeConfigured() ? ` (${getModel()})` : " (ANTHROPIC_API_KEY not set)"}`)}`);
  console.log(`  ${on(cfg.assistant.enabled && isClaudeConfigured(), "@mention assistant")}`);
  console.log(`  ${on(hasEnv("MOD_LOG_CHANNEL_ID"), "Mod log channel (MOD_LOG_CHANNEL_ID)")}`);
  console.log(`  ${on(hasEnv("QUARANTINE_ROLE_ID"), "Quarantine role (QUARANTINE_ROLE_ID; timeouts are used without it)")}`);
  console.log(`  ${on(isDatabaseConfigured(), "Database settings (without it, settings come from bot.config.js)")}`);
}

async function start() {
  if (!hasEnv("DISCORD_TOKEN")) {
    console.error("[worker] DISCORD_TOKEN is not set. Add it in Railway (Variables tab) or in your local .env file.");
    process.exitCode = 1;
    return;
  }
  printStartupReport(defaultConfig);
  const { client } = createModerator();
  await client.login(env("DISCORD_TOKEN"));
}

// Only connect to Discord when this file is run directly (not when a test requires it).
if (require.main === module) {
  start().catch((err) => {
    console.error("[worker] Could not start:", err.message);
    if (/disallowed intents/i.test(err.message)) {
      console.error("[worker] Turn on MESSAGE CONTENT and SERVER MEMBERS intents: Developer Portal > your app > Bot.");
    }
    process.exit(1);
  });
}

module.exports = { createModerator, start, isModerator, isAdmin };
