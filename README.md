# discord-community-bot

A beginner-friendly Discord bot template for **any app**.

It gives your server slash commands for stats and a leaderboard, posts level-ups, and moderates chat with Claude. You fit it to your app by editing **one file**: `bot.config.js`.

**Worked example:** this pattern powers the ARISExp fitness RPG's server.

---

## What it does

| Feature | Needs |
| --- | --- |
| `/help`: lists the commands | Discord only |
| Spam checks, blocked links, new-account link checks | Discord only |
| AI moderation with your own rules | Claude API key |
| `/ask` and `@bot` questions answered by Claude | Claude API key |
| `/mod`: admins view and edit moderation rules | Discord (saving changes needs Supabase) |
| `/stats`, `/leaderboard`, `/link` (connect Discord to an app account) | Supabase |
| Level-up announcements, plus optional level roles | Supabase |

**Supabase is optional.** Without it, moderation and the AI assistant still work fully. The data commands reply "No database connected yet".

### How the pieces fit

```
SLASH COMMANDS
  Discord ── /stats /leaderboard /link /ask /mod /help ──▶ Vercel: api/interactions.js
                                                                 │
                                                                 ▼ reads and saves
                                                       Supabase (optional)
                                                       your players table + bot settings
LEVEL-UPS                                                        │
                                                                 ▼ database webhook: "a level went up"
  Discord ◀── "🎉 @Alex just reached level 5!" ───── Vercel: api/levelup-webhook.js

MODERATION (always on)
  Discord ── every new message ──▶ Railway: bot/moderator.js
                                     1. spam and link checks (free, instant)
                                     2. Claude reads it with your rules
                                     3. warn, delete, timeout or quarantine
                                     4. reports it in your mod-log channel
                                   (rules come from Supabase, or bot.config.js)
```

Why two hosts? Slash commands and webhooks are short requests, which Vercel handles for free. Moderation needs a connection to Discord that stays open all the time, and Vercel can't do that. So a small worker runs on Railway.

---

## What you need

- **Node.js 22 or newer** on your computer ([nodejs.org](https://nodejs.org)). Check with `node --version`.
- A **Discord server** where you are an admin.
- A **GitHub** account (to store your copy of the code).
- A **Vercel** account. The free Hobby plan is enough.
- A **Railway** account for the moderation worker. Railway has a free trial. Check their site for current pricing.
- Optional: a **Claude API key** from the [Claude Console](https://platform.claude.com). You pay per use. Set a monthly spend limit there.
- Optional: a **Supabase** project ([supabase.com](https://supabase.com)). The free plan is enough.

---

## Setup

Do the steps in order. Each step says how to check that it worked.

### Step 1. Get the code

1. On GitHub, click **Use this template** (or clone the repo).
2. Open a terminal in the folder and run:
   ```bash
   npm install
   npm test
   ```
3. ✔ Check: the last lines say `# fail 0`.

### Step 2. Fit it to your app

1. Open `bot.config.js`.
2. Set `appName` to your app's name.
3. Have a database already? Change the table and column names to match yours. Every name the bot uses is in this file.
4. No database yet? Leave the names as they are. You can add Supabase later (Step 10).
5. ✔ Check: `npm test` still passes.

### Step 3. Create the Discord app and bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications). Click **New Application**. Give it a name.
2. On **General Information**, find the **Application ID** and **Public Key**. You'll need them soon.
3. Open the **Bot** tab.
   1. Click **Reset Token**, then copy the token. **This is a password.** Save it in a password manager. Never paste it in a chat or a file you commit.
   2. Under **Privileged Gateway Intents**, turn on **Server Members Intent** and **Message Content Intent**. Click **Save Changes**.
4. In Discord itself, turn on **User Settings → Advanced → Developer Mode**. Now you can right-click servers, channels and roles and pick **Copy ID**.

### Step 4. Make your local `.env` file

Your computer needs a few values to register commands.

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` in your editor. Fill in `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY` and `DISCORD_TOKEN`.
3. Recommended: fill in `DISCORD_GUILD_ID` (right-click your server icon → **Copy Server ID**). Commands then show up in your server instantly.
4. Run:
   ```bash
   npm run doctor
   ```
5. ✔ Check: the required lines say `✓ set`. The doctor never prints your values.

`.env` is already in `.gitignore`. Read [Never commit your .env](#never-commit-your-env) before you go further.

### Step 5. Invite the bot to your server

1. In the Developer Portal, open **OAuth2 → URL Generator**.
2. Under **Scopes**, tick `bot` and `applications.commands`.
3. Under **Bot Permissions**, tick: View Channels, Send Messages, Embed Links, Read Message History, Manage Messages, Moderate Members, Manage Roles.
4. Copy the URL at the bottom. Open it in your browser, pick your server, and click **Authorize**.
5. In your server, open **Server Settings → Roles**. Drag the bot's role **above** any role it should give out (quarantine and level roles).
6. ✔ Check: the bot appears in your server's member list (offline for now, that's normal).

### Step 6. Deploy to Vercel

1. Run `npm run check`, then push your code to GitHub. A private repo is fine.
2. On [vercel.com](https://vercel.com), click **Add New → Project** and import your repo. Framework Preset: **Other**. Leave the build settings empty.
3. Open **Environment Variables** and add:
   - `DISCORD_PUBLIC_KEY` (required)
   - `ANTHROPIC_API_KEY` (optional, for `/ask`)
4. Click **Deploy**.
5. ✔ Check: open `https://YOUR-PROJECT.vercel.app`. You should see "Your bot's API is deployed".
6. ✔ Check: open `https://YOUR-PROJECT.vercel.app/api/interactions`. You should see "Method not allowed". That's good: it means the function is running.

**Changed an environment variable later?** Vercel only picks it up after a redeploy: **Deployments → ⋯ → Redeploy**.

### Step 7. Set the Interactions Endpoint URL

1. Back in the Developer Portal, open **General Information**.
2. In **Interactions Endpoint URL**, paste:
   ```
   https://YOUR-PROJECT.vercel.app/api/interactions
   ```
   Use your **production** domain (the short one). Don't use a preview URL with random letters in it.
3. Click **Save Changes**. Discord sends a test request to your URL.
4. ✔ Check: it saves without an error. If it fails, see [Troubleshooting](#troubleshooting).

### Step 8. Register the slash commands

1. On your computer, run:
   ```bash
   npm run register
   ```
2. ✔ Check: it lists `/stats`, `/leaderboard`, `/link`, `/ask`, `/mod` and `/help`.
3. ✔ Check: in your server, type `/help`. The bot answers.

Run `npm run register` again whenever you add or change a command, or change `appName` or `linking.method`.

### Step 9. Run the moderation worker on Railway

1. On [railway.com](https://railway.com), click **New Project → Deploy from GitHub repo** and pick your repo.
2. Open the service's **Variables** tab and add:
   - `DISCORD_TOKEN` (required)
   - `ANTHROPIC_API_KEY` (optional, turns on AI moderation and `@bot` answers)
   - `MOD_LOG_CHANNEL_ID` (optional, recommended): make a private `#mod-log` channel, right-click it → **Copy Channel ID**.
   - `QUARANTINE_ROLE_ID` (optional): make a role called "Quarantine". In your channel or category permissions, deny it **View Channel**. Copy its ID. Without it, the bot uses timeouts.
3. Railway runs `npm start` by itself. You don't need a start command.
4. ✔ Check: in **Deployments → View logs**, you see `[worker] Logged in as ...` and a list of features that are on.
5. ✔ Check: from a **non-admin** test account, send the same message 3 times quickly. The bot deletes it and gives a short timeout. (Admins and moderators are skipped on purpose.)

### Step 10 (optional). Connect Supabase

**10a. Create the tables**

1. Create a project on [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**. Paste all of `supabase/schema.sql` and click **Run**.
   - Already have a players table? Read the top of `schema.sql`. Skip section 1 and run section 1b on your table.
3. Make sure `bot.config.js` matches your table and column names. Push the change.

**10b. Give the bot access**

1. In Supabase, open **Project Settings**. Copy the **Project URL** (under **Data API**).
2. Under **API Keys**, copy a **secret** key (it starts with `sb_secret_`). Older projects call it the `service_role` key. This key skips all security rules, so it only goes in server dashboards.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to **both** Vercel and Railway. Redeploy both.
4. ✔ Check: add the test players from section 4 of `schema.sql`. In Discord, run `/leaderboard`, then `/link code:ALICE1`, then `/stats`.
5. ✔ Check: `/mod show` now says the settings are saved in the database.

**10c. Level-up announcements**

1. In Discord, pick an announcements channel. Open **Edit Channel → Integrations → Webhooks → New Webhook**, then **Copy Webhook URL**. Add it to Vercel as `DISCORD_WEBHOOK_URL`.
2. Make a long random secret (32+ characters) with your password manager. Add it to Vercel as `WEBHOOK_SECRET`. Redeploy.
3. In Supabase, create the database webhook. Follow section 5 of `supabase/schema.sql`. Put the same secret in the `x-webhook-secret` header.
4. ✔ Check: in the SQL Editor, run:
   ```sql
   update public.players set level = level + 1 where username = 'alice';
   ```
   An announcement appears in your channel.

**10d. Level roles (optional)**

1. Add role IDs to `levelUp.roleRewards` in `bot.config.js`.
2. Add `DISCORD_TOKEN` and `DISCORD_GUILD_ID` to Vercel. Redeploy.
3. ✔ Check: level a linked player past a reward level. They get the role.

---

## Commands

| Command | Who can use it | What it does |
| --- | --- | --- |
| `/help` | Everyone | Lists the commands |
| `/stats` | Everyone | Shows your stats (the columns in `players.statsColumns`) |
| `/leaderboard` | Everyone | Top players by `players.scoreColumn` |
| `/link code:ABC123` | Everyone | Connects your Discord to your app account |
| `/ask question:...` | Admins (change with `assistant.adminOnly`) | Asks the Claude helper |
| `/mod show` | Admins | Shows rules and skipped channels and people |
| `/mod add-rule` / `remove-rule` | Admins | Edits the moderation rules |
| `/mod skip-channel` / `skip-user` | Admins | Turns moderation off or on for a channel or person |

"Admins" means people with the **Manage Server** or **Administrator** permission.

### How linking works

By default (`linking.method: "code"`), your app gives each player a short one-time code. It saves the code in the `discord_link_code` column and shows it to the player. The player types `/link code:K7Q2MX` in Discord, and the bot fills in `discord_id` and clears the code.

The simpler `"name"` method lets players type their username instead. It's easier, but anyone could claim a name that isn't linked yet. Use it only for small, trusted servers.

### How moderation decides

1. **Spam** (too many messages too fast, or the same message 3 times): deleted, plus a timeout.
2. **Blocked links and phrases** (`moderation.suspiciousLinks`): deleted. From a brand-new account: quarantined.
3. **Links from new accounts** (younger than `moderation.newAccountDays`): deleted.
4. **AI check**: Claude reads the message with your rules. A first offense gets a warning. Repeats get deleted, then a timeout. Severe messages get a quarantine.

Edit the rules in `bot.config.js`, or with `/mod` once Supabase is connected. Edit how the AI thinks with `moderation.instructions`.

---

## Environment variables

Every variable is explained in `.env.example`. Here's where each one goes:

| Variable | Vercel | Railway | Your `.env` |
| --- | :---: | :---: | :---: |
| `DISCORD_PUBLIC_KEY` | required | | for `npm run doctor` |
| `DISCORD_APP_ID` | | | required (register) |
| `DISCORD_TOKEN` | level roles only | required | required (register) |
| `DISCORD_GUILD_ID` | level roles only | | recommended |
| `ANTHROPIC_API_KEY` | for `/ask` | for AI moderation | to test the worker |
| `ANTHROPIC_MODEL` | optional | optional | optional |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | for data commands | for `/mod` settings | optional |
| `DISCORD_WEBHOOK_URL`, `WEBHOOK_SECRET` | for level-ups | | optional |
| `MOD_LOG_CHANNEL_ID`, `QUARANTINE_ROLE_ID` | | optional | optional |
| `MOD_SKIP_CHANNEL_IDS`, `MOD_SKIP_USER_IDS` | | optional | optional |

The default Claude model is `claude-haiku-5-5`, which is fast and cheap. Set `ANTHROPIC_MODEL` to use a different one.

---

## Test on your computer

| Command | What it does | Needs |
| --- | --- | --- |
| `npm test` | Runs the unit tests | Nothing |
| `npm run check` | Scans the repo for secrets | Nothing |
| `npm run doctor` | Checks `bot.config.js`, and shows which variables are set (never their values) | `.env` |
| `npm run dev:worker` | Runs the moderation worker with your `.env` | `.env` with `DISCORD_TOKEN` |

`npm run dev:worker` is the same as:

```bash
node --env-file=.env bot/moderator.js
```

The `--env-file` flag needs Node 20.6 or newer. This project needs Node 22+ because the Supabase library does. Stop the worker with **Ctrl+C**.

Don't run the worker on your computer and on Railway at the same time. Every message would be checked twice.

Slash commands need a public HTTPS address, so test them on your Vercel deployment.

---

## Troubleshooting

**Discord says "interactions endpoint URL could not be verified".**
- Is `DISCORD_PUBLIC_KEY` set in Vercel, and did you **redeploy** after adding it?
- Did you copy the **Public Key** (not the token or the Application ID)?
- Does the URL end in `/api/interactions`?
- Use the production domain. Vercel protects preview URLs with a login, and Discord can't get past it.

**"The application did not respond".**
Open Vercel → your project → **Logs** and look for a red line. A database error usually means a name in `bot.config.js` doesn't match your table.

**The slash commands don't show up.**
Run `npm run register`. Then restart Discord (Ctrl+R or Cmd+R). Global commands (no `DISCORD_GUILD_ID`) can take a while.

**Every command shows up twice.**
You registered them both globally and to your server. Remove one set. For example, remove the global ones by running this with `DISCORD_GUILD_ID` empty in `.env`:
`npm run register -- --clear`.

**The worker crashes with "Used disallowed intents".**
Turn on **Server Members Intent** and **Message Content Intent** in the Developer Portal's **Bot** tab.

**The bot is online but doesn't moderate.**
- Test from a non-admin account. Moderators are skipped (`moderation.skipModerators`).
- Is the channel or person in the skip lists? Run `/mod show`.
- For AI checks: is `ANTHROPIC_API_KEY` set **on Railway**? Messages shorter than `minMessageLength` skip the AI.

**The bot can't delete, time out, or give roles.**
Check its permissions (Step 5). Move the bot's role above the roles it manages. Discord never lets bots time out admins or the server owner.

**`/stats` says "No database connected yet".**
Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Vercel, then redeploy.

**Level-ups aren't posted.**
- In Supabase's SQL Editor, run the last query in `supabase/schema.sql`. It shows what your Vercel function answered.
- `401` means the `x-webhook-secret` header doesn't match `WEBHOOK_SECRET`.
- `503` means the Supabase variables aren't set in Vercel.
- "skipped" means the level didn't go up, or the table name doesn't match `players.table`.

**The bot suddenly logs out, or says the token is invalid.**
The token was reset. Discord resets tokens on its own when it finds them in public places like GitHub. Make a new token and update Railway, Vercel and your `.env`.

---

## Never commit your .env

> **Your `.env` file holds passwords to your bot, your database and your Claude account. Never commit it. Never paste it into a chat, an issue or a screenshot.**

This repo protects you in three ways:

1. `.gitignore` keeps `.env` and `.env.*` out of git. Only `.env.example` (which has no real values) is committed.
2. `npm run check` fails if a `.env` file is tracked, or if any file contains something that looks like a real token or key. Run it before every commit.
3. GitHub Actions runs the same check on every push and pull request.

### If you committed a secret anyway

Deleting the file, or even rewriting git history, is **not enough**. Assume the secret is already copied. Reset every value that was in the file:

1. **Discord bot token:** Developer Portal → **Bot** → **Reset Token**.
2. **Claude API key:** Claude Console → **API Keys**. Delete the old key and create a new one.
3. **Supabase key:** **Project Settings → API Keys**. Create a new secret key and delete the old one. (Older projects with a `service_role` key: rotate the JWT secret instead.)
4. **Discord webhook URL:** delete the webhook in the channel's **Integrations** settings and make a new one.
5. **WEBHOOK_SECRET:** make up a new one. Change it in Vercel and in the Supabase webhook header.

Then put the new values in the **Vercel** and **Railway** dashboards and in your local `.env`, and **redeploy** both. Finally, remove the file from git (`git rm --cached .env`), commit, and run `npm run check`.

---

## Project structure

```
bot.config.js            ← the one file you edit: table names, messages, rules
api/
  interactions.js        Vercel: slash commands (signature-checked)
  levelup-webhook.js     Vercel: database webhook → level-up posts and roles
bot/
  moderator.js           Railway: always-on moderation worker
commands/                one file per slash command (copy help.js to add one)
lib/
  players.js             every query on your players table
  settings.js            /mod settings (database, or bot.config.js)
  moderation.js          the AI moderation prompt and decision ladder
  antispam.js            spam, link and new-account checks
  assistant.js           the /ask and @mention helper
  claude.js              calls the Claude API
  format.js              embeds, leaderboard text, message templates
  levelup.js             level-up detection and duplicate protection
  roles.js               level role rewards
  security.js            timing-safe secret check
  ...                    small helpers (env, http, replies, permissions)
scripts/
  register-commands.js   npm run register
  check-secrets.js       npm run check
  doctor.js              npm run doctor
supabase/schema.sql      example tables + webhook setup steps
test/                    npm test
CLAUDE.md                instructions for Claude Code to set this up for you
```

Want Claude Code to help you set it up? Open this folder in Claude Code. It reads `CLAUDE.md` and walks you through the steps, without ever asking for your secrets.

---

## License

MIT. See [LICENSE](LICENSE).
