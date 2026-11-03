const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../lib/config");
const { detectLevelUp, dedupeKey, claimAnnouncement } = require("../lib/levelup");
const { createFakeDb, opArgs, IDS } = require("./helpers/fakes");

const cfg = loadConfig({});

function update(oldLevel, newLevel, extra = {}) {
  return {
    type: "UPDATE",
    table: "players",
    record: { id: "p1", username: "Alex", level: newLevel, discord_id: IDS.user, ...extra },
    old_record: { id: "p1", username: "Alex", level: oldLevel },
  };
}

test("detects a level going up", () => {
  assert.deepEqual(detectLevelUp(update(4, 5), cfg), {
    event: { playerId: "p1", name: "Alex", oldLevel: 4, newLevel: 5, discordId: IDS.user },
  });
});

test("ignores changes that are not level-ups", () => {
  assert.match(detectLevelUp(update(5, 5), cfg).skip, /did not go up/);
  assert.match(detectLevelUp(update(5, 4), cfg).skip, /did not go up/);
  assert.match(detectLevelUp({ ...update(1, 2), type: "INSERT" }, cfg).skip, /only UPDATE/);
  assert.match(detectLevelUp({ ...update(1, 2), table: "other_table" }, cfg).skip, /Ignoring table/);
  assert.match(detectLevelUp(null, cfg).skip, /not a database webhook/);
});

test("explains when the configured columns don't exist", () => {
  const wrong = loadConfig({ players: { levelColumn: "lvl" } });
  assert.match(detectLevelUp(update(1, 2), wrong).skip, /players\.levelColumn/);
  const noId = loadConfig({ players: { idColumn: "user_id" } });
  assert.match(detectLevelUp(update(1, 2), noId).skip, /players\.idColumn/);
});

test("uses your column names from bot.config.js", () => {
  const custom = loadConfig({
    players: { table: "profiles", idColumn: "uid", nameColumn: "nick", levelColumn: "lvl", discordIdColumn: "discord" },
  });
  const payload = {
    type: "UPDATE",
    table: "profiles",
    record: { uid: 7, nick: "Sam", lvl: 10, discord: null },
    old_record: { uid: 7, nick: "Sam", lvl: 9 },
  };
  assert.deepEqual(detectLevelUp(payload, custom).event, { playerId: "7", name: "Sam", oldLevel: 9, newLevel: 10, discordId: null });
});

test("dedupe: the first claim wins, a repeat is a duplicate", async () => {
  let calls = 0;
  const db = createFakeDb(() => (calls++ === 0 ? { error: null } : { error: { code: "23505", message: "duplicate key" } }));
  const key = dedupeKey({ playerId: "p1", newLevel: 5 });
  assert.equal(key, "levelup:p1:5");
  assert.equal(await claimAnnouncement(db, key, cfg), true);
  assert.equal(await claimAnnouncement(db, key, cfg), false);
  assert.equal(db.queries[0].table, "bot_announcements");
  assert.deepEqual(opArgs(db.queries[0], "insert"), [{ dedupe_key: "levelup:p1:5" }]);
});

test("dedupe: other database errors are not hidden", async () => {
  const db = createFakeDb(() => ({ error: { code: "42P01", message: 'relation "bot_announcements" does not exist' } }));
  await assert.rejects(claimAnnouncement(db, "k", cfg), /does not exist/);
});
