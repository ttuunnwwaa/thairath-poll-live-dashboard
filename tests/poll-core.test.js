import assert from "node:assert/strict";
import test from "node:test";
import { defaultPoll } from "../src/defaults.js";
import {
  clamp,
  formatPercent,
  hasMeaningfulChange,
  normalizeFontUrl,
  normalizePoll,
  pollStats,
  validatePoll,
} from "../src/poll-core.js";

test("calculates both percentages from one shared total", () => {
  const stats = pollStats({ votes_gold: 680, votes_property: 320 });
  assert.equal(stats.total, 1000);
  assert.equal(stats.goldPercent, 68);
  assert.equal(stats.propertyPercent, 32);
});

test("handles an empty poll without NaN", () => {
  assert.deepEqual(pollStats({ votes_gold: 0, votes_property: 0 }), {
    gold: 0,
    property: 0,
    total: 0,
    goldPercent: 0,
    propertyPercent: 0,
  });
});

test("normalizes negative and fractional votes", () => {
  const poll = normalizePoll({ votes_gold: -12, votes_property: "42.9" });
  assert.equal(poll.votes_gold, 0);
  assert.equal(poll.votes_property, 42);
});

test("preserves LED layout defaults when presentation is partial", () => {
  const poll = normalizePoll({ presentation: { displayMode: "dual" } });
  assert.equal(poll.presentation.displayMode, "dual");
  assert.equal(poll.presentation.screens.gold.backgroundX, 50);
  assert.equal(poll.presentation.screens.property.artworkY, 33);
  assert.equal(poll.presentation.font.question, 48);
  assert.equal(poll.presentation.colors.center, "#0b513b");
  assert.deepEqual(poll.presentation.screenAssignments, {
    left: "gold",
    center: "combined",
    right: "property",
  });
});

test("normalizes display background colors and rejects invalid values", () => {
  const poll = normalizePoll({
    presentation: { colors: { gold: "#ABCDEF", center: "red", property: "#123456" } },
  });
  assert.equal(poll.presentation.colors.gold, "#abcdef");
  assert.equal(poll.presentation.colors.center, "#0b513b");
  assert.equal(poll.presentation.colors.property, "#123456");
});

test("accepts safe custom content mapping for all three physical screens", () => {
  const poll = normalizePoll({
    presentation: {
      screenAssignments: { left: "gold", center: "question", right: "total" },
    },
  });
  assert.equal(poll.presentation.screenAssignments.left, "gold");
  assert.equal(poll.presentation.screenAssignments.center, "question");
  assert.equal(poll.presentation.screenAssignments.right, "total");
});

test("clamps visual controls to their safe ranges", () => {
  assert.equal(clamp(250, 50, 200), 200);
  assert.equal(clamp(-4, 0, 100), 0);
});

test("accepts a Google Fonts URL or creates one from a family name", () => {
  const url = "https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap";
  assert.equal(normalizeFontUrl(url), url);
  assert.match(normalizeFontUrl("IBM Plex Sans Thai"), /IBM\+Plex\+Sans\+Thai/);
});

test("validates required poll content and non-negative integer votes", () => {
  assert.equal(validatePoll(defaultPoll()), true);
  assert.throws(() => validatePoll({ ...defaultPoll(), question: "" }), /คำถาม/);
  assert.throws(() => validatePoll({ ...defaultPoll(), votes_gold: -1 }), /คะแนน/);
});

test("detects changes that must be saved", () => {
  const before = defaultPoll();
  const after = { ...before, votes_gold: before.votes_gold + 1 };
  assert.equal(hasMeaningfulChange(before, before), false);
  assert.equal(hasMeaningfulChange(before, after), true);
});

test("formats Thai percentages to one decimal place", () => {
  assert.match(formatPercent(68), /68[,.]0|๖๘[,.]๐/);
});
