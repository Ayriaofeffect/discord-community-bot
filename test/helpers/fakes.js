// test/helpers/fakes.js
// Test doubles: a fake Supabase client, fake HTTP request/response, and a
// slash-command payload builder. No network, no real accounts.

const { Readable } = require("node:stream");

// A fake Supabase client. Every chained call (select, eq, order, ...) is
// recorded on the query. When the query is awaited, respond(query) decides
// what comes back: { data, error, count }.
function createFakeDb(respond = () => ({ data: [], error: null })) {
  const queries = [];
  return {
    queries,
    from(table) {
      const query = { table, ops: [] };
      queries.push(query);
      const builder = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              return (resolve, reject) =>
                Promise.resolve()
                  .then(() => respond(query))
                  .then(resolve, reject);
            }
            return (...args) => {
              query.ops.push([prop, ...args]);
              return builder;
            };
          },
        }
      );
      return builder;
    },
  };
}

// Returns the arguments of the first call named `name` on a query, or undefined.
function opArgs(query, name) {
  const found = query.ops.find((op) => op[0] === name);
  return found ? found.slice(1) : undefined;
}

function opNames(query) {
  return query.ops.map((op) => op[0]);
}

function fakeReq({ method = "POST", headers = {}, body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  req.method = method;
  req.headers = headers;
  return req;
}

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(text) {
      this.body = text || "";
      this.ended = true;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

// Obviously fake Discord IDs used across the tests.
const IDS = {
  user: "111111111111111111",
  otherUser: "222222222222222222",
  channel: "333333333333333333",
  app: "444444444444444444",
  guild: "555555555555555555",
  role5: "666666666666666666",
  role10: "777777777777777777",
};

function slashCommand(name, { options, admin = false, userId = IDS.user } = {}) {
  return {
    type: 2,
    id: "1",
    application_id: IDS.app,
    token: "interaction-token-for-tests",
    guild_id: IDS.guild,
    data: { name, type: 1, ...(options ? { options } : {}) },
    member: {
      permissions: admin ? "8" : "0",
      user: { id: userId, username: "tester", global_name: "Tester" },
    },
  };
}

// Temporarily sets environment variables, then restores them.
async function withEnv(vars, fn) {
  const before = {};
  for (const [key, value] of Object.entries(vars)) {
    before[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

module.exports = { createFakeDb, opArgs, opNames, fakeReq, fakeRes, slashCommand, withEnv, IDS };
