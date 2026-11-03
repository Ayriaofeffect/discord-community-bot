// lib/antispam.js
// Fast checks that run before AI moderation. They cost nothing and need no API.

const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 30 * 1000; // repeats only count if sent within 30s of each other

// Tracks how fast each person is sending messages, and repeated messages.
function createSpamTracker({ maxMessages = 5, perSeconds = 5, maxDuplicates = 3 } = {}) {
  const windowMs = perSeconds * 1000;
  const users = new Map(); // userId -> { times: [], last: "", lastAt: 0, repeats: 0 }

  function prune(now) {
    for (const [id, user] of users) {
      if (now - user.lastAt > Math.max(windowMs, DUPLICATE_WINDOW_MS)) users.delete(id);
    }
  }

  return {
    // Returns { spam: false } or { spam: true, reason }.
    check(userId, content, now = Date.now()) {
      if (users.size > 5000) prune(now);
      let user = users.get(userId);
      if (!user) {
        user = { times: [], last: "", lastAt: 0, repeats: 0 };
        users.set(userId, user);
      }

      user.times = user.times.filter((t) => now - t < windowMs);
      user.times.push(now);

      const text = String(content ?? "").trim().toLowerCase();
      if (text && text === user.last && now - user.lastAt < DUPLICATE_WINDOW_MS) {
        user.repeats += 1;
      } else {
        user.repeats = 1;
        user.last = text;
      }
      user.lastAt = now;

      if (user.times.length > maxMessages) {
        users.delete(userId);
        return { spam: true, reason: `Sent more than ${maxMessages} messages in ${perSeconds} seconds` };
      }
      if (user.repeats >= maxDuplicates) {
        users.delete(userId);
        return { spam: true, reason: `Sent the same message ${maxDuplicates} times` };
      }
      return { spam: false };
    },
  };
}

// Counts moderation strikes per person. Strikes reset after a quiet period.
function createStrikeCounter({ resetAfterHours = 24 } = {}) {
  const resetMs = resetAfterHours * 60 * 60 * 1000;
  const strikes = new Map(); // userId -> { count, lastAt }
  return {
    add(userId, now = Date.now()) {
      const current = strikes.get(userId);
      const count = current && now - current.lastAt < resetMs ? current.count + 1 : 1;
      strikes.set(userId, { count, lastAt: now });
      return count;
    },
  };
}

// Returns the first blocked snippet found in the message, or null.
// Matching ignores upper/lower case and extra spaces.
function findSuspiciousLink(content, snippets) {
  const text = String(content ?? "").toLowerCase().replace(/\s+/g, " ");
  for (const snippet of snippets || []) {
    const needle = String(snippet).toLowerCase().replace(/\s+/g, " ").trim();
    if (needle && text.includes(needle)) return snippet;
  }
  return null;
}

function containsLink(content) {
  return /(https?:\/\/|www\.)\S+/i.test(String(content ?? ""));
}

function accountAgeDays(createdAt, now = Date.now()) {
  const created = createdAt instanceof Date ? createdAt.getTime() : Number(createdAt);
  if (!Number.isFinite(created)) return Infinity;
  return Math.floor((now - created) / DAY_MS);
}

function isNewAccount(createdAt, days, now = Date.now()) {
  return days > 0 && accountAgeDays(createdAt, now) < days;
}

module.exports = {
  createSpamTracker,
  createStrikeCounter,
  findSuspiciousLink,
  containsLink,
  accountAgeDays,
  isNewAccount,
};
