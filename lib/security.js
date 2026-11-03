// lib/security.js
// Timing-safe comparison for shared secrets (like WEBHOOK_SECRET).
//
// A plain `a === b` can leak how many characters matched through tiny timing
// differences. We hash both values first so they always have the same length,
// then compare them with crypto.timingSafeEqual.

const crypto = require("node:crypto");

function safeEqual(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || expected === "") {
    return false;
  }
  const a = crypto.createHash("sha256").update(provided, "utf8").digest();
  const b = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { safeEqual };
