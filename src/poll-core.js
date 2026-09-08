import { DEFAULT_PRESENTATION, clone, defaultPoll } from "./defaults.js";

export function clamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

export function pollStats(poll) {
  const gold = Math.max(0, Math.trunc(Number(poll?.votes_gold) || 0));
  const property = Math.max(0, Math.trunc(Number(poll?.votes_property) || 0));
  const total = gold + property;
  const goldPercent = total ? (gold / total) * 100 : 0;
  return {
    gold,
    property,
    total,
    goldPercent,
    propertyPercent: total ? 100 - goldPercent : 0,
  };
}

export function formatPercent(value) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

export function formatNumber(value) {
  return new Intl.NumberFormat("th-TH").format(Math.max(0, Number(value) || 0));
}

export function formatThaiDate(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function normalizeFontUrl(value, name = "Noto Sans Thai") {
  const input = String(value || "").trim();
  if (/^https:\/\/fonts\.googleapis\.com\//i.test(input)) return input;
  const family = (input || name || "Noto Sans Thai").trim().replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%2B/g, "+")}:wght@400;500;600;700;800;900&display=swap`;
}

function normalizeScreen(value, fallback) {
  return {
    backgroundUrl: String(value?.backgroundUrl || "").trim(),
    backgroundFit: ["cover", "contain"].includes(value?.backgroundFit) ? value.backgroundFit : fallback.backgroundFit,
    backgroundX: clamp(value?.backgroundX ?? fallback.backgroundX, 0, 100),
    backgroundY: clamp(value?.backgroundY ?? fallback.backgroundY, 0, 100),
    backgroundScale: clamp(value?.backgroundScale ?? fallback.backgroundScale, 50, 200),
    artworkUrl: String(value?.artworkUrl || "").trim(),
    artworkSize: clamp(value?.artworkSize ?? fallback.artworkSize, 10, 100),
    artworkX: clamp(value?.artworkX ?? fallback.artworkX, 0, 100),
    artworkY: clamp(value?.artworkY ?? fallback.artworkY, 0, 100),
  };
}

function normalizeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

export function normalizePresentation(value = {}) {
  const fallback = clone(DEFAULT_PRESENTATION);
  const font = value.font || {};
  const allowedContent = ["question", "combined", "gold", "property", "total"];
  const assignment = value.screenAssignments || {};
  return {
    displayMode: ["combined", "dual", "fullscreen"].includes(value.displayMode) ? value.displayMode : fallback.displayMode,
    screenAssignments: {
      left: allowedContent.includes(assignment.left) ? assignment.left : fallback.screenAssignments.left,
      center: allowedContent.includes(assignment.center) ? assignment.center : fallback.screenAssignments.center,
      right: allowedContent.includes(assignment.right) ? assignment.right : fallback.screenAssignments.right,
    },
    font: {
      name: String(font.name || fallback.font.name).trim(),
      url: normalizeFontUrl(font.url, font.name || fallback.font.name),
      question: clamp(font.question ?? fallback.font.question, 24, 96),
      asset: clamp(font.asset ?? fallback.font.asset, 20, 72),
      percent: clamp(font.percent ?? fallback.font.percent, 48, 180),
      votes: clamp(font.votes ?? fallback.font.votes, 14, 48),
      secondary: clamp(font.secondary ?? fallback.font.secondary, 12, 36),
    },
    colors: {
      gold: normalizeColor(value.colors?.gold, fallback.colors.gold),
      center: normalizeColor(value.colors?.center, fallback.colors.center),
      property: normalizeColor(value.colors?.property, fallback.colors.property),
      chrome: normalizeColor(value.colors?.chrome, fallback.colors.chrome),
      textPrimary: normalizeColor(value.colors?.textPrimary, fallback.colors.textPrimary),
      textSecondary: normalizeColor(value.colors?.textSecondary, fallback.colors.textSecondary),
    },
    branding: {
      showLogo: value.branding?.showLogo !== false,
      logoUrl: String(value.branding?.logoUrl || "").trim(),
      logoSize: clamp(value.branding?.logoSize ?? fallback.branding.logoSize, 32, 240),
    },
    screens: {
      gold: normalizeScreen(value.screens?.gold, fallback.screens.gold),
      property: normalizeScreen(value.screens?.property, fallback.screens.property),
    },
  };
}

export function normalizePoll(value = {}) {
  const fallback = defaultPoll();
  return {
    id: value.id || fallback.id,
    question: String(value.question || fallback.question).trim().slice(0, 240),
    option_gold: String(value.option_gold || fallback.option_gold).trim().slice(0, 80),
    option_property: String(value.option_property || fallback.option_property).trim().slice(0, 80),
    votes_gold: Math.max(0, Math.trunc(Number(value.votes_gold) || 0)),
    votes_property: Math.max(0, Math.trunc(Number(value.votes_property) || 0)),
    presentation: normalizePresentation(value.presentation),
    updated_at: value.updated_at || fallback.updated_at,
    updated_by: value.updated_by || null,
  };
}

export function validatePoll(poll) {
  if (!poll.question.trim()) throw new Error("กรุณากรอกคำถาม");
  if (!poll.option_gold.trim() || !poll.option_property.trim()) throw new Error("กรุณากรอกชื่อตัวเลือกทั้งสอง");
  if (![poll.votes_gold, poll.votes_property].every((value) => Number.isInteger(Number(value)) && Number(value) >= 0)) {
    throw new Error("คะแนนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  }
  return true;
}

export function hasMeaningfulChange(before, after) {
  const fields = ["question", "option_gold", "option_property", "votes_gold", "votes_property", "presentation"];
  return fields.some((field) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]));
}
