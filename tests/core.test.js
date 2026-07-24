import assert from "node:assert/strict";
import test from "node:test";
import {
  csvEscape,
  detectDelimiter,
  dedupeEntries,
  generateRange,
  isSafeSvg,
  normalizeAngle,
  parseDelimitedText,
  parseEntries,
  secureRandomIndex,
  spinEaseOut,
  targetRotation,
  TAU,
  validateProjectPayload,
  winnerIndexAtPointer,
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

test("spin easing starts fast and slows smoothly before stopping", () => {
  assert.equal(spinEaseOut(0), 0);
  assert.equal(spinEaseOut(1), 1);
  assert.ok(spinEaseOut(0.1) > 0.25);
  assert.ok(spinEaseOut(0.9) >= 0.999);
  assert.ok(spinEaseOut(0.2) - spinEaseOut(0.1) > spinEaseOut(0.9) - spinEaseOut(0.8));
});

test("pointer alignment is exact for every supported pool size", () => {
  for (const count of [2, 10, 100, 500, 1000]) {
    for (const winnerIndex of [0, Math.floor(count / 2), count - 1]) {
      const target = targetRotation(1.2345, winnerIndex, count, 6);
      assert.equal(winnerIndexAtPointer(target, count), winnerIndex);
    }
  }
});

test("CSV values are escaped for Excel-compatible output", () => {
  assert.equal(csvEscape('A,"B"'), '"A,""B"""');
});

test("parses UTF-8 Thai CSV, leading zeroes, quoted commas, and escaped quotes", () => {
  const csv = '\uFEFFหมายเลข,ชื่อ\n"001","สมชาย, กรุงเทพ"\n"002","คำว่า ""โชคดี"""';
  assert.equal(detectDelimiter(csv), ",");
  assert.deepEqual(parseDelimitedText(csv), [
    ["หมายเลข", "ชื่อ"],
    ["001", "สมชาย, กรุงเทพ"],
    ["002", 'คำว่า "โชคดี"'],
  ]);
});

test("detects semicolon and tab delimiters", () => {
  assert.equal(detectDelimiter("เลข;ชื่อ\n001;ไทย"), ";");
  assert.equal(detectDelimiter("เลข\tชื่อ\n001\tไทย"), "\t");
});

test("rejects active content in SVG uploads", () => {
  assert.equal(isSafeSvg("<svg><circle cx=\"1\" cy=\"1\" r=\"1\"/></svg>"), true);
  assert.equal(isSafeSvg("<svg onload=\"alert(1)\"></svg>"), false);
  assert.equal(isSafeSvg("<svg><script>alert(1)</script></svg>"), false);
  assert.equal(isSafeSvg("<svg><foreignObject>html</foreignObject></svg>"), false);
});

test("project export/import round-trip preserves images, history, and leading zeroes", () => {
  const project = {
    format: "lucky-draw-wheel",
    numbers: [{ id: "num-1", label: "001", removed: true }],
    history: [{ id: "draw-1", number: "001", removed: true }],
    settings: { removeConfirmed: true },
    assets: {
      background: "data:image/png;base64,AAAA",
      logo: "data:image/png;base64,BBBB",
      pointer: "data:image/png;base64,CCCC",
      segmentMappings: { "001": "data:image/png;base64,DDDD" },
    },
  };
  const restored = validateProjectPayload(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored, project);
  assert.equal(restored.numbers[0].label, "001");
  assert.equal(restored.history[0].number, "001");
  assert.equal(restored.assets.segmentMappings["001"], "data:image/png;base64,DDDD");
});

test("rejects malformed and oversized project imports", () => {
  assert.throws(() => validateProjectPayload({ format: "other", numbers: [] }), /รูปแบบไฟล์/);
  assert.throws(
    () => validateProjectPayload({ format: "lucky-draw-wheel", numbers: Array(1001).fill({}) }),
    /1,000/,
  );
});
