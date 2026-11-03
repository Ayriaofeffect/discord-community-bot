// These tests prove that every query uses the names from bot.config.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../lib/config");
const players = require("../lib/players");
const { createFakeDb, opArgs, opNames, IDS } = require("./helpers/fakes");

// A config with completely different names from the defaults.
const cfg = loadConfig({
  players: {
    table: "profiles",
    idColumn: "user_id",
    nameColumn: "display_name",
    levelColumn: "lvl",
    scoreColumn: "total_points",
    discordIdColumn: "discord_user_id",
    statsColumns: [{ column: "lvl", label: "Level" }, { column: "streak_days", label: "Streak" }],
  },
  linking: { method: "code", codeColumn: "link_code" },
});

test("mapPlayer reads your column names into one simple shape", () => {
  const row = { user_id: "u1", display_name: "Alex", lvl: "4", total_points: 1500, discord_user_id: IDS.user };
  assert.deepEqual(
    { ...players.mapPlayer(row, cfg), row: undefined },
    { id: "u1", name: "Alex", level: 4, score: 1500, discordId: IDS.user, row: undefined }
  );
});

test("playerColumns only selects the mapped columns (never *)", () => {
  assert.equal(players.playerColumns(cfg), "user_id,display_name,lvl,total_points,discord_user_id,streak_days");
});

test("getTopPlayers sorts by your score column, highest first", async () => {
  const db = createFakeDb(() => ({ data: [{ user_id: "u1", display_name: "Alex", total_points: 10 }], error: null }));
  const top = await players.getTopPlayers(db, 10, cfg);
  const [query] = db.queries;
  assert.equal(query.table, "profiles");
  assert.deepEqual(opArgs(query, "order"), ["total_points", { ascending: false, nullsFirst: false }]);
  assert.deepEqual(opArgs(query, "limit"), [10]);
  assert.equal(top[0].name, "Alex");
});

test("findPlayerByDiscordId filters on your Discord column", async () => {
  const db = createFakeDb(() => ({ data: [], error: null }));
  assert.equal(await players.findPlayerByDiscordId(db, IDS.user, cfg), null);
  assert.deepEqual(opArgs(db.queries[0], "eq"), ["discord_user_id", IDS.user]);
});

test("database errors become readable errors", async () => {
  const db = createFakeDb(() => ({ data: null, error: { message: 'column profiles.total_points does not exist' } }));
  await assert.rejects(players.getTopPlayers(db, 10, cfg), /load the leaderboard: column profiles\.total_points/);
});

test("getLeaderboardPosition counts players with a higher score", async () => {
  const db = createFakeDb(() => ({ count: 2, error: null }));
  assert.equal(await players.getLeaderboardPosition(db, { score: 500 }, cfg), 3);
  assert.deepEqual(opArgs(db.queries[0], "gt"), ["total_points", 500]);
});

// For linking, the fake database answers each query in order.
function linkDb(answers) {
  let i = 0;
  return createFakeDb(() => answers[i++] || { data: [], error: null });
}

test("/link with a code: links, and clears the one-time code", async () => {
  const row = { user_id: "u1", display_name: "Alex", lvl: 3, total_points: 50 };
  const db = linkDb([
    { data: [], error: null }, // not linked yet
    { data: [row], error: null }, // one player has this code
    { data: [{ ...row, discord_user_id: IDS.user }], error: null }, // the update
  ]);
  const result = await players.linkDiscordAccount(db, { input: " abc123 ", discordId: IDS.user }, cfg);
  assert.equal(result.status, "linked");
  assert.equal(result.player.name, "Alex");

  const [, find, update] = db.queries;
  assert.deepEqual(opArgs(find, "eq"), ["link_code", "ABC123"]); // trimmed + uppercased
  assert.deepEqual(opArgs(update, "update"), [{ discord_user_id: IDS.user, link_code: null }]);
  assert.deepEqual(
    update.ops.filter((op) => op[0] === "eq").map((op) => op.slice(1)),
    [["user_id", "u1"], ["link_code", "ABC123"]]
  );
});

test("/link says so when you're already linked", async () => {
  const db = linkDb([{ data: [{ user_id: "u1", display_name: "Alex" }], error: null }]);
  const result = await players.linkDiscordAccount(db, { input: "ABC123", discordId: IDS.user }, cfg);
  assert.equal(result.status, "already_linked");
  assert.equal(db.queries.length, 1); // nothing was updated
});

test("/link reports unknown and ambiguous matches", async () => {
  const notFound = await players.linkDiscordAccount(linkDb([{ data: [] }, { data: [] }]), { input: "NOPE", discordId: IDS.user }, cfg);
  assert.equal(notFound.status, "not_found");

  const twoRows = linkDb([{ data: [] }, { data: [{ user_id: "a" }, { user_id: "b" }] }]);
  assert.equal((await players.linkDiscordAccount(twoRows, { input: "DUP", discordId: IDS.user }, cfg)).status, "ambiguous");

  assert.equal((await players.linkDiscordAccount(linkDb([]), { input: "   ", discordId: IDS.user }, cfg)).status, "invalid");
});

test("/link by name only claims players that aren't linked yet", async () => {
  const byName = loadConfig({ ...cfg, linking: { method: "name" } });
  const db = linkDb([{ data: [] }, { data: [{ user_id: "u9", display_name: "Sam" }] }, { data: [{ user_id: "u9", display_name: "Sam" }] }]);
  const result = await players.linkDiscordAccount(db, { input: "Sam", discordId: IDS.user }, byName);
  assert.equal(result.status, "linked");
  const [, find, update] = db.queries;
  assert.deepEqual(opArgs(find, "eq"), ["display_name", "Sam"]);
  assert.deepEqual(opArgs(find, "is"), ["discord_user_id", null]);
  assert.deepEqual(opArgs(update, "update"), [{ discord_user_id: IDS.user }]); // no code column in name mode
  assert.deepEqual(opArgs(update, "is"), ["discord_user_id", null]);
  assert.ok(opNames(update).includes("select"));
});
