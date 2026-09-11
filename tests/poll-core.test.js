import assert from "node:assert/strict";
import test from "node:test";
import { POLL_IDS, defaultPoll } from "../src/defaults.js";
import { contentForScreen, displayMarkup, optionContentForIds, optionIdsForContent } from "../src/display-view.js";
import {
  broadcastStatePatch,
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
  assert.equal(poll.presentation.animation.speed, 1);
  assert.equal(poll.presentation.questionSubtitle, "ร่วมแสดงความคิดเห็นของคุณ");
  assert.deepEqual(poll.presentation.screenAssignments, {
    left: "gold",
    center: "combined",
    right: "property",
  });
});

test("preserves question spacing, line breaks, and editable subtitle", () => {
  const question = "  บรรทัดแรก\nบรรทัดที่สอง   เว้นวรรค  ";
  const subtitle = "ร่วมโหวต\nได้ที่นี่";
  const poll = normalizePoll({ question, presentation: { questionSubtitle: subtitle } });
  assert.equal(poll.question, question);
  assert.equal(poll.presentation.questionSubtitle, subtitle);
  const markup = displayMarkup(poll, "combined", { phase: "question" });
  assert.ok(markup.includes(question));
  assert.ok(markup.includes(subtitle));
});

test("center result display omits vote counts but keeps calculated percentages", () => {
  const poll = normalizePoll({ votes_gold: 75, votes_property: 25 });
  const centerMarkup = displayMarkup(poll, "combined", { phase: "results" });
  assert.match(centerMarkup, /75[,.]0/);
  assert.match(centerMarkup, /25[,.]0/);
  assert.doesNotMatch(centerMarkup, /option-votes/);
  assert.doesNotMatch(centerMarkup, /ยอดโหวตรวม/);

  const sideMarkup = displayMarkup(poll, "gold", { phase: "results" });
  assert.match(sideMarkup, /option-votes/);
  assert.match(sideMarkup, /ยอดโหวตรวม/);
});

test("keeps independent visual settings for both poll sets", () => {
  const first = normalizePoll({
    id: POLL_IDS[0],
    presentation: { questionSubtitle: "ข้อความชุดหนึ่ง", font: { question: 24, asset: 20, percent: 48, votes: 14, secondary: 12 } },
  });
  const second = normalizePoll({
    id: POLL_IDS[1],
    presentation: { questionSubtitle: "ข้อความชุดสอง", font: { question: 96, asset: 72, percent: 180, votes: 48, secondary: 36 } },
  });
  assert.equal(first.presentation.questionSubtitle, "ข้อความชุดหนึ่ง");
  assert.equal(first.presentation.font.question, 24);
  assert.equal(first.presentation.font.asset, 20);
  assert.equal(first.presentation.font.percent, 48);
  assert.equal(first.presentation.font.votes, 14);
  assert.equal(first.presentation.font.secondary, 12);
  assert.equal(second.presentation.questionSubtitle, "ข้อความชุดสอง");
  assert.equal(second.presentation.font.question, 96);
  assert.equal(second.presentation.font.asset, 72);
  assert.equal(second.presentation.font.percent, 180);
  assert.equal(second.presentation.font.votes, 48);
  assert.equal(second.presentation.font.secondary, 36);
});

test("normalizes display background colors and rejects invalid values", () => {
  const poll = normalizePoll({
    presentation: { colors: { gold: "#ABCDEF", center: "red", property: "#123456" } },
  });
  assert.equal(poll.presentation.colors.gold, "#abcdef");
  assert.equal(poll.presentation.colors.center, "#0b513b");
  assert.equal(poll.presentation.colors.property, "#123456");
});

test("uses option colors as the shared result colors on every display", () => {
  const poll = normalizePoll({
    options: [
      { id: "option-1", label: "หุ้น จีน", votes: 300, color: "#ffc843" },
      { id: "option-2", label: "หุ้น อเมริกา", votes: 2000, color: "#002de9" },
    ],
    presentation: { colors: { gold: "#8a5c12", property: "#0d6348" } },
  });
  assert.equal(poll.presentation.colors.gold, "#ffc843");
  assert.equal(poll.presentation.colors.property, "#002de9");
  const markup = displayMarkup(poll, "combined", { phase: "results" });
  assert.match(markup, /--option-color:#ffc843/);
  assert.match(markup, /--option-color:#002de9/);
});

test("normalizes display branding controls", () => {
  const poll = normalizePoll({ presentation: { branding: { showLogo: false, logoUrl: " https://example.com/logo.png ", logoSize: 999 } } });
  assert.equal(poll.presentation.branding.showLogo, false);
  assert.equal(poll.presentation.branding.logoUrl, "https://example.com/logo.png");
  assert.equal(poll.presentation.branding.logoSize, 240);
});

test("normalizes animation speed and per-option visual controls", () => {
  const poll = normalizePoll({
    presentation: { animation: { speed: 9 } },
    options: [
      {
        id: "option-1",
        label: "หนึ่ง",
        votes: 1,
        color: "#112233",
        visual: {
          backgroundUrl: " https://example.com/background.jpg ",
          backgroundX: 120,
          artworkUrl: "https://example.com/art.png",
          artworkSize: 75,
        },
      },
      { id: "option-2", label: "สอง", votes: 2, color: "#334455" },
      { id: "option-3", label: "สาม", votes: 3, color: "#556677", visual: { artworkY: 18 } },
    ],
  });
  assert.equal(poll.presentation.animation.speed, 3);
  assert.equal(poll.options[0].visual.backgroundUrl, "https://example.com/background.jpg");
  assert.equal(poll.options[0].visual.backgroundX, 100);
  assert.equal(poll.options[0].visual.artworkSize, 75);
  assert.equal(poll.options[2].visual.artworkY, 18);
  assert.equal(poll.presentation.screens.gold.backgroundUrl, "https://example.com/background.jpg");
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

test("stores multiple selected options in one side-screen mapping", () => {
  const poll = normalizePoll({
    options: [
      { id: "option-1", label: "หนึ่ง", votes: 10, color: "#c28f19" },
      { id: "option-2", label: "สอง", votes: 20, color: "#087c58" },
      { id: "option-3", label: "สาม", votes: 30, color: "#315dd8" },
    ],
    presentation: { screenAssignments: { left: "options:option-1,option-3", center: "combined", right: "option:option-2" } },
  });
  assert.deepEqual(optionIdsForContent(poll.presentation.screenAssignments.left, poll), ["option-1", "option-3"]);
  assert.equal(optionContentForIds(["option-3", "option-1"], poll), "options:option-3,option-1");
  assert.equal(poll.presentation.screenAssignments.left, "options:option-1,option-3");
});

test("renders multiple selected choices on a portrait side display", () => {
  const poll = normalizePoll({
    options: [
      { id: "option-1", label: "หนึ่ง", votes: 10, color: "#c28f19" },
      { id: "option-2", label: "สอง", votes: 20, color: "#087c58" },
      { id: "option-3", label: "สาม", votes: 30, color: "#315dd8" },
    ],
    presentation: { screenAssignments: { left: "options:option-1,option-3" } },
  });
  const markup = displayMarkup(poll, "gold", { phase: "results" });
  assert.match(markup, /display-content--multiple/);
  assert.match(markup, /result-count--2/);
  assert.equal((markup.match(/data-option-id=/g) || []).length, 2);
  assert.doesNotMatch(markup, /data-option-id="option-2"/);
});

test("repairs a saved multi-screen mapping after an option is removed", () => {
  const poll = normalizePoll({
    options: [
      { id: "option-1", label: "หนึ่ง", votes: 10, color: "#c28f19" },
      { id: "option-2", label: "สอง", votes: 20, color: "#087c58" },
    ],
    presentation: { screenAssignments: { left: "options:option-1,option-missing" } },
  });
  assert.equal(poll.presentation.screenAssignments.left, "option:option-1");
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

test("broadcast updates only include fields explicitly changed", () => {
  assert.deepEqual(broadcastStatePatch({ phase: "results" }), { phase: "results" });
  assert.deepEqual(
    broadcastStatePatch({ active_poll_id: POLL_IDS[1], phase: "question" }),
    { active_poll_id: POLL_IDS[1], phase: "question" },
  );
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

test("renders four combined options as a dedicated two-by-two grid", () => {
  const poll = normalizePoll({
    options: [
      { id: "one", label: "หนึ่ง", votes: 40, color: "#8a5c12" },
      { id: "two", label: "สอง", votes: 30, color: "#0d6348" },
      { id: "three", label: "สาม", votes: 20, color: "#315c9b" },
      { id: "four", label: "สี่", votes: 10, color: "#7d3f98" },
    ],
  });
  const markup = displayMarkup(poll, "combined", { phase: "results" });
  assert.match(markup, /option-grid--4/);
  assert.match(markup, /data-option-count="4"/);
  assert.equal((markup.match(/data-option-id=/g) || []).length, 4);
});
