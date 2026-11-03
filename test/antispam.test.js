const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSpamTracker,
  createStrikeCounter,
  findSuspiciousLink,
  containsLink,
  accountAgeDays,
  isNewAccount,
} = require("../lib/antispam");

test("flags too many messages in a short time", () => {
  const spam = createSpamTracker({ maxMessages: 3, perSeconds: 5, maxDuplicates: 99 });
  const t = 1_000_000;
  assert.equal(spam.check("u", "one", t).spam, false);
  assert.equal(spam.check("u", "two", t + 100).spam, false);
  assert.equal(spam.check("u", "three", t + 200).spam, false);
  assert.equal(spam.check("u", "four", t + 300).spam, true);
});

test("messages spread out over time are fine", () => {
  const spam = createSpamTracker({ maxMessages: 3, perSeconds: 5, maxDuplicates: 99 });
  for (let i = 0; i < 10; i++) assert.equal(spam.check("u", `msg ${i}`, i * 6000).spam, false);
});

test("flags the same message repeated, but not across long gaps", () => {
  const spam = createSpamTracker({ maxMessages: 99, perSeconds: 5, maxDuplicates: 3 });
  assert.equal(spam.check("u", "BUY NOW", 0).spam, false);
  assert.equal(spam.check("u", "buy now", 1000).spam, false);
  assert.match(spam.check("u", "buy now ", 2000).reason, /same message 3 times/);

  const slow = createSpamTracker({ maxMessages: 99, perSeconds: 5, maxDuplicates: 3 });
  for (let i = 0; i < 5; i++) assert.equal(slow.check("u", "gm", i * 60_000).spam, false);
});

test("strikes add up and reset after a quiet day", () => {
  const strikes = createStrikeCounter({ resetAfterHours: 24 });
  assert.equal(strikes.add("u", 0), 1);
  assert.equal(strikes.add("u", 1000), 2);
  assert.equal(strikes.add("u", 25 * 60 * 60 * 1000), 1);
});

test("finds blocked links and phrases, ignoring case and spacing", () => {
  const list = ["discord.gg/", "free nitro"];
  assert.equal(findSuspiciousLink("join discord.GG/abc", list), "discord.gg/");
  assert.equal(findSuspiciousLink("FREE   NITRO here", list), "free nitro");
  assert.equal(findSuspiciousLink("hello friends", list), null);
});

test("spots links and new accounts", () => {
  assert.equal(containsLink("see https://example.com"), true);
  assert.equal(containsLink("see www.example.com"), true);
  assert.equal(containsLink("no links here"), false);

  const now = Date.UTC(2026, 0, 10);
  const threeDaysOld = new Date(Date.UTC(2026, 0, 7));
  assert.equal(accountAgeDays(threeDaysOld, now), 3);
  assert.equal(isNewAccount(threeDaysOld, 7, now), true);
  assert.equal(isNewAccount(threeDaysOld, 2, now), false);
  assert.equal(isNewAccount(threeDaysOld, 0, now), false); // 0 turns the check off
});
