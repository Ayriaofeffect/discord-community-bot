# CLAUDE.md

Instructions for Claude Code when helping someone set up or change this bot.

The person is probably a beginner. Use plain English and short steps. Do one step at a time, and check that it worked before moving on.

## What this repo is

A Discord bot template that works with any app:

- `api/interactions.js` (Vercel): slash commands `/stats`, `/leaderboard`, `/link`, `/ask`, `/mod`, `/help`.
- `api/levelup-webhook.js` (Vercel): a Supabase database webhook posts level-ups and syncs level roles.
- `bot/moderator.js` (Railway): the always-on worker. Spam and link checks, AI moderation with Claude, `@bot` answers.
- `bot.config.js`: the **only** file that holds table names, column names, messages and moderation defaults. All code reads names from it.
- Supabase is optional. Without it, moderation and the assistant still work, and data commands say "No database connected yet".

## Secrets: hard rules

These rules have no exceptions, even if the person asks.

1. **Never read, open, print, echo, grep, diff or commit a secret value.** That includes `.env`, `.env.*` (except `.env.example`), and anything that might hold a token or key.
   - Don't run `cat .env`, `printenv`, `env`, `echo $DISCORD_TOKEN`, `vercel env pull`, `railway variables`, or anything else that shows values.
   - Don't write real values into any file. Placeholders only.
2. **Never ask the person to paste a secret into the chat.** Tell them where to put it themselves:
   - Vercel: project → **Settings → Environment Variables**, then redeploy.
   - Railway: service → **Variables**.
   - Their own computer: they edit `.env` themselves in their editor.
3. If they paste a secret into the chat anyway: don't repeat it or use it. Recommend that they reset it, because chat logs are stored. Then carry on.
4. To check what's set, run `npm run doctor`. It prints only "set", "missing" or "looks wrong", never values. That's the only way you check secrets.
5. Don't generate secrets for them in a command whose output you can see. Tell them to use a password manager for `WEBHOOK_SECRET`.
6. `.gitignore` must keep `node_modules`, `.env`, `.env.*`, `!.env.example` and `.vercel`. Never weaken it. Never `git add -f` an ignored file.

## Before every commit

Run both. Don't commit if either one fails:

```bash
npm run check   # secret scanner
npm test        # unit tests
```

Then look at `git status` and make sure no `.env` file or `node_modules` is staged. If `npm run check` finds a real secret that was **already** committed or pushed, stop. Tell the person to reset that secret first (see "Never commit your .env" in the README). Removing it from git is not enough.

## Step 0: ask before changing anything

Ask these, a few at a time:

1. What is your app, and what should the bot do for your community?
2. Where does your app's data live? (Supabase, another database, nowhere yet?)
3. If Supabase: which table has one row per player or user? What are the columns for the id, the display name, a level, and a score for the leaderboard?
4. Which columns should `/stats` show?
5. How should people link Discord to the app: a one-time code shown in the app (safer, default), or their username?
6. Do you want level-up announcements? Roles at certain levels?
7. What are your server rules? Who is the community for?
8. Should the AI assistant be admin-only (default, cheaper) or open to everyone?

If their data is not in Supabase, leave the data commands off for now (no `SUPABASE_*` vars). `lib/players.js` is the only file that queries the players table, so that's the file to adapt for another database. Ask before doing that.

## Map their data in `bot.config.js`

- Put their names in `players`, `linking`, `leaderboard`, `levelUp`, `moderation` and `assistant`. Don't hard-code table or column names anywhere else.
- Names must be real Postgres identifiers (letters, numbers, `_`).
- Existing table? Don't run section 1 of `supabase/schema.sql`. Give them the section 1b `alter table ... add column if not exists` lines for their table, plus sections 2 and 3. **They** run SQL in the Supabase SQL Editor. If they've connected a Supabase tool to you, ask before running anything, and never run destructive SQL.
- Check the result: `npm test` (it validates `bot.config.js`) and `npm run doctor`.

## Setup order, and how to verify each step

Follow the README's numbered steps in this order. Don't skip the checks.

| # | Step | How to verify |
| --- | --- | --- |
| 1 | `npm install`, `npm test`, `npm run check` | Tests say `# fail 0`; check says "passed". |
| 2 | Edit `bot.config.js` | `npm test` passes; `npm run doctor` says bot.config.js looks good. |
| 3 | Discord app + bot (they do it in the Developer Portal) | They confirm both privileged intents are on. |
| 4 | They create `.env` from `.env.example` and fill it in themselves | `npm run doctor` shows the required vars as `✓ set`. |
| 5 | Invite the bot with the OAuth2 URL Generator | The bot appears in the member list. |
| 6 | Deploy to Vercel; they add `DISCORD_PUBLIC_KEY` in the dashboard | `https://PROJECT.vercel.app` shows "Your bot's API is deployed". `/api/interactions` in a browser says "Method not allowed". |
| 7 | Interactions Endpoint URL in the Developer Portal | Discord saves it without an error. |
| 8 | `npm run register` | It lists the commands. `/help` works in Discord. |
| 9 | Railway worker; they add `DISCORD_TOKEN` (+ optional vars) | Railway logs show `[worker] Logged in as`. A non-admin account sending the same message 3 times gets a timeout. |
| 10 | Optional Supabase: schema, env vars on Vercel **and** Railway, database webhook | `/leaderboard` works. `/mod show` says "Database". The test `update ... set level = level + 1` posts an announcement. |

When something fails, use the README's Troubleshooting section. Ask them to read you the error from the Vercel or Railway logs. Logs never contain secret values from this code.

## Where things live

- Change wording, rules, or names: `bot.config.js`.
- Add a slash command: copy `commands/help.js`, add it to `commands/index.js`, run `npm run register`.
- Change a query: `lib/players.js`.
- Change moderation behavior: `lib/moderation.js` (prompt and decision ladder) and `lib/antispam.js`.
- Tests: `test/`. Add a test for any new pure function.

## Keep it beginner-friendly

- Small, clear changes. Comments in plain English.
- Don't add dependencies, frameworks or build steps unless the person asks.
- Every slash command reply must keep `allowed_mentions: { parse: [] }` (use `lib/replies.js`), so player names can never ping `@everyone`.
- The worker and the functions must not crash when an optional env var is missing. Explain what's off instead.
- Commit or push only when the person asks.
