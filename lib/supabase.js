// lib/supabase.js
// The database is OPTIONAL. If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is
// missing, getSupabase() returns null and the bot keeps working without it.
//
// The service role key skips Row Level Security, so it must only ever be used
// on the server (Vercel / Railway). Never put it in a website or mobile app.

const { createClient } = require("@supabase/supabase-js");
const { env } = require("./env");

const NO_DATABASE_MESSAGE =
  "No database connected yet, so this command can't work. " +
  "An admin can add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see the README).";

let client = null;

function isDatabaseConfigured() {
  return env("SUPABASE_URL") !== "" && env("SUPABASE_SERVICE_ROLE_KEY") !== "";
}

// Returns a Supabase client, or null when no database is configured.
function getSupabase() {
  if (!isDatabaseConfigured()) return null;
  if (!client) {
    client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

// Same as getSupabase(), but logs and returns null instead of throwing
// (for example when SUPABASE_URL is not a valid URL).
function safeGetSupabase() {
  try {
    return getSupabase();
  } catch (err) {
    console.error("[database] Could not create the Supabase client:", err.message);
    return null;
  }
}

// Turns a Supabase error into a readable Error for the logs.
function databaseError(action, error) {
  const detail = error && error.message ? error.message : String(error);
  return new Error(`Database error while trying to ${action}: ${detail}`);
}

module.exports = { getSupabase, safeGetSupabase, isDatabaseConfigured, databaseError, NO_DATABASE_MESSAGE };
