const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../lib/config");
const { mapPlayer } = require("../lib/players");
const {
  renderTemplate,
  formatLeaderboard,
  formatStats,
  buildLevelUpMessage,
  escapeMarkdown,
  formatNumber,
} = require("../lib/format");
const { IDS } = require("./helpers/fakes");

const cfg = loadConfig({ appName: "Quest Log", leaderboard: { scoreLabel: "points" } });

test("renderTemplate fills in known placeholders", () => {
  assert.equal(renderTemplate("{name} reached level {level}!", { name: "Alex", level: 5 }), "Alex reached level 5!");
});

test("renderTemplate leaves unknown placeholders alone", () => {
  assert.equal(renderTemplate("Hi {name}, {unknown}", { name: "Alex" }), "Hi Alex, {unknown}");
});

test("renderTemplate never expands placeholders inside values", () => {
  assert.equal(renderTemplate("{name}", { name: "{level}", level: 9 }), "{level}");
});

test("formatNumber adds thousands separators and handles junk", () => {
  assert.equal(formatNumber(1234567), "1,234,567");
  assert.equal(formatNumber("42"), "42");
  assert.equal(formatNumber("not a number"), "0");
});

test("escapeMarkdown stops names from changing formatting", () => {
  assert.equal(escapeMarkdown("*bold* [link](x)"), "\\*bold\\* \\[link\\](x)");
});

test("formatLeaderboard shows medals, then numbers", () => {
  const players = ["Ana", "Ben", "Cy", "Dee"].map((name, i) => ({ name, score: 4000 - i * 1000 }));
  const embed = formatLeaderboard(players, cfg);
  const lines = embed.description.split("\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[0], "🥇 **Ana** — 4,000 points");
  assert.equal(lines[1], "🥈 **Ben** — 3,000 points");
  assert.equal(lines[2], "🥉 **Cy** — 2,000 points");
  assert.equal(lines[3], "**4.** **Dee** — 1,000 points");
  assert.match(embed.title, /Quest Log/);
  assert.equal(embed.footer.text, "Top 4 by points");
});

test("formatLeaderboard escapes tricky names and handles an empty list", () => {
  const embed = formatLeaderboard([{ name: "**hacker**\nnew line", score: 1 }], cfg);
  assert.equal(embed.description, "🥇 **\\*\\*hacker\\*\\* new line** — 1 points");
  assert.match(formatLeaderboard([], cfg).description, /Nobody/);
});

test("formatStats shows the columns listed in statsColumns", () => {
  const custom = loadConfig({
    players: { statsColumns: [{ column: "level", label: "Level" }, { column: "gold", label: "Gold" }] },
  });
  const player = mapPlayer({ id: 1, username: "Alex", level: 7, xp: 900, gold: 12000 }, custom);
  const embed = formatStats(player, 3, custom);
  assert.deepEqual(
    embed.fields.map((f) => [f.name, f.value]),
    [
      ["Level", "7"],
      ["Gold", "12,000"],
      ["Leaderboard", "#3"],
    ]
  );
});

test("buildLevelUpMessage pings only the linked player", () => {
  const msg = buildLevelUpMessage({ name: "Alex", oldLevel: 4, newLevel: 5, discordId: IDS.user }, cfg);
  assert.equal(msg.content, `🎉 <@${IDS.user}> just reached **level 5**!`);
  assert.deepEqual(msg.allowed_mentions, { parse: [], users: [IDS.user] });
});

test("buildLevelUpMessage uses the bold name when the player isn't linked", () => {
  const custom = loadConfig({ levelUp: { message: "{mention} went from {oldLevel} to {level} in {app}" } });
  const msg = buildLevelUpMessage({ name: "@everyone", oldLevel: 1, newLevel: 2, discordId: null }, custom);
  assert.equal(msg.content, "**@everyone** went from 1 to 2 in My App");
  assert.deepEqual(msg.allowed_mentions, { parse: [], users: [] }); // "@everyone" can't ping
});
