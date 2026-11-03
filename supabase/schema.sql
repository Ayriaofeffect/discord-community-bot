-- supabase/schema.sql
-- Example tables for discord-community-bot.
--
-- HOW TO RUN: Supabase dashboard > SQL Editor > New query > paste this file > Run.
-- It is safe to run more than once ("if not exists").
--
-- ALREADY HAVE A PLAYERS / PROFILES TABLE? Don't make a second one.
-- Skip section 1, run section 1b on your own table instead, then put your
-- table and column names in bot.config.js. Run sections 2 and 3 as they are.
--
-- ABOUT SECURITY: Row Level Security (RLS) is turned ON for every table here,
-- with no public policies. That means the public "anon" key can't read or
-- change them. The bot uses the service role / secret key on the server only,
-- which is allowed through.

-- ─────────────────────────────────────────────────────────────
-- 1. players: an example of "your app's" table
--    Matches the default names in bot.config.js.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.players (
  id                uuid primary key default gen_random_uuid(),
  username          text not null unique,
  level             integer not null default 1,
  xp                integer not null default 0,
  -- Filled in by the bot when someone uses /link:
  discord_id        text unique,
  -- A one-time code your app shows the player (for /link code:...).
  -- Use short UPPERCASE codes, like 'K7Q2MX'. The bot clears it after use.
  discord_link_code text unique,
  created_at        timestamptz not null default now()
);

-- Makes /leaderboard fast.
create index if not exists players_xp_idx on public.players (xp desc);

alter table public.players enable row level security;

-- Your app will need its own policies for this table. Keep discord_link_code
-- private: only the player it belongs to should ever see their own code.
-- Example, if players.id is the same as the signed-in user's id:
--   create policy "Players can read their own row"
--     on public.players for select to authenticated
--     using ((select auth.uid()) = id);

-- ─────────────────────────────────────────────────────────────
-- 1b. Using your own table instead? Add the Discord columns to it.
--     Replace your_table with your table's name.
-- ─────────────────────────────────────────────────────────────
-- alter table public.your_table add column if not exists discord_id text unique;
-- alter table public.your_table add column if not exists discord_link_code text unique;

-- ─────────────────────────────────────────────────────────────
-- 2. bot_config: settings the bot saves (moderation rules, skipped
--    channels and people). Admins change these with /mod.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.bot_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.bot_config enable row level security;
revoke all on table public.bot_config from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. bot_announcements: remembers which level-ups were already posted,
--    so a webhook that fires twice doesn't post twice.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.bot_announcements (
  dedupe_key text primary key,
  created_at timestamptz not null default now()
);

alter table public.bot_announcements enable row level security;
revoke all on table public.bot_announcements from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Test data (optional). Remove the "--" to use it.
-- ─────────────────────────────────────────────────────────────
-- insert into public.players (username, level, xp, discord_link_code) values
--   ('alice', 3, 1200, 'ALICE1'),
--   ('bob',   2,  800, 'BOB222'),
--   ('cara',  5, 2400, 'CARA33')
-- on conflict (username) do nothing;
--
-- Then in Discord:  /leaderboard   and   /link code:ALICE1   and   /stats

-- ─────────────────────────────────────────────────────────────
-- 5. The level-up database webhook (set up in the dashboard, not SQL)
-- ─────────────────────────────────────────────────────────────
-- First deploy to Vercel and set WEBHOOK_SECRET and DISCORD_WEBHOOK_URL there.
--
-- 1. Supabase dashboard > Database > Webhooks (some dashboards show it under
--    Integrations > Database Webhooks). If asked, click "Enable webhooks".
-- 2. Click "Create a new hook".
-- 3. Name: levelup_to_discord
-- 4. Table: players (or your table from bot.config.js)
-- 5. Events: tick UPDATE only.
-- 6. Type: HTTP Request.  Method: POST.
-- 7. URL: https://YOUR-PROJECT.vercel.app/api/levelup-webhook
-- 8. HTTP Headers: add  x-webhook-secret  with the SAME value as WEBHOOK_SECRET.
--    (Type it in the dashboard. Don't save it in any file in this repo.)
-- 9. Save.
--
-- TEST IT: level a player up, and watch your announcements channel:
--   update public.players set level = level + 1 where username = 'alice';
--
-- NOT WORKING? See what your Vercel function answered (newest first):
--   select id, status_code, content, created
--   from net._http_response order by created desc limit 5;
