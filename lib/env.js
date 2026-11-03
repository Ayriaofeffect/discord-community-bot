// lib/env.js
// Small helpers for reading environment variables.
// An empty value (for example `KEY=` in .env) counts as "not set".
// These helpers never print values, so they are safe to use in logs.

function env(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function hasEnv(name) {
  return env(name) !== "";
}

// "123, 456,789" -> ["123", "456", "789"]
function envList(name) {
  return env(name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = { env, hasEnv, envList };
