// lib/claude.js
// One small function for calling the Claude API (Messages API) with fetch.
// The API key is read from ANTHROPIC_API_KEY on the server and is never sent
// anywhere except api.anthropic.com.

const { env, hasEnv } = require("./env");

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-5-5";

function getModel() {
  return env("ANTHROPIC_MODEL") || DEFAULT_MODEL;
}

function isClaudeConfigured() {
  return hasEnv("ANTHROPIC_API_KEY");
}

// Short, simple tasks like moderation don't need "thinking", and thinking
// tokens count toward max_tokens. So we ask for thinking to be off. Some
// models don't allow that; if the API says no, we remember the model and
// retry without the setting.
const modelsThatMustThink = new Set();

// Sends one question and returns Claude's text answer.
// Throws an Error if the key is missing or the API returns an error.
async function askClaude({ system, prompt, maxTokens = 1024, timeoutMs = 25000, fetchImpl = globalThis.fetch }) {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");

  const model = getModel();
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  };
  if (!modelsThatMustThink.has(model)) body.thinking = { type: "disabled" };

  const send = () =>
    fetchImpl(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

  let res = await send();
  if (res.status === 400 && body.thinking) {
    const errorText = await res.text();
    if (!/thinking/i.test(errorText)) throw new Error(`Claude API error 400: ${errorText.slice(0, 300)}`);
    modelsThatMustThink.add(model);
    delete body.thinking;
    res = await send();
  }
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await res.json();
  // The answer can contain several blocks (for example "thinking" blocks).
  // We only want the text.
  return (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

module.exports = { askClaude, getModel, isClaudeConfigured, DEFAULT_MODEL };
