import assert from "node:assert/strict";
import test from "node:test";
import { POLL_IDS, defaultPoll } from "../src/defaults.js";
import { contentForScreen } from "../src/display-view.js";
import {
  clamp,
  formatPercent,
  hasMeaningfulChange,
  normalizeFontUrl,
  normalizeBroadcastState,
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
  const stats = pollStats({ votes_gold: 0, votes_property: 0 });
  assert.equal(stats.gold, 0);
  assert.equal(stats.property, 0);
  assert.equal(stats.total, 0);
  assert.equal(stats.goldPercent, 0);
  assert.equal(stats.propertyPercent, 0);
  assert.equal(stats.options.every((option) => Number.isFinite(option.percent)), true);
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
  assert.equal(poll.presentation.colors.chrome, "#031f17");
  assert.equal(poll.presentation.colors.textPrimary, "#ffffff");
  assert.equal(poll.presentation.branding.showLogo, true);
  assert.equal(poll.presentation.branding.logoSize, 82);
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

test("normalizes display branding controls", () => {
  const poll = normalizePoll({ presentation: { branding: { showLogo: false, logoUrl: " https://example.com/logo.png ", logoSize: 999 } } });
  assert.equal(poll.presentation.branding.showLogo, false);
  assert.equal(poll.presentation.branding.logoUrl, "https://example.com/logo.png");
  assert.equal(poll.presentation.branding.logoSize, 240);
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
  const invalidVotes = defaultPoll();
  invalidVotes.options[0].votes = -1;
  assert.throws(() => validatePoll(invalidVotes), /คะแนน/);
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

test("keeps two poll sets independent", () => {
  const first = defaultPoll(POLL_IDS[0]);
  const second = defaultPoll(POLL_IDS[1]);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.question, second.question);
  assert.equal(second.votes_gold, 0);
  assert.equal(second.votes_property, 0);
});

test("normalizes the shared live broadcast state", () => {
  const state = normalizeBroadcastState({ active_poll_id: POLL_IDS[1], phase: "question" });
  assert.equal(state.active_poll_id, POLL_IDS[1]);
  assert.equal(state.phase, "question");
  assert.equal(normalizeBroadcastState({ phase: "invalid" }).phase, "results");
});

test("live phases override each screen mapping", () => {
  const poll = defaultPoll(POLL_IDS[1]);
  assert.equal(contentForScreen(poll, "combined", "question"), "question");
  assert.equal(contentForScreen(poll, "gold", "summary"), "total");
  assert.equal(contentForScreen(poll, "property", "results"), "property");
});

test("calculates percentages for added options", () => {
  const poll = normalizePoll({
    ...defaultPoll(),
    options: [
      { id: "option-1", label: "A", votes: 50, color: "#111111" },
      { id: "option-2", label: "B", votes: 30, color: "#222222" },
      { id: "option-3", label: "C", votes: 20, color: "#333333" },
    ],
  });
  const stats = pollStats(poll);
  assert.equal(stats.total, 100);
  assert.deepEqual(stats.options.map((option) => option.percent), [50, 30, 20]);
});
