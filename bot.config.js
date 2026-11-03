// bot.config.js
// ─────────────────────────────────────────────────────────────
// This is the ONE file you edit to fit the bot to your app.
//
// - Table and column names must match your database exactly.
// - NO SECRETS HERE. Tokens and keys go in environment variables
//   (the Vercel and Railway dashboards, or your local .env file).
// - No database yet? Leave the names as they are. /stats, /leaderboard
//   and /link will say "No database connected yet" until you add one.
//   Moderation and the AI assistant work without a database.
//
// After you edit this file, run:  npm test   and   npm run doctor
// ─────────────────────────────────────────────────────────────

module.exports = {
  // Your app's name. It shows up in messages and embeds.
  appName: "My App",

  // Embed side color, as a hex number (0x + 6 digits).
  embedColor: 0x5865f2,

  // ── 1. Your players table ──────────────────────────────────
  // The table with one row per player (or user) in your app.
  players: {
    table: "players",
    idColumn: "id", // the primary key
    nameColumn: "username", // the name people see
    levelColumn: "level", // a number; when it goes up, the bot announces it
    scoreColumn: "xp", // a number; the leaderboard is sorted by this, highest first
    discordIdColumn: "discord_id", // a text column; the bot fills it in when someone links

    // What /stats shows. Each entry is one column from your table.
    statsColumns: [
      { column: "level", label: "Level" },
      { column: "xp", label: "XP" },
    ],
  },

  // ── 2. Linking Discord to your app ─────────────────────────
  linking: {
    // "code": your app shows the player a one-time code, and they type
    //         /link code:ABC123 in Discord. This is the safe choice.
    // "name": the player types their app username. It's easier, but anyone
    //         could claim a name that isn't linked yet.
    method: "code",

    // Only used when method is "code". Save codes in UPPERCASE.
    // The bot clears the code after it's used.
    codeColumn: "discord_link_code",
  },

  // ── 3. Leaderboard ─────────────────────────────────────────
  leaderboard: {
    size: 10, // how many players /leaderboard shows (1 to 25)
    scoreLabel: "XP", // the word shown after each score
  },

  // ── 4. Level-up announcements ──────────────────────────────
  // Needs a database webhook. See supabase/schema.sql and the README.
  levelUp: {
    // Placeholders you can use:
    //   {mention}  @player if they linked Discord, otherwise their name in bold
    //   {name}     their name     {level}  new level
    //   {oldLevel} old level      {app}    your appName
    message: "🎉 {mention} just reached **level {level}**!",

    // false = never ping, just show the name.
    mentionPlayer: true,

    // Optional: give Discord roles at certain levels.
    // To get a role ID: in Discord turn on Settings > Advanced > Developer Mode,
    // then go to Server Settings > Roles, right-click the role > Copy Role ID.
    // Needs DISCORD_TOKEN and DISCORD_GUILD_ID on Vercel, and the bot's own
    // role must be ABOVE these roles in your server's role list.
    roleRewards: [
      // { level: 5, roleId: "PUT_ROLE_ID_HERE" },
      // { level: 10, roleId: "PUT_ROLE_ID_HERE" },
    ],

    // false = keep only the highest role earned. true = keep all of them.
    keepLowerRoles: false,
  },

  // ── 5. Moderation (the Railway worker) ─────────────────────
  moderation: {
    enabled: true,

    // How the AI moderator should think. {app} becomes your appName.
    // Describe your community here: who it's for and what's normal.
    instructions:
      "You are a calm, fair moderator for the {app} Discord server. " +
      "Flag clear rule breaks only. Do not flag jokes, friendly banter, or swearing that isn't aimed at a person. " +
      "If you are not sure, do not flag. Use severity \"high\" only for threats, hate speech, " +
      "sexual content involving minors, sharing someone's private information, or scams.",

    // Your server rules, in plain English. Admins can also change these with
    // /mod add-rule and /mod remove-rule (when a database is connected).
    rules: [
      "Be kind. No insults, harassment, or hate speech.",
      "No sexual content or graphic violence.",
      "No threats, and never share someone else's personal information.",
      "No spam, scams, or advertising without permission.",
    ],

    // Messages shorter than this skip the AI check (saves money).
    minMessageLength: 10,

    // Channel and people IDs to never moderate. You can also use /mod skip-channel
    // and /mod skip-user, or the MOD_SKIP_CHANNEL_IDS / MOD_SKIP_USER_IDS env vars.
    skipChannelIds: [],
    skipUserIds: [],

    // true = people with the Manage Messages permission are never moderated.
    // Tip: set this to false for a moment if you want to test on yourself.
    skipModerators: true,

    // Discord accounts younger than this many days can't post links,
    // and their joins are reported in the mod log.
    newAccountDays: 7,

    // Spam: more than maxMessages in perSeconds, or the same message
    // maxDuplicates times in a row, gets a timeout.
    spam: { maxMessages: 5, perSeconds: 5, maxDuplicates: 3 },

    // Messages containing any of these are deleted (upper/lower case doesn't matter).
    // Remove "discord.gg/" if you're happy for people to share server invites.
    suspiciousLinks: [
      "discord.gg/",
      "discord.com/invite/",
      "discordapp.com/invite/",
      "free nitro",
      "steamcommunity.com/gift",
      "bit.ly/",
      "tinyurl.com/",
    ],

    // What happens when the AI flags someone:
    //   1st flag: a warning (or delete, if it's medium severity)
    //   2nd flag: the message is deleted
    //   strikesBeforeTimeout flags within 24 hours: a timeout
    //   "high" severity: quarantine (or timeout if you set this to false)
    strikesBeforeTimeout: 3,
    timeoutMinutes: 10,
    quarantineOnHighSeverity: true,

    // Upper limit on the AI's answer length. You rarely need to change this.
    maxTokens: 1024,
  },

  // ── 6. AI assistant (/ask and @mentions) ───────────────────
  assistant: {
    enabled: true,

    // true = only admins can use it. Every question costs a little on your
    // Anthropic account, so it's a good idea to start with true.
    adminOnly: true,

    // The assistant's personality and job. {app} becomes your appName.
    systemPrompt:
      "You are the friendly helper bot for the {app} Discord server. " +
      "Answer in a few short sentences. If you don't know something, say so. " +
      "Only use the app data you are given, and never make up player stats.",

    // true = give the assistant the asker's stats and the top 5 leaderboard.
    includeAppData: true,

    maxTokens: 1500,
  },

  // ── 7. Tables the bot owns ─────────────────────────────────
  // supabase/schema.sql creates these. Only change them if you renamed them.
  tables: {
    settings: "bot_config",
    announcements: "bot_announcements",
  },
};
