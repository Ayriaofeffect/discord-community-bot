// lib/http.js
// Tiny helpers for Vercel serverless functions (plain Node request/response).

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB is far more than Discord or Supabase send

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// Reads the exact bytes Discord sent. Signature checks need the raw text,
// so we read the stream ourselves instead of using a parsed req.body.
async function readRawBody(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString("utf8");

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Reads a JSON body. Vercel may already have parsed it into req.body.
async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8"));
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body;
  }
  const text = await readRawBody(req);
  return text ? JSON.parse(text) : null;
}

// Runs work AFTER the response has been sent (for example, a slow Claude call).
// On Vercel, waitUntil keeps the function alive until the work finishes.
// Anywhere else it is a no-op and the promise simply runs.
let vercelWaitUntil = null;
try {
  ({ waitUntil: vercelWaitUntil } = require("@vercel/functions"));
} catch {
  vercelWaitUntil = null;
}

function runInBackground(task) {
  const promise = Promise.resolve()
    .then(task)
    .catch((err) => console.error("[background] Task failed:", err));
  if (vercelWaitUntil) vercelWaitUntil(promise);
  return promise;
}

module.exports = { sendJson, readRawBody, readJsonBody, runInBackground };
