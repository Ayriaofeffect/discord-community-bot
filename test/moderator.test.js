// Tests for the worker's message pipeline, with fake Discord messages.
// The bot never logs in to Discord here.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createModerator } = require("../bot/moderator");
const { withEnv, IDS } = require("./helpers/fakes");

const DAY = 24 * 60 * 60 * 1000;
const quietEnv = {
  ANTHROPIC_API_KEY: undefined,
  MOD_LOG_CHANNEL_ID: undefined,
  QUARANTINE_ROLE_ID: undefined,
  SUPABASE_URL: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined,
  MOD_SKIP_CHANNEL_IDS: undefined,
  MOD_SKIP_USER_IDS: undefined,
};

function fakeMessage({ content, accountDays = 365, moderator = false, bot = false }) {
  const log = [];
  const message = {
    content,
    channelId: IDS.channel,
    guild: { name: "Test Server" },
    inGuild: () => true,
    author: {
      id: IDS.otherUser,
      bot,
      username: "sam",
      tag: "sam",
      createdAt: new Date(Date.now() - accountDays * DAY),
      send: async () => log.push("dm"),
    },
    member: {
      permissions: { has: () => moderator },
      moderatable: true,
      displayName: "Sam",
      timeout: async () => log.push("timeout"),
      roles: { add: async () => log.push("quarantine") },
    },
    delete: async () => log.push("delete"),
    reply: async () => log.push("reply"),
    mentions: { users: { has: () => false } },
    channel: { sendTyping: async () => {}, messages: { fetch: async () => new Map() } },
  };
  return { message, log };
}

async function withWorker(fn) {
  const worker = createModerator({ getDb: () => null });
  const quiet = console.log;
  console.log = () => {};
  try {
    await withEnv(quietEnv, () => fn(worker));
  } finally {
    console.log = quiet;
    await worker.client.destroy();
  }
}

test("ignores bots", () =>
  withWorker(async ({ handleMessage }) => {
    const { message, log } = fakeMessage({ content: "free nitro here", bot: true });
    await handleMessage(message);
    assert.deepEqual(log, []);
  }));

test("repeated messages get deleted and a timeout", () =>
  withWorker(async ({ handleMessage }) => {
    let last;
    for (let i = 0; i < 3; i++) {
      last = fakeMessage({ content: "buy cheap coins now" });
      await handleMessage(last.message);
    }
    assert.deepEqual(last.log, ["delete", "timeout", "dm"]);
  }));

test("moderators are skipped", () =>
  withWorker(async ({ handleMessage }) => {
    const { message, log } = fakeMessage({ content: "join discord.gg/abc", moderator: true });
    await handleMessage(message);
    assert.deepEqual(log, []);
  }));

test("blocked links are deleted; from a new account they also get quarantined", () =>
  withWorker(async ({ handleMessage }) => {
    const old = fakeMessage({ content: "join discord.gg/abc" });
    await handleMessage(old.message);
    assert.deepEqual(old.log, ["delete", "dm"]);

    // No QUARANTINE_ROLE_ID is set, so quarantine falls back to a timeout.
    const fresh = fakeMessage({ content: "FREE NITRO click", accountDays: 1 });
    await handleMessage(fresh.message);
    assert.deepEqual(fresh.log, ["delete", "timeout", "dm"]);
  }));

test("new accounts can't post links", () =>
  withWorker(async ({ handleMessage }) => {
    const { message, log } = fakeMessage({ content: "look https://example.com", accountDays: 2 });
    await handleMessage(message);
    assert.deepEqual(log, ["delete", "dm"]);
  }));

test("normal messages pass when no AI key is set", () =>
  withWorker(async ({ handleMessage }) => {
    const { message, log } = fakeMessage({ content: "good morning everyone, how was your weekend?" });
    await handleMessage(message);
    assert.deepEqual(log, []);
  }));

test("an AI flag gives a first-time warning", () =>
  withWorker(async ({ handleMessage }) => {
    const realFetch = global.fetch;
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: '{"flagged":true,"severity":"low","action":"warn","category":"insult","reason":"Rude"}' }],
        }),
        { status: 200 }
      );
    try {
      await withEnv({ ANTHROPIC_API_KEY: "test-key-not-real" }, async () => {
        const { message, log } = fakeMessage({ content: "you are all clowns honestly" });
        await handleMessage(message);
        assert.deepEqual(log, ["reply", "dm"]);
      });
    } finally {
      global.fetch = realFetch;
    }
  }));
