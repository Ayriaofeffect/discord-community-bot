// scripts/doctor.js
// Run with: npm run doctor   (reads your .env file)
//
// Checks bot.config.js and tells you which environment variables are set.
// It NEVER prints values, only "set", "missing", or "looks wrong".

const { config, validateConfig } = require("../lib/config");
const { env } = require("../lib/env");

const SNOWFLAKE = /^\d{17,20}$/;
const VARS = [
  { name: "DISCORD_APP_ID", need: "required", where: "your .env (register script)", check: (v) => SNOWFLAKE.test(v) },
  { name: "DISCORD_PUBLIC_KEY", need: "required", where: "Vercel", check: (v) => /^[0-9a-f]{64}$/i.test(v) },
  { name: "DISCORD_TOKEN", need: "required", where: "Railway, your .env, Vercel (for role rewards)", check: (v) => v.split(".").length === 3 },
  { name: "DISCORD_GUILD_ID", need: "optional", where: "your .env, Vercel (for role rewards)", check: (v) => SNOWFLAKE.test(v) },
  { name: "ANTHROPIC_API_KEY", need: "optional", where: "Railway and Vercel (AI features)", check: (v) => v.startsWith("sk-ant-") },
  { name: "ANTHROPIC_MODEL", need: "optional", where: "Railway and Vercel", check: () => true },
  { name: "SUPABASE_URL", need: "optional", where: "Vercel and Railway", check: (v) => /^https:\/\/\S+$/.test(v) },
  { name: "SUPABASE_SERVICE_ROLE_KEY", need: "optional", where: "Vercel and Railway", check: (v) => v.length > 20 },
  { name: "WEBHOOK_SECRET", need: "optional", where: "Vercel + the Supabase webhook header", check: (v) => v.length >= 24 },
  {
    name: "DISCORD_WEBHOOK_URL",
    need: "optional",
    where: "Vercel (level-up posts)",
    check: (v) => /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/.test(v),
  },
  { name: "MOD_LOG_CHANNEL_ID", need: "optional", where: "Railway", check: (v) => SNOWFLAKE.test(v) },
  { name: "QUARANTINE_ROLE_ID", need: "optional", where: "Railway", check: (v) => SNOWFLAKE.test(v) },
  { name: "MOD_SKIP_CHANNEL_IDS", need: "optional", where: "Railway", check: (v) => v.split(",").every((id) => SNOWFLAKE.test(id.trim())) },
  { name: "MOD_SKIP_USER_IDS", need: "optional", where: "Railway", check: (v) => v.split(",").every((id) => SNOWFLAKE.test(id.trim())) },
];

function main() {
  let failed = false;

  console.log("bot.config.js");
  const problems = validateConfig(config);
  if (problems.length) {
    failed = true;
    for (const problem of problems) console.log(`  ✗ ${problem}`);
  } else {
    console.log(`  ✓ looks good (app: ${config.appName}, players table: ${config.players.table})`);
  }

  console.log("\nEnvironment variables (values are never shown)");
  for (const v of VARS) {
    const value = env(v.name);
    let status;
    if (!value) {
      status = v.need === "required" ? "✗ missing" : "- not set";
      if (v.need === "required") failed = true;
    } else if (!v.check(value)) {
      status = "? set, but looks wrong";
      failed = true;
    } else {
      status = "✓ set";
    }
    console.log(`  ${status.padEnd(24)} ${v.name.padEnd(26)} (${v.need}; ${v.where})`);
  }

  const has = (name) => env(name) !== "";
  console.log("\nFeatures this .env would turn on");
  console.log(`  ${has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY") ? "on " : "off"}  /stats, /leaderboard, /link, /mod saving`);
  console.log(`  ${has("ANTHROPIC_API_KEY") ? "on " : "off"}  AI moderation and the AI assistant`);
  console.log(`  ${has("WEBHOOK_SECRET") && has("DISCORD_WEBHOOK_URL") ? "on " : "off"}  Level-up announcements`);
  console.log("\nRemember: Vercel and Railway don't read this file. Add the same variables in their dashboards.");

  if (failed) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { VARS, main };
