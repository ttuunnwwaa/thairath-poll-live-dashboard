import {
  DEFAULT_OPTION_COLORS,
  DEFAULT_PRESENTATION,
  MAX_POLL_OPTIONS,
  POLL_IDS,
  clone,
  defaultBroadcastState,
  defaultPoll,
} from "./defaults.js";

export function clamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

export function pollStats(poll) {
  const source = Array.isArray(poll?.options) && poll.options.length
    ? poll.options
    : [
        { id: "option-1", label: poll?.option_gold || "", votes: poll?.votes_gold },
        { id: "option-2", label: poll?.option_property || "", votes: poll?.votes_property },
      ];
  const options = source.map((option, index) => ({
    ...option,
    votes: Math.max(0, Math.trunc(Number(option?.votes) || 0)),
    index,
  }));
  const total = options.reduce((sum, option) => sum + option.votes, 0);
  options.forEach((option) => { option.percent = total ? (option.votes / total) * 100 : 0; });
  const gold = options[0]?.votes || 0;
  const property = options[1]?.votes || 0;
  const goldPercent = options[0]?.percent || 0;
  return {
    options,
    gold,
    property,
    total,
    goldPercent,
    propertyPercent: options[1]?.percent || 0,
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
  const allowedContent = (content) => ["question", "combined", "gold", "property", "total"].includes(content)
    || /^option:[a-z0-9-]{1,48}$/i.test(String(content || ""));
  const assignment = value.screenAssignments || {};
  return {
    displayMode: ["combined", "dual", "fullscreen"].includes(value.displayMode) ? value.displayMode : fallback.displayMode,
    screenAssignments: {
      left: allowedContent(assignment.left) ? assignment.left : fallback.screenAssignments.left,
      center: allowedContent(assignment.center) ? assignment.center : fallback.screenAssignments.center,
      right: allowedContent(assignment.right) ? assignment.right : fallback.screenAssignments.right,
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
  const id = POLL_IDS.includes(value.id) ? value.id : POLL_IDS[0];
  const fallback = defaultPoll(id);
  const presentation = normalizePresentation(value.presentation);
  const legacyOptions = [
    { id: "option-1", label: value.option_gold || fallback.option_gold, votes: value.votes_gold ?? fallback.votes_gold, color: presentation.colors.gold },
    { id: "option-2", label: value.option_property || fallback.option_property, votes: value.votes_property ?? fallback.votes_property, color: presentation.colors.property },
  ];
  const rawOptions = Array.isArray(value.options) && value.options.length >= 2 ? value.options : legacyOptions;
  const usedIds = new Set();
  const options = rawOptions.slice(0, MAX_POLL_OPTIONS).map((option, index) => {
    const candidate = String(option?.id || `option-${index + 1}`).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48) || `option-${index + 1}`;
    const optionId = usedIds.has(candidate) ? `option-${index + 1}` : candidate;
    usedIds.add(optionId);
    const color = String(option?.color || DEFAULT_OPTION_COLORS[index] || presentation.colors.center).trim();
    return {
      id: optionId,
      label: String(option?.label || `ตัวเลือกที่ ${index + 1}`).trim().slice(0, 80),
      votes: Math.max(0, Math.trunc(Number(option?.votes) || 0)),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_OPTION_COLORS[index],
    };
  });
  return {
    id,
    question: String(value.question || fallback.question).trim().slice(0, 240),
    option_gold: options[0].label,
    option_property: options[1].label,
    votes_gold: options[0].votes,
    votes_property: options[1].votes,
    options,
    presentation,
    updated_at: value.updated_at || fallback.updated_at,
    updated_by: value.updated_by || null,
  };
}

export function normalizeBroadcastState(value = {}) {
  const fallback = defaultBroadcastState();
  return {
    id: true,
    active_poll_id: POLL_IDS.includes(value.active_poll_id) ? value.active_poll_id : fallback.active_poll_id,
    phase: ["question", "results", "summary"].includes(value.phase) ? value.phase : fallback.phase,
    updated_at: value.updated_at || fallback.updated_at,
    updated_by: value.updated_by || null,
  };
}

export function validatePoll(poll) {
  if (!poll.question.trim()) throw new Error("กรุณากรอกคำถาม");
  if (!Array.isArray(poll.options) || poll.options.length < 2) throw new Error("ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก");
  if (poll.options.some((option) => !option.label.trim())) throw new Error("กรุณากรอกชื่อทุกตัวเลือก");
  if (!poll.options.every((option) => Number.isInteger(Number(option.votes)) && Number(option.votes) >= 0)) {
    throw new Error("คะแนนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
  }
  return true;
}

export function hasMeaningfulChange(before, after) {
  const fields = ["question", "option_gold", "option_property", "votes_gold", "votes_property", "options", "presentation"];
  return fields.some((field) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]));
}
