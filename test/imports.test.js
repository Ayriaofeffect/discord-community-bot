// Every module must load with NO environment variables set.
// We start a fresh Node process with an empty environment to be sure.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function jsFiles(dir) {
  return fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return jsFiles(rel);
      return entry.name.endsWith(".js") ? [rel] : [];
    });
}

test("every module loads with no env vars and does nothing on import", () => {
  const files = ["bot.config.js", ...["api", "bot", "commands", "lib", "scripts"].flatMap(jsFiles)];
  assert.ok(files.length >= 25);
  const code = `${files.map((file) => `require(${JSON.stringify(path.join(root, file))});`).join("\n")}\nconsole.log("loaded");`;
  const result = spawnSync(process.execPath, ["-e", code], { cwd: root, env: {}, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "loaded"); // no script ran its main() on import
  assert.equal(result.stderr.trim(), "");
});
