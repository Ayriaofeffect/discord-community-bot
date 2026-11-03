// Fake secrets below are glued together at runtime, so this file itself
// never contains a complete secret-looking string (and passes `npm run check`).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { scanText, checkPaths, runCheck } = require("../scripts/check-secrets");

const fakeDiscordToken = ["MTIzNDU2Nzg5MDEyMzQ1Njc4", "GbCdEf", "q1W2e3R4t5Y6u7I8o9P0a1S2d3F4g5H6j7K8"].join(".");
const fakeAnthropicKey = ["sk", "ant", "api03", "Ab12Cd34Ef56Gh78Ij90Kl12Mn34"].join("-");
const fakeSupabaseSecret = ["sb", "secret", "Ab12Cd34Ef56Gh78Ij90Kl12"].join("_");
const fakeWebhookUrl = ["https://discord.com/api/webhooks", "1".repeat(18), "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"].join("/");
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const fakeServiceRoleJwt = [b64({ alg: "HS256", typ: "JWT" }), b64({ role: "service_role", iss: "supabase" }), "AbCdEfGhIjKlMnOpQrStUv0123"].join(".");

test("flags a fake Discord bot token, without printing all of it", () => {
  const findings = scanText(`DISCORD_TOKEN=${fakeDiscordToken}`);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "Discord bot token");
  assert.equal(findings[0].line, 1);
  assert.ok(!findings[0].preview.includes(fakeDiscordToken));
});

test("flags Anthropic keys, Supabase keys, and real-looking webhook URLs", () => {
  const text = [
    `ANTHROPIC_API_KEY=${fakeAnthropicKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${fakeServiceRoleJwt}`,
    `SUPABASE_SERVICE_ROLE_KEY=${fakeSupabaseSecret}`,
    `DISCORD_WEBHOOK_URL=${fakeWebhookUrl}`,
  ].join("\n");
  const kinds = scanText(text).map((f) => `${f.line}:${f.kind}`);
  assert.deepEqual(kinds, [
    "1:Anthropic API key",
    "2:Supabase service-role key (JWT)",
    "3:Supabase secret key",
    "4:Discord webhook URL",
  ]);
});

test("allows placeholders like the ones in .env.example and the docs", () => {
  const placeholders = [
    "DISCORD_TOKEN=your-discord-bot-token",
    "DISCORD_TOKEN=",
    "ANTHROPIC_API_KEY=sk-ant-your-key-goes-here-xxxxxxxx",
    "DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-id/your-webhook-token",
    "DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123456789012345678/xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "SUPABASE_URL=https://your-project.supabase.co",
  ].join("\n");
  assert.deepEqual(scanText(placeholders), []);

  const envExample = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
  assert.deepEqual(scanText(envExample), []);
});

test("flags tracked .env files and node_modules, but allows .env.example", () => {
  assert.deepEqual(checkPaths([".env.example", "README.md", "lib/env.js"]), []);
  const problems = checkPaths([".env", "config/.env.local", "node_modules/a/index.js", "node_modules/b/index.js", ".vercel/project.json"]);
  assert.equal(problems.length, 4);
  assert.match(problems[0], /^\.env: \.env files must never be committed/);
  assert.match(problems[1], /^config\/\.env\.local:/);
  assert.match(problems.join("\n"), /\.vercel folder/);
  assert.match(problems.join("\n"), /2 file\(s\) inside node_modules/);
});

test("runCheck catches a staged .env and a secret in a new file (real git)", (t) => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
  } catch {
    t.skip("git is not installed");
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-secrets-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules\n.env\n");
    fs.writeFileSync(path.join(dir, "ok.js"), "module.exports = 1;\n");
    assert.deepEqual(runCheck(dir).problems, []);

    fs.writeFileSync(path.join(dir, ".env"), `DISCORD_TOKEN=${fakeDiscordToken}\n`);
    assert.deepEqual(runCheck(dir).problems, []); // ignored and not tracked: fine

    execFileSync("git", ["add", "-f", ".env"], { cwd: dir }); // forced in by mistake
    fs.writeFileSync(path.join(dir, "notes.txt"), `key: ${fakeAnthropicKey}\n`);
    const problems = runCheck(dir).problems.join("\n");
    assert.match(problems, /\.env: \.env files must never be committed/);
    assert.match(problems, /\.env:1: looks like a Discord bot token/);
    assert.match(problems, /notes\.txt:1: looks like a Anthropic API key/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
