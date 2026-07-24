import assert from "node:assert/strict";
import test from "node:test";
import {
  csvEscape,
  dedupeEntries,
  generateRange,
  normalizeAngle,
  parseEntries,
  secureRandomIndex,
  targetRotation,
  TAU,
} from "../src/core.js";

test("parses common delimiters and removes empty values", () => {
  assert.deepEqual(parseEntries("001, 002;\n003\t\n"), ["001", "002", "003"]);
});

test("generates padded labels with prefix and suffix", () => {
  assert.deepEqual(
    generateRange({ start: 8, end: 10, digits: 3, prefix: "A-", suffix: "-TH" }),
    ["A-008-TH", "A-009-TH", "A-010-TH"],
  );
});

test("deduplicates while retaining original order", () => {
  assert.deepEqual(dedupeEntries(["2", "1", "2", "3"]).accepted, ["2", "1", "3"]);
  assert.deepEqual(dedupeEntries(["2", "1", "2", "3"]).duplicates, ["2"]);
});

test("uses rejection sampling and returns a valid index", () => {
  let calls = 0;
  const fakeCrypto = {
    getRandomValues(array) {
      array[0] = calls++ === 0 ? 0xffffffff : 7;
      return array;
    },
  };
  assert.equal(secureRandomIndex(10, fakeCrypto), 7);
  assert.equal(calls, 2);
});

test("target rotation stops the chosen segment center at the pointer", () => {
  const target = targetRotation(1.2, 4, 10, 6);
  const arc = TAU / 10;
  assert.ok(target > 1.2 + 5 * TAU);
  assert.ok(Math.abs(normalizeAngle(target) - normalizeAngle(-(4.5) * arc)) < 1e-9);
});

test("CSV values are escaped for Excel-compatible output", () => {
  assert.equal(csvEscape('A,"B"'), '"A,""B"""');
});
