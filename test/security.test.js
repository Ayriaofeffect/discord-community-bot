const test = require("node:test");
const assert = require("node:assert/strict");
const { safeEqual } = require("../lib/security");

test("safeEqual matches identical secrets", () => {
  assert.equal(safeEqual("a-long-shared-secret", "a-long-shared-secret"), true);
});

test("safeEqual rejects different secrets, including different lengths", () => {
  assert.equal(safeEqual("a-long-shared-secret", "a-long-shared-secreT"), false);
  assert.equal(safeEqual("short", "a-long-shared-secret"), false);
});

test("safeEqual fails closed on missing or odd values", () => {
  assert.equal(safeEqual(undefined, "secret"), false);
  assert.equal(safeEqual(["secret"], "secret"), false); // a header sent twice arrives as a list
  assert.equal(safeEqual("", ""), false); // an unset secret never matches
});
