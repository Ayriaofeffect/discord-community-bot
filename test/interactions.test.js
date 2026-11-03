// Tests for api/interactions.js and the command router.
// Most tests stub the signature check. One group uses a real Ed25519 key pair
// to prove the real check accepts Discord-style signatures and rejects others.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createHandler } = require("../api/interactions");
const { routeCommand } = require("../commands");
const { createFakeDb, fakeReq, fakeRes, slashCommand, withEnv, IDS } = require("./helpers/fakes");

const EPHEMERAL = 64;
const cleanEnv = {
  DISCORD_PUBLIC_KEY: "0".repeat(64),
  SUPABASE_URL: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined,
  ANTHROPIC_API_KEY: undefined,
  ANTHROPIC_MODEL: undefined,
  MOD_SKIP_CHANNEL_IDS: undefined,
  MOD_SKIP_USER_IDS: undefined,
};

// Sends one interaction through the real handler, with the signature check stubbed.
async function send(interaction, { route, verify = async () => true } = {}) {
  const tasks = [];
  const handler = createHandler({
    verify,
    ...(route ? { route } : {}),
    runLater: (task) => tasks.push(Promise.resolve().then(task)),
  });
  const res = fakeRes();
  await handler(fakeReq({ body: JSON.stringify(interaction) }), res);
  return { res, body: res.body ? res.json() : null, tasks };
}

test("rejects anything that isn't a POST", async () => {
  await withEnv(cleanEnv, async () => {
    const handler = createHandler({ verify: async () => true });
    const res = fakeRes();
    await handler(fakeReq({ method: "GET" }), res);
    assert.equal(res.statusCode, 405);
  });
});

test("says clearly when DISCORD_PUBLIC_KEY is missing", async () => {
  await withEnv({ ...cleanEnv, DISCORD_PUBLIC_KEY: undefined }, async () => {
    const { res, body } = await send({ type: 1 });
    assert.equal(res.statusCode, 500);
    assert.match(body.error, /DISCORD_PUBLIC_KEY/);
  });
});

test("rejects requests with a bad signature", async () => {
  await withEnv(cleanEnv, async () => {
    const { res } = await send({ type: 1 }, { verify: async () => false });
    assert.equal(res.statusCode, 401);
  });
});

test("answers Discord's PING with PONG", async () => {
  await withEnv(cleanEnv, async () => {
    const { res, body } = await send({ type: 1 });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(body, { type: 1 });
  });
});

test("/help lists the commands", async () => {
  await withEnv(cleanEnv, async () => {
    const { body } = await send(slashCommand("help"));
    assert.equal(body.type, 4);
    const text = body.data.embeds[0].description;
    for (const name of ["stats", "leaderboard", "link", "ask", "mod", "help"]) assert.match(text, new RegExp(`/${name}`));
    assert.match(body.data.embeds[0].footer.text, /not connected/);
  });
});

test("data commands say 'no database connected yet' without Supabase", async () => {
  await withEnv(cleanEnv, async () => {
    for (const interaction of [
      slashCommand("stats"),
      slashCommand("leaderboard"),
      slashCommand("link", { options: [{ name: "code", type: 3, value: "ABC123" }] }),
    ]) {
      const { res, body } = await send(interaction);
      assert.equal(res.statusCode, 200);
      assert.match(body.data.content, /No database connected yet/);
      assert.equal(body.data.flags, EPHEMERAL);
    }
  });
});

test("/leaderboard reads from the database when one is connected", async () => {
  await withEnv(cleanEnv, async () => {
    const db = createFakeDb(() => ({
      data: [
        { id: "a", username: "Ana", level: 9, xp: 5000 },
        { id: "b", username: "Ben", level: 7, xp: 3000 },
      ],
      error: null,
    }));
    const { body } = await send(slashCommand("leaderboard"), { route: (i) => routeCommand(i, { db }) });
    assert.equal(body.data.embeds[0].description, "🥇 **Ana** — 5,000 XP\n🥈 **Ben** — 3,000 XP");
    assert.deepEqual(body.data.allowed_mentions, { parse: [] });
    assert.equal(db.queries[0].table, "players");
  });
});

test("/stats asks unlinked people to link first", async () => {
  await withEnv(cleanEnv, async () => {
    const db = createFakeDb(() => ({ data: [], error: null }));
    const { body } = await send(slashCommand("stats"), { route: (i) => routeCommand(i, { db }) });
    assert.match(body.data.content, /\/link code:/);
  });
});

test("a database error gives a friendly reply, not a crash", async () => {
  await withEnv(cleanEnv, async () => {
    const db = createFakeDb(() => ({ data: null, error: { message: "column players.xp does not exist" } }));
    const original = console.error;
    console.error = () => {}; // keep test output tidy
    try {
      const { res, body } = await send(slashCommand("leaderboard"), { route: (i) => routeCommand(i, { db }) });
      assert.equal(res.statusCode, 200);
      assert.match(body.data.content, /Something went wrong/);
    } finally {
      console.error = original;
    }
  });
});

test("/mod is for admins only", async () => {
  await withEnv(cleanEnv, async () => {
    const { body } = await send(slashCommand("mod", { options: [{ name: "show", type: 1 }] }));
    assert.match(body.data.content, /Only server admins/);
  });
});

test("/mod show works without a database, and changes explain how to edit the config", async () => {
  await withEnv(cleanEnv, async () => {
    const show = await send(slashCommand("mod", { admin: true, options: [{ name: "show", type: 1 }] }));
    const fields = show.body.data.embeds[0].fields;
    assert.match(fields[0].value, /bot\.config\.js/);
    assert.match(fields[1].name, /Rules \(4\)/);

    const add = await send(
      slashCommand("mod", {
        admin: true,
        options: [{ name: "add-rule", type: 1, options: [{ name: "rule", type: 3, value: "No spoilers" }] }],
      })
    );
    assert.match(add.body.data.content, /can't save changes/);
  });
});

test("/mod add-rule saves to bot_config when a database is connected", async () => {
  await withEnv(cleanEnv, async () => {
    const db = createFakeDb(() => ({ data: [], error: null }));
    const interaction = slashCommand("mod", {
      admin: true,
      options: [{ name: "add-rule", type: 1, options: [{ name: "rule", type: 3, value: "No spoilers" }] }],
    });
    const { body } = await send(interaction, { route: (i) => routeCommand(i, { db }) });
    assert.match(body.data.content, /Added rule #5: No spoilers/);
    const upsert = db.queries[1].ops.find((op) => op[0] === "upsert")[1];
    assert.equal(upsert.key, "moderation_rules");
    assert.equal(upsert.value.at(-1), "No spoilers");
    assert.equal(upsert.updated_by, IDS.user);
  });
});

test("/ask is for admins, and explains when the AI isn't set up", async () => {
  await withEnv(cleanEnv, async () => {
    const question = [{ name: "question", type: 3, value: "How do I level up?" }];
    const notAdmin = await send(slashCommand("ask", { options: question }));
    assert.match(notAdmin.body.data.content, /Only server admins/);

    const noKey = await send(slashCommand("ask", { admin: true, options: question }));
    assert.match(noKey.body.data.content, /ANTHROPIC_API_KEY/);
  });
});

test("/ask defers, then edits the reply with Claude's answer", async () => {
  await withEnv({ ...cleanEnv, ANTHROPIC_API_KEY: "test-key-not-real" }, async () => {
    const calls = [];
    const realFetch = global.fetch;
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).startsWith("https://api.anthropic.com/")) {
        return new Response(
          JSON.stringify({ content: [{ type: "thinking", thinking: "" }, { type: "text", text: "Finish quests to level up." }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("{}", { status: 200 });
    };
    try {
      const interaction = slashCommand("ask", { admin: true, options: [{ name: "question", type: 3, value: "How do I level up?" }] });
      const { body, tasks } = await send(interaction);
      assert.deepEqual(body, { type: 5 }); // "thinking..."
      assert.equal(tasks.length, 1);
      await Promise.all(tasks);

      const claude = JSON.parse(calls[0].options.body);
      assert.equal(claude.model, "claude-haiku-5-5");
      assert.deepEqual(claude.thinking, { type: "disabled" });
      assert.equal(calls[0].options.headers["x-api-key"], "test-key-not-real");

      const edit = calls[1];
      assert.equal(edit.url, `https://discord.com/api/v10/webhooks/${IDS.app}/interaction-token-for-tests/messages/@original`);
      assert.equal(edit.options.method, "PATCH");
      assert.equal(edit.options.headers.Authorization, undefined); // no bot token needed
      const sent = JSON.parse(edit.options.body);
      assert.match(sent.content, /Tester asked:\*\* How do I level up\?/);
      assert.match(sent.content, /Finish quests to level up\./);
    } finally {
      global.fetch = realFetch;
    }
  });
});

test("unknown commands get a friendly reply", async () => {
  await withEnv(cleanEnv, async () => {
    const { body } = await send(slashCommand("dance"));
    assert.match(body.data.content, /don't know that command/);
  });
});

// ── Real signature verification ─────────────────────────────

test("the real signature check accepts Discord-style signatures and rejects others", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const rawPublicKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
  const handler = createHandler({ runLater: () => {} });
  const body = JSON.stringify({ type: 1 });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.sign(null, Buffer.from(timestamp + body), privateKey).toString("hex");

  await withEnv({ ...cleanEnv, DISCORD_PUBLIC_KEY: rawPublicKey }, async () => {
    const good = fakeRes();
    await handler(fakeReq({ headers: { "x-signature-ed25519": signature, "x-signature-timestamp": timestamp }, body }), good);
    assert.equal(good.statusCode, 200);
    assert.deepEqual(good.json(), { type: 1 });

    const tampered = fakeRes();
    await handler(
      fakeReq({ headers: { "x-signature-ed25519": signature, "x-signature-timestamp": timestamp }, body: JSON.stringify({ type: 2 }) }),
      tampered
    );
    assert.equal(tampered.statusCode, 401);

    const missing = fakeRes();
    await handler(fakeReq({ body }), missing);
    assert.equal(missing.statusCode, 401);
  });
});
