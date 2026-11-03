const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler } = require("../api/levelup-webhook");
const { createFakeDb, fakeReq, fakeRes, withEnv, IDS } = require("./helpers/fakes");

const SECRET = "a-long-random-test-secret-0123456789";
const WEBHOOK = ["https://discord.com/api/webhooks", "123", "test-token"].join("/");
const goodEnv = { WEBHOOK_SECRET: SECRET, DISCORD_WEBHOOK_URL: WEBHOOK, SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined };

const levelUp = {
  type: "UPDATE",
  table: "players",
  record: { id: "p1", username: "Alex", level: 5, discord_id: IDS.user },
  old_record: { id: "p1", username: "Alex", level: 4 },
};

async function call(handler, { secret = SECRET, body = levelUp, method = "POST" } = {}) {
  const res = fakeRes();
  const headers = secret === null ? {} : { "x-webhook-secret": secret };
  await handler(fakeReq({ method, headers, body: JSON.stringify(body) }), res);
  return { status: res.statusCode, body: res.json() };
}

function setup({ dbAnswers } = {}) {
  let i = 0;
  const db = createFakeDb(() => (dbAnswers ? dbAnswers[i++] : { error: null }));
  const posts = [];
  const handler = createHandler({
    getDb: () => db,
    post: async (url, message) => posts.push({ url, message }),
    syncRoles: async () => ({ skipped: "No roleRewards in bot.config.js." }),
  });
  return { handler, db, posts };
}

test("fails closed when WEBHOOK_SECRET isn't set", async () => {
  await withEnv({ ...goodEnv, WEBHOOK_SECRET: undefined }, async () => {
    const { status, body } = await call(setup().handler, { secret: null });
    assert.equal(status, 500);
    assert.match(body.error, /WEBHOOK_SECRET is not set/);
  });
});

test("rejects a wrong or missing secret", async () => {
  await withEnv(goodEnv, async () => {
    const { handler, posts } = setup();
    assert.equal((await call(handler, { secret: "wrong" })).status, 401);
    assert.equal((await call(handler, { secret: null })).status, 401);
    assert.equal(posts.length, 0);
  });
});

test("returns a clear error when no database is connected", async () => {
  await withEnv(goodEnv, async () => {
    const handler = createHandler(); // real getDb: no SUPABASE_* vars, so no database
    const { status, body } = await call(handler);
    assert.equal(status, 503);
    assert.match(body.error, /No database connected/);
  });
});

test("posts a level-up once, then skips the duplicate", async () => {
  await withEnv(goodEnv, async () => {
    const { handler, posts } = setup({
      dbAnswers: [{ error: null }, { error: { code: "23505", message: "duplicate key" } }],
    });
    const first = await call(handler);
    assert.equal(first.status, 200);
    assert.equal(first.body.announced, true);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, WEBHOOK);
    assert.equal(posts[0].message.content, `🎉 <@${IDS.user}> just reached **level 5**!`);

    const second = await call(handler);
    assert.match(second.body.skipped, /duplicate/);
    assert.equal(posts.length, 1);
  });
});

test("ignores updates where the level didn't go up", async () => {
  await withEnv(goodEnv, async () => {
    const { handler, posts, db } = setup();
    const sameLevel = { ...levelUp, record: { ...levelUp.record, level: 4 } };
    const { status, body } = await call(handler, { body: sameLevel });
    assert.equal(status, 200);
    assert.match(body.skipped, /did not go up/);
    assert.equal(posts.length, 0);
    assert.equal(db.queries.length, 0);
  });
});
