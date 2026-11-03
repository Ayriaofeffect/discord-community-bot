// scripts/check-secrets.js
// Run with: npm run check
//
// Fails (exit code 1) if your repo is about to leak something:
//   - a .env file (other than .env.example) is tracked by git or not ignored
//   - node_modules or .vercel files are tracked by git
//   - any file contains something that looks like a real secret:
//     Discord bot token, Anthropic API key, Supabase secret / service-role key,
//     any JWT, or a Discord webhook URL with real-looking IDs
//
// Placeholders such as "your-bot-token" or "xxxxxxxx" are allowed.
// Findings are printed shortened, so this script never shows a full secret.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const SECRET_PATTERNS = [
  { kind: "Discord bot token", regex: /\b[MNO][A-Za-z0-9_-]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,40}\b/g },
  { kind: "Anthropic API key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: "Supabase secret key", regex: /\bsb_secret_[A-Za-z0-9_-]{16,}/g },
  { kind: "JWT", regex: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}/g },
  {
    kind: "Discord webhook URL",
    regex: /https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d{17,20}\/[A-Za-z0-9_-]{20,}/g,
  },
];

// Words that mean "this is an example, not a real value".
const PLACEHOLDER_MARKERS = ["your", "example", "placeholder", "xxxx", "replace", "dummy", "redacted"];

function isPlaceholder(value) {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

// Supabase keys from before 2025 are JWTs. Name the dangerous one clearly.
function describeJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (payload && payload.role === "service_role") return "Supabase service-role key (JWT)";
    if (payload && payload.role === "anon") return "Supabase anon key (JWT)";
  } catch {
    // not decodable, still report it
  }
  return "JWT (could be a secret)";
}

function redact(value) {
  return `${value.slice(0, 8)}… (${value.length} chars)`;
}

// Scans one file's text. Returns [{ line, kind, preview }].
function scanText(text) {
  const findings = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((lineText, index) => {
    for (const { kind, regex } of SECRET_PATTERNS) {
      regex.lastIndex = 0;
      for (const match of lineText.matchAll(regex)) {
        const value = match[0];
        if (isPlaceholder(value)) continue;
        findings.push({ line: index + 1, kind: kind === "JWT" ? describeJwt(value) : kind, preview: redact(value) });
      }
    }
  });
  return findings;
}

// Checks file paths (relative, with "/" separators). Returns a list of problems.
function checkPaths(paths) {
  const problems = [];
  let nodeModules = 0;
  for (const file of paths) {
    const parts = file.split("/");
    const base = parts[parts.length - 1];
    if (/^\.env(\..+)?$/i.test(base) && base !== ".env.example") {
      problems.push(`${file}: .env files must never be committed. Run: git rm --cached "${file}"`);
    }
    if (parts.includes("node_modules")) nodeModules += 1;
    if (parts[0] === ".vercel") problems.push(`${file}: the .vercel folder should not be committed.`);
  }
  if (nodeModules) problems.push(`${nodeModules} file(s) inside node_modules are tracked. Run: git rm -r --cached node_modules`);
  return problems;
}

// Files git tracks, plus new files that are not ignored (so a secret is caught
// before you `git add` it). Falls back to walking the folder if git is missing.
function listRepoFiles(root) {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { files: [...new Set(out.split("\0").filter(Boolean))], usedGit: true };
  } catch {
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        const rel = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(rel);
        else if (entry.isFile()) files.push(rel);
      }
    };
    walk("");
    return { files, usedGit: false };
  }
}

function runCheck(root = path.resolve(__dirname, "..")) {
  const { files, usedGit } = listRepoFiles(root);
  const problems = checkPaths(files);
  let scanned = 0;

  for (const file of files) {
    if (file.split("/").includes("node_modules")) continue;
    let buffer;
    try {
      const full = path.join(root, file);
      if (fs.statSync(full).size > MAX_FILE_BYTES) continue;
      buffer = fs.readFileSync(full);
    } catch {
      continue; // deleted or unreadable
    }
    if (buffer.includes(0)) continue; // binary file
    scanned += 1;
    for (const finding of scanText(buffer.toString("utf8"))) {
      problems.push(`${file}:${finding.line}: looks like a ${finding.kind}: ${finding.preview}`);
    }
  }
  return { problems, scanned, usedGit };
}

if (require.main === module) {
  const { problems, scanned, usedGit } = runCheck();
  if (!usedGit) console.warn("(git not available here, so every file in the folder was scanned)");
  if (problems.length) {
    console.error("Secret check FAILED:\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("\nRemove these before you commit. If a real secret was ever committed or pushed,");
    console.error("reset it (see 'Never commit your .env' in the README). Deleting the file is not enough.");
    process.exitCode = 1;
  } else {
    console.log(`Secret check passed: ${scanned} file(s) scanned, no secrets found.`);
  }
}

module.exports = { scanText, checkPaths, isPlaceholder, listRepoFiles, runCheck, SECRET_PATTERNS };
