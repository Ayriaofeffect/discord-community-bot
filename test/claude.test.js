const test = require("node:test");
const assert = require("node:assert/strict");
const { askClaude, getModel } = require("../lib/claude");
const { buildAssistantContext, askAssistant } = require("../lib/assistant");
const { loadConfig } = require("../lib/config");
const { withEnv } = require("./helpers/fakes");

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("uses claude-haiku-5-5 unless ANTHROPIC_MODEL is set", async () => {
  await withEnv({ ANTHROPIC_MODEL: undefined }, () => assert.equal(getModel(), "claude-haiku-5-5"));
  await withEnv({ ANTHROPIC_MODEL: "claude-sonnet-5-5" }, () => assert.equal(getModel(), "claude-sonnet-5-5"));
});

test("throws a clear error without an API key", async () => {
  await withEnv({ ANTHROPIC_API_KEY: undefined }, async () => {
    await assert.rejects(askClaude({ system: "s", prompt: "p" }), /ANTHROPIC_API_KEY is not set/);
  });
});

test("returns only the text blocks of the answer", async () => {
  await withEnv({ ANTHROPIC_API_KEY: "test-key-not-real", ANTHROPIC_MODEL: "model-a" }, async () => {
    const fetchImpl = async () => json({ content: [{ type: "thinking", thinking: "" }, { type: "text", text: " Hello " }] });
    assert.equal(await askClaude({ system: "s", prompt: "p", fetchImpl }), "Hello");
  });
});

test("retries without thinking:disabled for models that require thinking", async () => {
  await withEnv({ ANTHROPIC_API_KEY: "test-key-not-real", ANTHROPIC_MODEL: "model-that-thinks" }, async () => {
    const bodies = [];
    const fetchImpl = async (_url, options) => {
      const body = JSON.parse(options.body);
      bodies.push(body);
      if (body.thinking) return json({ type: "error", error: { message: "thinking.type disabled is not supported" } }, 400);
      return json({ content: [{ type: "text", text: "ok" }] });
    };
    assert.equal(await askClaude({ system: "s", prompt: "p", fetchImpl }), "ok");
    assert.deepEqual(bodies.map((b) => Boolean(b.thinking)), [true, false]);

    // The model is remembered, so the next call skips the failing attempt.
    assert.equal(await askClaude({ system: "s", prompt: "p", fetchImpl }), "ok");
    assert.equal(bodies.length, 3);
  });
});

test("other API errors are reported, not retried", async () => {
  await withEnv({ ANTHROPIC_API_KEY: "test-key-not-real", ANTHROPIC_MODEL: "model-b" }, async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return json({ type: "error", error: { message: "max_tokens is too large" } }, 400);
    };
    await assert.rejects(askClaude({ system: "s", prompt: "p", fetchImpl }), /Claude API error 400/);
    assert.equal(calls, 1);
  });
});

test("the assistant gets the asker's stats and the top players", () => {
  const cfg = loadConfig({});
  const text = buildAssistantContext({
    player: { name: "Alex", level: 4, score: 900 },
    position: 2,
    topPlayers: [{ name: "Ana", level: 9, score: 5000 }],
    cfg,
  });
  assert.match(text, /player "Alex" \(level 4, 900 XP, #2 on the leaderboard\)/);
  assert.match(text, /1\. Ana \(level 9, 5000 XP\)/);
});

test("askAssistant never throws", async () => {
  const cfg = loadConfig({});
  const ask = async () => {
    throw new Error("timeout");
  };
  const original = console.error;
  console.error = () => {};
  try {
    const answer = await askAssistant({ question: "hi", discordId: "1", username: "sam", cfg, ask });
    assert.match(answer, /couldn't get an answer/);
  } finally {
    console.error = original;
  }
});
