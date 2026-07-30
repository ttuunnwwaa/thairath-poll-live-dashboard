import "./styles.css";
import {
  TAU,
  contrastRatio,
  detectDelimiter,
  dedupeEntries,
  formatCSV,
  generateRange,
  isSafeSvg,
  parseDelimitedText,
  parseEntries,
  secureRandomIndex,
  spinEaseOut,
  targetRotation,
  uid,
  validateProjectPayload,
  winnerIndexAtPointer,
} from "./core.js";
import { clearProject, loadProject, saveProject } from "./storage.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const palettes = {
  stadium: {
    primary: "#0f8b6d",
    secondary: "#d5a845",
    border: "#d5a845",
    text: "#f8fbf6",
    glow: "#f0cb68",
  },
  emerald: {
    primary: "#075d4c",
    secondary: "#9ee3bf",
    border: "#5dbf98",
    text: "#f4fff9",
    glow: "#61e1ac",
  },
  royal: {
    primary: "#1745a0",
    secondary: "#f0c964",
    border: "#d8ac48",
    text: "#f7f9ff",
    glow: "#7ba8ff",
  },
};

function defaultNumbers() {
  return generateRange({ start: 1, end: 100, digits: 3 }).map((label) => ({
    id: uid("num"),
    label,
    removed: false,
  }));
}

function defaultState() {
  return {
    version: 5,
    projectId: uid("project"),
    sessionId: uid("session"),
    campaignTitle: "แคมเปญทายผลแชมป์ฟุตบอลโลก 2026",
    campaignSubtitle: "ร่วมกับไทยรัฐกรุ๊ป",
    topbarEyebrow: "OFFICIAL DRAW CONSOLE",
    topbarStatus: "พร้อมสุ่ม",
    stageKicker: "LUCKY DRAW • LIVE EVENT",
    stageTitle: "หมุนวงล้อแห่งโชค",
    stageDescription: "ทุกหมายเลขมีโอกาสเท่ากัน — เลือกผลด้วยการสุ่มแบบเข้ารหัสก่อนเริ่มหมุน",
    numbers: defaultNumbers(),
    history: [],
    settings: {
      allowDuplicates: false,
      palette: "stadium",
      ...palettes.stadium,
      fontFamily: "system-ui",
      fontWeight: 700,
      fontSize: 16,
      textDirection: "radial",
      showLabels: true,
      topbarVisible: true,
      topbarLogoSize: 58,
      stageHeadingVisible: true,
      scoreboardVisible: true,
      nextDrawVisible: true,
      spinDuration: 7,
      resultDelay: 1.5,
      minRotations: 6,
      pointerStrength: 70,
      pointerShakeEnabled: true,
      removeConfirmed: true,
      motionBlur: true,
      escapeCloses: false,
      soundEnabled: true,
      volume: 55,
      confettiEnabled: true,
      glowEnabled: true,
      performanceMode: false,
      backgroundFit: "cover",
      backgroundPosition: "center",
      backgroundScale: 100,
      backgroundX: 50,
      backgroundY: 50,
      overlayDarkness: 55,
      backgroundBlur: 0,
      logoSize: 34,
      logoImageSize: 78,
      logoImageX: 0,
      logoImageY: 0,
      logoBackgroundTransparent: false,
      pointerSize: 74,
      pointerOffset: -8,
      pointerX: 0,
      pointerRotation: 0,
      segmentImageFit: "contain",
      segmentImageShape: "circle",
      segmentImageSize: 14,
      segmentImageRadius: 72,
    },
    assets: {
      background: null,
      topbarLogo: null,
      logo: null,
      pointer: null,
      segmentImage: null,
      winnerSound: null,
      segmentMappings: {},
    },
  };
}

let state = defaultState();
let wheelRotation = 0;
let spinning = false;
let pendingWinner = null;
let currentPage = 1;
let saveTimer = 0;
let audioContext = null;
let customWinnerAudio = null;
let segmentImage = null;
let mappedImages = new Map();
let confettiFrame = 0;
let resizeQueued = false;
let focusBeforeModal = null;
let wheelResizeObserver = null;
let holdingResult = false;
let resultDelayTimer = 0;

const canvas = $("#wheelCanvas");
const context = canvas.getContext("2d", { alpha: false });
const wheelFrame = $("#wheelFrame");
const modal = $("#winnerModal");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

function syncSpinClasses() {
  document.body.classList.toggle("spinning", spinning);
  document.body.classList.toggle(
    "motion-blur",
    spinning && state.settings.motionBlur && !state.settings.performanceMode,
  );
  document.body.classList.toggle(
    "pointer-shake-active",
    spinning && state.settings.pointerShakeEnabled && state.settings.pointerStrength > 0,
  );
}

function activeNumbers() {
  return state.numbers.filter((item) => !item.removed);
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $("#toastRegion").append(toast);
  setTimeout(() => toast.remove(), 3600);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  $("#saveStatus").textContent = "กำลังบันทึก…";
  saveTimer = setTimeout(async () => {
    try {
      await saveProject(state);
      $("#saveStatus").textContent = "บันทึกอัตโนมัติแล้ว";
      localStorage.setItem("lucky-draw-last-project", state.projectId);
    } catch {
      $("#saveStatus").textContent = "บันทึกไม่สำเร็จ";
      showToast("พื้นที่บันทึกใน Browser ไม่เพียงพอ", "error");
    }
  }, 450);
}

function updateState(mutator, { redraw = true, controls = false } = {}) {
  mutator(state);
  if (controls) applyStateToControls();
  applyVisualSettings();
  updateDashboard();
  renderNumberList();
  renderHistory();
  renderMappings();
  if (redraw) drawWheel();
  scheduleSave();
}

function formatThaiDate(timestamp) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(timestamp));
}

function updateDashboard() {
  const active = activeNumbers().length;
  const total = state.numbers.length;
  const latest = state.history.at(-1);
  const completed = total ? Math.round(((total - active) / total) * 100) : 0;
  $("#totalCount").textContent = total.toLocaleString("th-TH");
  $("#activeCount").textContent = active.toLocaleString("th-TH");
  $("#confirmedCount").textContent = `ยืนยันแล้ว ${state.history.length.toLocaleString("th-TH")} รายการ`;
  $("#progressText").textContent = `${completed}%`;
  $("#progressBar").style.width = `${completed}%`;
  $("#nextDrawNumber").textContent = `#${String(state.history.length + 1).padStart(2, "0")}`;
  $("#latestNumber").textContent = latest?.number ?? "—";
  $("#latestTime").textContent = latest ? formatThaiDate(latest.timestamp) : "ยังไม่มีผลการสุ่ม";
  const statusText = spinning
    ? "กำลังสุ่ม"
    : holdingResult
      ? "วงล้อหยุดแล้ว"
      : active
        ? state.topbarStatus
        : "ไม่มีหมายเลข";
  $("#topbarStatus").textContent = statusText;
  $("#spinButton").disabled = spinning || holdingResult || active === 0;
  $("#panelToggle").disabled = spinning || holdingResult;

  const recent = state.history.slice(-3).reverse();
  $("#recentHistory").innerHTML = recent.length
    ? recent
        .map(
          (entry) => `<div class="recent-row"><span>#${entry.sequence}</span><b>${escapeHTML(entry.number)}</b><small>${new Date(entry.timestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</small></div>`,
        )
        .join("")
    : '<p class="empty-note">ผลที่ยืนยันจะแสดงที่นี่</p>';
}

function applyVisualSettings() {
  const root = document.documentElement;
  root.style.setProperty("--primary", state.settings.primary);
  root.style.setProperty("--secondary", state.settings.secondary);
  root.style.setProperty("--border", state.settings.border);
  root.style.setProperty("--text", state.settings.text);
  root.style.setProperty("--glow", state.settings.glow);
  root.style.setProperty("--hub-size", `${state.settings.logoSize}%`);
  root.style.setProperty("--logo-image-size", `${state.settings.logoImageSize}%`);
  root.style.setProperty("--logo-image-x", `${state.settings.logoImageX}%`);
  root.style.setProperty("--logo-image-y", `${state.settings.logoImageY}%`);
  root.style.setProperty("--pointer-size", `${state.settings.pointerSize}px`);
  root.style.setProperty("--pointer-offset", `${state.settings.pointerOffset}px`);
  root.style.setProperty("--pointer-x", `${state.settings.pointerX}px`);
  root.style.setProperty("--pointer-rotation", `${state.settings.pointerRotation}deg`);
  root.style.setProperty("--topbar-logo-size", `${state.settings.topbarLogoSize}px`);
  root.style.setProperty("--shake-angle", `${(state.settings.pointerStrength / 100) * 12}deg`);
  $("#campaignTitle").textContent = state.campaignTitle;
  $("#campaignSubtitle").textContent = state.campaignSubtitle;
  $("#topbarEyebrow").textContent = state.topbarEyebrow;
  $("#stageKicker").textContent = state.stageKicker;
  $("#stageTitle").textContent = state.stageTitle;
  $("#stageDescription").textContent = state.stageDescription;
  $("#app").classList.toggle("topbar-hidden", !state.settings.topbarVisible);
  $("#app").classList.toggle("stage-copy-hidden", !state.settings.stageHeadingVisible);
  $("#app").classList.toggle("scoreboard-hidden", !state.settings.scoreboardVisible);
  $("#app").classList.toggle("next-draw-hidden", !state.settings.nextDrawVisible);
  $("#topbarReveal").hidden = state.settings.topbarVisible;
  $("#hideTopbarButton").setAttribute("aria-pressed", String(!state.settings.topbarVisible));
  $("#app").classList.toggle("performance-mode", state.settings.performanceMode);
  const backgroundLayer = $("#eventBackground");
  backgroundLayer.style.backgroundImage = state.assets.background
    ? `linear-gradient(rgba(2,10,17,${state.settings.overlayDarkness / 100}),rgba(2,10,17,${state.settings.overlayDarkness / 100})),url("${state.assets.background}")`
    : "";
  const backgroundImageSize =
    state.settings.backgroundFit === "custom" ? `auto ${state.settings.backgroundScale}%` : state.settings.backgroundFit;
  const backgroundImagePosition =
    state.settings.backgroundPosition === "custom"
      ? `${state.settings.backgroundX}% ${state.settings.backgroundY}%`
      : state.settings.backgroundPosition;
  backgroundLayer.style.backgroundSize = state.assets.background ? `100% 100%, ${backgroundImageSize}` : "";
  backgroundLayer.style.backgroundPosition = state.assets.background ? `center, ${backgroundImagePosition}` : "";
  backgroundLayer.style.filter =
    state.assets.background && state.settings.backgroundBlur && !state.settings.performanceMode
      ? `blur(${state.settings.backgroundBlur}px)`
      : "none";
  backgroundLayer.hidden = !state.assets.background;

  const topbarLogo = $("#topbarLogo");
  topbarLogo.hidden = !state.assets.topbarLogo;
  $("#topbarMark").hidden = Boolean(state.assets.topbarLogo);
  if (state.assets.topbarLogo) topbarLogo.src = state.assets.topbarLogo;

  const logo = $("#centerLogo");
  $("#wheelHub").classList.toggle("transparent-background", state.settings.logoBackgroundTransparent);
  logo.hidden = !state.assets.logo;
  $("#hubPlaceholder").hidden = Boolean(state.assets.logo);
  if (state.assets.logo) logo.src = state.assets.logo;

  const pointer = $("#pointerImage");
  pointer.hidden = !state.assets.pointer;
  $("#pointerDefault").hidden = Boolean(state.assets.pointer);
  if (state.assets.pointer) pointer.src = state.assets.pointer;
  syncSpinClasses();
  $("#soundToggle").textContent = state.settings.soundEnabled ? "♪" : "⊘";
}

function applyStateToControls() {
  const fields = {
    allowDuplicates: state.settings.allowDuplicates,
    campaignTitleInput: state.campaignTitle,
    campaignSubtitleInput: state.campaignSubtitle,
    topbarEyebrowInput: state.topbarEyebrow,
    topbarStatusInput: state.topbarStatus,
    topbarVisible: state.settings.topbarVisible,
    topbarLogoSize: state.settings.topbarLogoSize,
    stageKickerInput: state.stageKicker,
    stageTitleInput: state.stageTitle,
    stageDescriptionInput: state.stageDescription,
    stageHeadingVisible: state.settings.stageHeadingVisible,
    scoreboardVisible: state.settings.scoreboardVisible,
    nextDrawVisible: state.settings.nextDrawVisible,
    primaryColor: state.settings.primary,
    secondaryColor: state.settings.secondary,
    borderColor: state.settings.border,
    textColor: state.settings.text,
    glowColor: state.settings.glow,
    fontFamily: state.settings.fontFamily,
    fontWeight: String(state.settings.fontWeight),
    fontSize: state.settings.fontSize,
    textDirection: state.settings.textDirection,
    showLabels: state.settings.showLabels,
    spinDuration: state.settings.spinDuration,
    resultDelay: state.settings.resultDelay,
    minRotations: state.settings.minRotations,
    pointerStrength: state.settings.pointerStrength,
    pointerShakeEnabled: state.settings.pointerShakeEnabled,
    removeConfirmed: state.settings.removeConfirmed,
    motionBlur: state.settings.motionBlur,
    escapeCloses: state.settings.escapeCloses,
    soundEnabled: state.settings.soundEnabled,
    volume: state.settings.volume,
    confettiEnabled: state.settings.confettiEnabled,
    glowEnabled: state.settings.glowEnabled,
    performanceMode: state.settings.performanceMode,
    backgroundFit: state.settings.backgroundFit,
    backgroundPosition: state.settings.backgroundPosition,
    backgroundScale: state.settings.backgroundScale,
    backgroundX: state.settings.backgroundX,
    backgroundY: state.settings.backgroundY,
    overlayDarkness: state.settings.overlayDarkness,
    backgroundBlur: state.settings.backgroundBlur,
    logoSize: state.settings.logoSize,
    logoImageSize: state.settings.logoImageSize,
    logoImageX: state.settings.logoImageX,
    logoImageY: state.settings.logoImageY,
    logoBackgroundTransparent: state.settings.logoBackgroundTransparent,
    pointerSize: state.settings.pointerSize,
    pointerOffset: state.settings.pointerOffset,
    pointerX: state.settings.pointerX,
    pointerRotation: state.settings.pointerRotation,
    segmentImageFit: state.settings.segmentImageFit,
    segmentImageShape: state.settings.segmentImageShape,
    segmentImageSize: state.settings.segmentImageSize,
    segmentImageRadius: state.settings.segmentImageRadius,
  };
  for (const [id, value] of Object.entries(fields)) {
    const element = $(`#${id}`);
    if (!element) continue;
    if (element.type === "checkbox") element.checked = Boolean(value);
    else element.value = value;
  }
  updateOutputs();
  $$(".palette").forEach((button) =>
    button.classList.toggle("active", button.dataset.palette === state.settings.palette),
  );
}

function updateOutputs() {
  $("#fontSizeValue").textContent = `${state.settings.fontSize}px`;
  $("#durationValue").textContent = `${state.settings.spinDuration} วินาที`;
  const resultDelay = Math.max(0, Number(state.settings.resultDelay) || 0);
  $("#resultDelayValue").textContent = resultDelay === 0 ? "แสดงทันที" : `${resultDelay.toFixed(1)} วินาที`;
  $("#rotationsValue").textContent = `${state.settings.minRotations} รอบ`;
  $("#shakeValue").textContent = `${state.settings.pointerStrength}%`;
  $("#volumeValue").textContent = `${state.settings.volume}%`;
  $("#overlayValue").textContent = `${state.settings.overlayDarkness}%`;
  $("#blurValue").textContent = `${state.settings.backgroundBlur}px`;
  $("#backgroundScaleValue").textContent = `${state.settings.backgroundScale}%`;
  $("#backgroundXValue").textContent = `${state.settings.backgroundX}%`;
  $("#backgroundYValue").textContent = `${state.settings.backgroundY}%`;
  $("#logoSizeValue").textContent = `${state.settings.logoSize}%`;
  $("#logoImageSizeValue").textContent = `${state.settings.logoImageSize}%`;
  $("#logoImageXValue").textContent = `${state.settings.logoImageX}%`;
  $("#logoImageYValue").textContent = `${state.settings.logoImageY}%`;
  $("#pointerSizeValue").textContent = `${state.settings.pointerSize}px`;
  $("#pointerOffsetValue").textContent = `${state.settings.pointerOffset}px`;
  $("#pointerXValue").textContent = `${state.settings.pointerX}px`;
  $("#pointerRotationValue").textContent = `${state.settings.pointerRotation}°`;
  $("#segmentImageSizeValue").textContent = `${state.settings.segmentImageSize}%`;
  $("#segmentImageRadiusValue").textContent = `${state.settings.segmentImageRadius}%`;
  $("#topbarLogoSizeValue").textContent = `${state.settings.topbarLogoSize}px`;
  const ratio = contrastRatio(state.settings.text, state.settings.primary);
  $("#contrastNote").textContent =
    ratio >= 3 ? `✓ Contrast ผ่านเกณฑ์พื้นฐาน (${ratio.toFixed(1)}:1)` : `⚠ Contrast ค่อนข้างต่ำ (${ratio.toFixed(1)}:1)`;
  $("#contrastNote").style.color = ratio >= 3 ? "#75dcb8" : "#ffc286";
}

function resizeCanvas() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    const size = Math.max(1, wheelFrame.clientWidth);
    const dpr = Math.min(devicePixelRatio || 1, state.settings.performanceMode ? 1.5 : 2.5);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    drawWheel();
  });
}

function loadSegmentAssets() {
  if (state.assets.segmentImage) {
    const image = new Image();
    image.onload = () => {
      segmentImage = image;
      drawWheel();
    };
    image.src = state.assets.segmentImage;
  } else segmentImage = null;

  mappedImages = new Map();
  for (const [number, source] of Object.entries(state.assets.segmentMappings ?? {})) {
    const image = new Image();
    image.onload = () => drawWheel();
    image.src = source;
    mappedImages.set(number, image);
  }
}

function drawImageFitted(image, x, y, width, height, fit = "contain") {
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  const scale = fit === "cover"
    ? Math.max(width / sourceWidth, height / sourceHeight)
    : Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawWheel() {
  const width = canvas.width;
  if (!width) return;
  const dpr = width / Math.max(1, wheelFrame.clientWidth);
  const size = width / dpr;
  const active = activeNumbers();
  const count = Math.max(active.length, 1);
  const radius = size / 2;
  const arc = TAU / count;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, size, size);
  context.save();
  context.translate(radius, radius);

  if (!active.length) {
    delete canvas.dataset.pointerIndex;
    delete canvas.dataset.pointerNumber;
    canvas.setAttribute("aria-label", "วงล้อไม่มีหมายเลข");
    const gradient = context.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
    gradient.addColorStop(0, "#153b46");
    gradient.addColorStop(1, "#071b27");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, radius - 2, 0, TAU);
    context.fill();
    context.fillStyle = "#8ba3aa";
    context.textAlign = "center";
    context.font = `700 ${Math.max(13, size * 0.035)}px system-ui`;
    context.fillText("ไม่มีหมายเลขในวงล้อ", 0, radius * 0.7);
    context.restore();
    return;
  }

  const pointerIndex = winnerIndexAtPointer(wheelRotation, active.length);
  canvas.dataset.pointerIndex = String(pointerIndex);
  canvas.dataset.pointerNumber = active[pointerIndex].label;
  canvas.setAttribute(
    "aria-label",
    `วงล้อ ${active.length.toLocaleString("th-TH")} ช่อง เข็มชี้ที่หมายเลข ${active[pointerIndex].label}`,
  );
  context.rotate(wheelRotation);
  const primary = state.settings.primary;
  const secondary = state.settings.secondary;
  const maxRenderedLabels = count > 240 ? 72 : count > 120 ? 90 : count;
  const labelStep = Math.max(1, Math.ceil(count / maxRenderedLabels));
  const showLabels = state.settings.showLabels && count <= 1000;

  for (let index = 0; index < count; index += 1) {
    const start = -Math.PI / 2 + index * arc;
    const end = start + arc + 0.001;
    const alternating = index % 2 === 0;
    const gradient = context.createRadialGradient(0, 0, radius * 0.18, 0, 0, radius);
    gradient.addColorStop(0, alternating ? lighten(primary, 0.11) : darken(primary, 0.06));
    gradient.addColorStop(1, alternating ? darken(primary, 0.09) : lighten(primary, 0.04));
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, radius - 2, start, end);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
    context.strokeStyle = count > 280 ? "rgba(255,255,255,.08)" : state.settings.border;
    context.lineWidth = count > 200 ? 0.35 : 1.1;
    context.stroke();

    const item = active[index];
    const mapped = mappedImages.get(item.label);
    const image = mapped?.complete ? mapped : segmentImage?.complete ? segmentImage : null;
    if (image && (count <= 80 || index % labelStep === 0)) {
      const imageRadius = radius * (state.settings.segmentImageRadius / 100);
      const requestedSize = radius * (state.settings.segmentImageSize / 100);
      const availableArcSize = count <= 12 ? radius * 0.4 : arc * radius * 0.75;
      const imageSize = Math.min(requestedSize, availableArcSize);
      context.save();
      context.rotate(start + arc / 2);
      if (state.settings.segmentImageShape === "circle") {
        context.beginPath();
        context.arc(imageRadius, 0, imageSize / 2, 0, TAU);
        context.clip();
      }
      drawImageFitted(
        image,
        imageRadius - imageSize / 2,
        -imageSize / 2,
        imageSize,
        imageSize,
        state.settings.segmentImageFit,
      );
      context.restore();
    }

    if (showLabels && index % labelStep === 0) {
      context.save();
      context.rotate(start + arc / 2);
      context.translate(radius * (count > 60 ? 0.78 : 0.7), 0);
      if (state.settings.textDirection === "tangent") context.rotate(Math.PI / 2);
      context.fillStyle = state.settings.text;
      context.textAlign = "right";
      context.textBaseline = "middle";
      const adaptive = Math.max(7, Math.min(state.settings.fontSize, (arc * radius * 0.72)));
      context.font = `${state.settings.fontWeight} ${adaptive}px ${state.settings.fontFamily}`;
      context.shadowColor = "rgba(0,0,0,.68)";
      context.shadowBlur = 4;
      const maxWidth = Math.max(24, radius * 0.28);
      const label = item.label.length > 14 ? `${item.label.slice(0, 12)}…` : item.label;
      context.fillText(label, 0, 0, maxWidth);
      context.restore();
    }
  }

  context.beginPath();
  context.arc(0, 0, radius * 0.985, 0, TAU);
  context.strokeStyle = secondary;
  context.lineWidth = 3;
  context.stroke();
  context.restore();
}

function lighten(hex, amount) {
  return adjustHex(hex, Math.round(255 * amount));
}

function darken(hex, amount) {
  return adjustHex(hex, -Math.round(255 * amount));
}

function adjustHex(hex, delta) {
  const clean = hex.replace("#", "");
  return `#${[0, 2, 4]
    .map((offset) =>
      Math.max(0, Math.min(255, parseInt(clean.slice(offset, offset + 2), 16) + delta))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function startDraw() {
  if (spinning || holdingResult || !modal.hidden) return;
  const pool = activeNumbers();
  if (!pool.length) {
    showToast("ไม่มีหมายเลขในวงล้อ กรุณาเพิ่มหรือคืนหมายเลขก่อน", "error");
    return;
  }
  if (pool.length === 1) showToast("เหลือหมายเลขเดียว ระบบจะแสดงผลหมายเลขนั้น");

  const winnerIndex = secureRandomIndex(pool.length);
  const winner = pool[winnerIndex];
  const now = Date.now();
  pendingWinner = {
    id: uid("draw"),
    itemId: winner.id,
    number: winner.label,
    timestamp: now,
    sequence: state.history.length + 1,
  };

  closePanel();
  spinning = true;
  $("#spinButton").disabled = true;
  syncSpinClasses();
  playStartSound();
  updateDashboard();

  const duration = Math.max(1, Number(state.settings.spinDuration) || 7) * 1000;
  const start = performance.now();
  document.body.dataset.spinDurationMs = String(duration);
  const from = wheelRotation;
  const to = targetRotation(from, winnerIndex, pool.length, state.settings.minRotations);
  let previousSegment = -1;
  let animationFrames = 0;

  function animate(time) {
    animationFrames += 1;
    const progress = Math.min(1, (time - start) / duration);
    const eased = spinEaseOut(progress);
    wheelRotation = from + (to - from) * eased;
    drawWheel();
    const segment = winnerIndexAtPointer(wheelRotation, pool.length);
    if (segment !== previousSegment) {
      previousSegment = segment;
      tickPointer();
    }
    if (progress < 1) requestAnimationFrame(animate);
    else {
      wheelRotation = to;
      spinning = false;
      holdingResult = true;
      document.body.dataset.lastSpinElapsedMs = String(Math.round(time - start));
      document.body.dataset.lastSpinFrameCount = String(animationFrames);
      syncSpinClasses();
      updateDashboard();
      const stoppedIndex = winnerIndexAtPointer(wheelRotation, pool.length);
      if (stoppedIndex !== winnerIndex) {
        pendingWinner = null;
        holdingResult = false;
        updateDashboard();
        showToast("ตรวจพบตำแหน่งวงล้อคลาดเคลื่อน ระบบยกเลิกผลเพื่อความปลอดภัย", "error");
        return;
      }
      const delay = Math.max(0, Number(state.settings.resultDelay) || 0) * 1000;
      resultDelayTimer = window.setTimeout(() => {
        resultDelayTimer = 0;
        holdingResult = false;
        updateDashboard();
        playWinnerSound();
        openWinnerModal();
      }, delay);
    }
  }
  requestAnimationFrame(animate);
}

function tickPointer() {
  playTickSound();
}

function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function tone(frequency, duration, volume, delay = 0, type = "sine") {
  if (!state.settings.soundEnabled) return;
  const audio = ensureAudio();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(Math.max(0.0001, volume * (state.settings.volume / 100)), start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function playTickSound() {
  if (state.settings.performanceMode) return;
  tone(720, 0.035, 0.06, 0, "square");
}

function playStartSound() {
  tone(220, 0.14, 0.1, 0, "sine");
  tone(330, 0.18, 0.08, 0.09, "sine");
}

function playWinnerSound() {
  if (!state.settings.soundEnabled) return;
  if (state.assets.winnerSound) {
    if (!customWinnerAudio) customWinnerAudio = new Audio(state.assets.winnerSound);
    customWinnerAudio.volume = state.settings.volume / 100;
    customWinnerAudio.currentTime = 0;
    customWinnerAudio.play().catch(() => {});
    return;
  }
  tone(523.25, 0.55, 0.16, 0, "sine");
  tone(659.25, 0.58, 0.14, 0.11, "sine");
  tone(783.99, 0.75, 0.13, 0.24, "sine");
}

function openWinnerModal() {
  if (!pendingWinner || !modal.hidden) return;
  $("#winnerNumber").textContent = pendingWinner.number;
  $("#winnerSequence").textContent = `ลำดับที่ ${pendingWinner.sequence}`;
  $("#winnerDate").textContent = formatThaiDate(pendingWinner.timestamp);
  $("#winnerNote").textContent = state.settings.removeConfirmed
    ? "หมายเลขจะถูกนำออกจากวงล้อเมื่อกดยืนยัน"
    : "หมายเลขจะยังคงอยู่ในวงล้อและสามารถออกซ้ำได้";
  focusBeforeModal = document.activeElement;
  setModalBackgroundInert(true);
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  $("#confirmWinner").focus();
  if (state.settings.confettiEnabled && !reduceMotion.matches) startConfetti();
}

function closeWinnerModal({ discard = true } = {}) {
  modal.hidden = true;
  setModalBackgroundInert(false);
  document.body.style.overflow = "";
  cancelAnimationFrame(confettiFrame);
  clearConfetti();
  if (discard) pendingWinner = null;
  const focusTarget = focusBeforeModal?.isConnected ? focusBeforeModal : $("#spinButton");
  focusBeforeModal = null;
  focusTarget.focus();
}

function setModalBackgroundInert(inert) {
  for (const element of [$(".topbar"), $("#topbarReveal"), $(".stage-shell"), $("#controlPanel"), $("#panelBackdrop")]) {
    element.inert = inert;
    if (inert) element.setAttribute("aria-hidden", "true");
    else if (element === $("#controlPanel")) {
      element.setAttribute("aria-hidden", element.classList.contains("open") ? "false" : "true");
    } else element.removeAttribute("aria-hidden");
  }
}

function confirmWinner() {
  if (!pendingWinner) return;
  const item = state.numbers.find((number) => number.id === pendingWinner.itemId);
  const removed = Boolean(state.settings.removeConfirmed && item);
  const entry = {
    ...pendingWinner,
    removed,
    projectId: state.projectId,
    sessionId: state.sessionId,
  };
  updateState((draft) => {
    draft.history.push(entry);
    if (removed) item.removed = true;
  });
  closeWinnerModal();
  showToast(`ยืนยันผล ${entry.number} แล้ว`);
}

function undoLatest() {
  if (!state.history.length) {
    showToast("ยังไม่มีผลให้ Undo", "error");
    return;
  }
  const entry = state.history.at(-1);
  updateState((draft) => {
    draft.history.pop();
    if (entry.removed) {
      const item = draft.numbers.find((number) => number.id === entry.itemId);
      if (item) item.removed = false;
    }
  });
  showToast(`Undo ผล ${entry.number} แล้ว`);
}

function startConfetti() {
  if (state.settings.performanceMode) return;
  const confettiCanvas = $("#confettiCanvas");
  const confettiContext = confettiCanvas.getContext("2d");
  confettiCanvas.width = innerWidth * Math.min(devicePixelRatio, 2);
  confettiCanvas.height = innerHeight * Math.min(devicePixelRatio, 2);
  confettiContext.scale(Math.min(devicePixelRatio, 2), Math.min(devicePixelRatio, 2));
  const colors = [state.settings.secondary, state.settings.primary, "#ffffff", "#61ddb1"];
  const count = state.settings.performanceMode ? 40 : 120;
  const particles = Array.from({ length: count }, () => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 3,
    vy: 2 + Math.random() * 4,
    r: 3 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * TAU,
    spin: (Math.random() - 0.5) * 0.22,
  }));
  const started = performance.now();
  function render(time) {
    confettiContext.clearRect(0, 0, innerWidth, innerHeight);
    for (const particle of particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.rotation += particle.spin;
      confettiContext.save();
      confettiContext.translate(particle.x, particle.y);
      confettiContext.rotate(particle.rotation);
      confettiContext.fillStyle = particle.color;
      confettiContext.fillRect(-particle.r, -particle.r / 2, particle.r * 2, particle.r);
      confettiContext.restore();
    }
    if (time - started < 6500 && !modal.hidden) confettiFrame = requestAnimationFrame(render);
  }
  confettiFrame = requestAnimationFrame(render);
}

function clearConfetti() {
  const confettiCanvas = $("#confettiCanvas");
  confettiCanvas.getContext("2d").clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
}

function escapeHTML(value) {
  const template = document.createElement("template");
  template.textContent = String(value);
  return template.innerHTML;
}

function renderNumberList() {
  const query = $("#numberSearch").value.trim().toLocaleLowerCase("th");
  const filtered = state.numbers.filter((item) => item.label.toLocaleLowerCase("th").includes(query));
  const perPage = 30;
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  currentPage = Math.min(currentPage, pages);
  const items = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const list = $("#numberList");
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "ไม่พบรายการ";
    list.append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const row = document.createElement("div");
      row.className = `number-row${item.removed ? " removed" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.numberSelect = item.id;
      checkbox.setAttribute("aria-label", `เลือกหมายเลข ${item.label}`);

      const value = document.createElement("strong");
      value.className = "number-value";
      value.textContent = item.label;

      const badge = document.createElement("span");
      badge.className = "state-badge";
      badge.textContent = item.removed ? "นำออกแล้ว" : "ใช้งาน";

      const action = document.createElement("button");
      action.className = "row-action";
      action.dataset.numberAction = item.removed ? "restore" : "delete";
      action.dataset.numberId = item.id;
      action.type = "button";
      action.disabled = spinning || holdingResult;
      action.setAttribute("aria-label", `${item.removed ? "คืน" : "ลบ"}หมายเลข ${item.label}`);
      action.textContent = item.removed ? "↺" : "×";

      row.append(checkbox, value, badge, action);
      fragment.append(row);
    }
    list.append(fragment);
  }
  $("#listSummary").textContent = `${state.numbers.length.toLocaleString("th-TH")} รายการ • คงเหลือ ${activeNumbers().length.toLocaleString("th-TH")}`;
  $("#pageInfo").textContent = `หน้า ${currentPage} / ${pages}`;
  $("#prevPage").disabled = currentPage <= 1;
  $("#nextPage").disabled = currentPage >= pages;
}

function renderHistory() {
  const query = $("#historySearch").value.trim().toLocaleLowerCase("th");
  let items = state.history.filter((entry) => entry.number.toLocaleLowerCase("th").includes(query));
  if ($("#historySort").value === "newest") items = [...items].reverse();
  $("#historyList").innerHTML = items.length
    ? items
        .map(
          (entry) => `<div class="history-row">
            <span class="history-order">#${entry.sequence}</span>
            <div><strong class="history-value">${escapeHTML(entry.number)}</strong><small>${formatThaiDate(entry.timestamp)} • ${entry.removed ? "นำออกแล้ว" : "คงในวงล้อ"}</small></div>
            <span class="state-badge">${entry.removed ? "REMOVED" : "ACTIVE"}</span>
            <button class="row-action" data-history-delete="${entry.id}" type="button" aria-label="ลบรายการ">×</button>
          </div>`,
        )
        .join("")
    : '<p class="empty-note">ยังไม่มีประวัติการสุ่ม</p>';
  $("#historySummary").textContent = state.history.length
    ? `${state.history.length.toLocaleString("th-TH")} รายการ`
    : "ยังไม่มีรายการ";
}

function renderMappings() {
  const entries = Object.keys(state.assets.segmentMappings ?? {});
  $("#mappingList").innerHTML = entries.length
    ? entries
        .map(
          (number) => `<div class="mapping-item"><span>${escapeHTML(number)}</span><button class="row-action" data-mapping-delete="${escapeHTML(number)}" type="button">ลบ</button></div>`,
        )
        .join("")
    : '<p class="empty-note">ยังไม่มีการจับคู่รูปเฉพาะหมายเลข</p>';
}

function download(filename, content, type = "text/plain;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportNumbers(mode) {
  const rows = [["หมายเลข", "สถานะ"]];
  for (const item of state.numbers) {
    if (mode === "active" && item.removed) continue;
    if (mode === "removed" && !item.removed) continue;
    rows.push([item.label, item.removed ? "นำออกแล้ว" : "ใช้งาน"]);
  }
  download(`lucky-draw-${mode}.csv`, formatCSV(rows), "text/csv;charset=utf-8");
}

function exportHistory() {
  const rows = [["ลำดับ", "หมายเลข", "วันที่เวลา", "สถานะ", "Project ID", "Session ID", "Draw ID"]];
  for (const entry of state.history) {
    rows.push([
      entry.sequence,
      entry.number,
      new Date(entry.timestamp).toISOString(),
      entry.removed ? "นำออกแล้ว" : "คงในวงล้อ",
      entry.projectId,
      entry.sessionId,
      entry.id,
    ]);
  }
  download("lucky-draw-history.csv", formatCSV(rows), "text/csv;charset=utf-8");
}

async function readFileAsDataURL(file, { audio = false } = {}) {
  const limit = audio ? 12 * 1024 * 1024 : 8 * 1024 * 1024;
  if (file.size > limit) throw new Error(`ไฟล์มีขนาดเกิน ${audio ? 12 : 8} MB`);
  const extension = file.name.split(".").pop()?.toLowerCase();
  const inferredType = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
  }[extension];
  const fileType = file.type || inferredType || "";
  if (!audio && !["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(fileType)) {
    throw new Error("รองรับเฉพาะ PNG, JPEG, WebP และ SVG");
  }
  if (fileType === "image/svg+xml") {
    const text = await file.text();
    if (!isSafeSvg(text)) {
      throw new Error("ไฟล์ SVG มีเนื้อหาที่ไม่ปลอดภัย");
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

async function handleAssetUpload(input, asset, options = {}) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const data = await readFileAsDataURL(file, options);
    updateState((draft) => {
      draft.assets[asset] = data;
    });
    if (asset === "winnerSound") customWinnerAudio = null;
    if (["segmentImage", "logo", "pointer"].includes(asset)) loadSegmentAssets();
    showToast(`อัปโหลด ${file.name} แล้ว`);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    input.value = "";
  }
}

function openPanel(tab = null) {
  $("#controlPanel").classList.add("open");
  $("#panelBackdrop").classList.add("open");
  $("#controlPanel").setAttribute("aria-hidden", "false");
  if (tab) switchTab(tab);
}

function closePanel() {
  $("#controlPanel").classList.remove("open");
  $("#panelBackdrop").classList.remove("open");
  $("#controlPanel").setAttribute("aria-hidden", "true");
}

function switchTab(name) {
  $$(".tab-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
  $$(".tab-page").forEach((page) => page.classList.toggle("active", page.dataset.page === name));
}

function setStageMode(enabled) {
  $("#app").classList.toggle("stage-mode", enabled);
  closePanel();
  setTimeout(resizeCanvas, 40);
  showToast(enabled ? "เปิดโหมดเวทีแล้ว • กด S เพื่อออก" : "ออกจากโหมดเวทีแล้ว");
}

async function toggleFullscreen() {
  const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
  if (fullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit) throw new Error("Fullscreen exit is unavailable");
    await exit.call(document);
    return;
  }
  const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
  if (!request) throw new Error("Fullscreen is unavailable");
  await request.call(document.documentElement);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand?.("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy is unavailable");
}

function bindControls() {
  $("#spinButton").addEventListener("click", startDraw);
  $("#panelToggle").addEventListener("click", () => openPanel());
  $("#panelClose").addEventListener("click", closePanel);
  $("#panelBackdrop").addEventListener("click", closePanel);
  $("#stageModeButton").addEventListener("click", () => setStageMode(true));
  $$(".tab-button").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  $$("[data-open-tab]").forEach((button) =>
    button.addEventListener("click", () => openPanel(button.dataset.openTab)),
  );

  $("#fullscreenButton").addEventListener("click", async () => {
    try {
      await toggleFullscreen();
    } catch {
      showToast("Browser นี้ไม่อนุญาต Fullscreen", "error");
    }
  });

  $("#soundToggle").addEventListener("click", () =>
    updateState((draft) => {
      draft.settings.soundEnabled = !draft.settings.soundEnabled;
    }, { redraw: false, controls: true }),
  );

  $("#generateNumbers").addEventListener("click", () => {
    if (spinning) return;
    try {
      const entries = generateRange({
        start: $("#rangeStart").value,
        end: $("#rangeEnd").value,
        digits: $("#rangeDigits").value,
        prefix: $("#rangePrefix").value,
        suffix: $("#rangeSuffix").value,
      });
      if (!confirm(`แทนที่รายการปัจจุบันด้วย ${entries.length.toLocaleString("th-TH")} หมายเลขหรือไม่?`)) return;
      updateState((draft) => {
        draft.numbers = entries.map((label) => ({ id: uid("num"), label, removed: false }));
        draft.history = [];
      });
      showToast(`สร้างหมายเลข ${entries.length.toLocaleString("th-TH")} รายการแล้ว`);
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  $("#bulkNumbers").addEventListener("input", () => {
    const entries = parseEntries($("#bulkNumbers").value);
    const { duplicates } = dedupeEntries(entries);
    $("#parseFeedback").textContent = `${entries.length} รายการ${duplicates.length ? ` • ซ้ำ ${duplicates.length}` : ""}`;
  });

  $("#addNumbers").addEventListener("click", () => {
    if (spinning) return;
    const input = parseEntries($("#bulkNumbers").value);
    if (!input.length) return showToast("กรุณากรอกหมายเลขอย่างน้อย 1 รายการ", "error");
    const existing = new Set(state.numbers.map((item) => item.label));
    const { accepted, duplicates } = dedupeEntries(input, state.settings.allowDuplicates);
    const toAdd = state.settings.allowDuplicates ? accepted : accepted.filter((label) => !existing.has(label));
    const skipped = duplicates.length + accepted.length - toAdd.length;
    if (state.numbers.length + toAdd.length > 1000) {
      return showToast("จำนวนรวมต้องไม่เกิน 1,000 หมายเลข", "error");
    }
    updateState((draft) => {
      draft.numbers.push(...toAdd.map((label) => ({ id: uid("num"), label, removed: false })));
    });
    $("#bulkNumbers").value = "";
    $("#parseFeedback").textContent = skipped ? `เพิ่มแล้ว ${toAdd.length} • ข้ามรายการซ้ำ ${skipped}` : `เพิ่มแล้ว ${toAdd.length} รายการ`;
    showToast(`เพิ่ม ${toAdd.length} รายการแล้ว${skipped ? ` ข้ามซ้ำ ${skipped}` : ""}`);
  });

  $("#allowDuplicates").addEventListener("change", (event) =>
    updateState((draft) => {
      draft.settings.allowDuplicates = event.target.checked;
    }, { redraw: false }),
  );

  $("#numberSearch").addEventListener("input", () => {
    currentPage = 1;
    renderNumberList();
  });
  $("#prevPage").addEventListener("click", () => {
    currentPage -= 1;
    renderNumberList();
  });
  $("#nextPage").addEventListener("click", () => {
    currentPage += 1;
    renderNumberList();
  });
  $("#numberList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-number-action]");
    if (!button || spinning || holdingResult) return;
    updateState((draft) => {
      const item = draft.numbers.find((number) => number.id === button.dataset.numberId);
      if (!item) return;
      if (button.dataset.numberAction === "restore") item.removed = false;
      else draft.numbers = draft.numbers.filter((number) => number.id !== item.id);
    });
  });
  $("#deleteSelected").addEventListener("click", () => {
    if (spinning || holdingResult) return;
    const selected = new Set($$("[data-number-select]:checked").map((input) => input.dataset.numberSelect));
    if (!selected.size) return showToast("ยังไม่ได้เลือกรายการ", "error");
    if (!confirm(`ลบ ${selected.size} รายการหรือไม่?`)) return;
    updateState((draft) => {
      draft.numbers = draft.numbers.filter((item) => !selected.has(item.id));
    });
  });
  $("#restoreAll").addEventListener("click", () =>
    updateState((draft) => draft.numbers.forEach((item) => (item.removed = false))),
  );
  $("#resetNumbers").addEventListener("click", () => {
    if (!confirm("รีเซ็ตเป็นหมายเลข 001–100 และล้างประวัติหรือไม่?")) return;
    updateState((draft) => {
      draft.numbers = defaultNumbers();
      draft.history = [];
    });
  });
  $("#exportAll").addEventListener("click", () => exportNumbers("all"));
  $("#exportActive").addEventListener("click", () => exportNumbers("active"));
  $("#exportRemoved").addEventListener("click", () => exportNumbers("removed"));

  $("#numberImport").addEventListener("change", async (event) => {
    if (spinning) return;
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      const delimiter = detectDelimiter(text);
      const rows = parseDelimitedText(text, delimiter);
      if (!rows.length) throw new Error("ไฟล์ไม่มีข้อมูล");
      let column = 0;
      const columns = rows[0];
      if (columns.length > 1) {
        const answer = prompt(
          `พบ ${columns.length} คอลัมน์: ${columns.map((value, index) => `${index + 1}=${value}`).join(", ")}\nกรอกหมายเลขคอลัมน์ที่ต้องการ`,
          "1",
        );
        if (answer === null) return;
        column = Math.max(0, Math.min(columns.length - 1, Number(answer) - 1 || 0));
      }
      const hasHeader = confirm(`แถวแรก "${columns[column]}" เป็น Header และควรข้ามหรือไม่?`);
      const entries = rows.slice(hasHeader ? 1 : 0).map((row) => row[column]?.trim()).filter(Boolean);
      const { accepted } = dedupeEntries(entries, state.settings.allowDuplicates);
      if (accepted.length > 1000) throw new Error("ไฟล์มีรายการเกิน 1,000 หมายเลข");
      updateState((draft) => {
        draft.numbers = accepted.map((label) => ({ id: uid("num"), label, removed: false }));
        draft.history = [];
      });
      showToast(`นำเข้า ${accepted.length} รายการแล้ว`);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      event.target.value = "";
    }
  });

  const appearanceBindings = {
    campaignTitleInput: ["campaignTitle", "text"],
    campaignSubtitleInput: ["campaignSubtitle", "text"],
    topbarEyebrowInput: ["topbarEyebrow", "text"],
    topbarStatusInput: ["topbarStatus", "text"],
    stageKickerInput: ["stageKicker", "text"],
    stageTitleInput: ["stageTitle", "text"],
    stageDescriptionInput: ["stageDescription", "text"],
    topbarVisible: ["topbarVisible", "checked"],
    topbarLogoSize: ["topbarLogoSize", "number"],
    stageHeadingVisible: ["stageHeadingVisible", "checked"],
    scoreboardVisible: ["scoreboardVisible", "checked"],
    nextDrawVisible: ["nextDrawVisible", "checked"],
    primaryColor: ["primary", "color"],
    secondaryColor: ["secondary", "color"],
    borderColor: ["border", "color"],
    textColor: ["text", "color"],
    glowColor: ["glow", "color"],
    fontFamily: ["fontFamily", "setting"],
    fontWeight: ["fontWeight", "number"],
    fontSize: ["fontSize", "number"],
    textDirection: ["textDirection", "setting"],
    showLabels: ["showLabels", "checked"],
    spinDuration: ["spinDuration", "number"],
    resultDelay: ["resultDelay", "number"],
    minRotations: ["minRotations", "number"],
    pointerStrength: ["pointerStrength", "number"],
    pointerShakeEnabled: ["pointerShakeEnabled", "checked"],
    removeConfirmed: ["removeConfirmed", "checked"],
    motionBlur: ["motionBlur", "checked"],
    escapeCloses: ["escapeCloses", "checked"],
    soundEnabled: ["soundEnabled", "checked"],
    volume: ["volume", "number"],
    confettiEnabled: ["confettiEnabled", "checked"],
    glowEnabled: ["glowEnabled", "checked"],
    performanceMode: ["performanceMode", "checked"],
    backgroundFit: ["backgroundFit", "setting"],
    backgroundPosition: ["backgroundPosition", "setting"],
    backgroundScale: ["backgroundScale", "number"],
    backgroundX: ["backgroundX", "number"],
    backgroundY: ["backgroundY", "number"],
    overlayDarkness: ["overlayDarkness", "number"],
    backgroundBlur: ["backgroundBlur", "number"],
    logoSize: ["logoSize", "number"],
    logoImageSize: ["logoImageSize", "number"],
    logoImageX: ["logoImageX", "number"],
    logoImageY: ["logoImageY", "number"],
    logoBackgroundTransparent: ["logoBackgroundTransparent", "checked"],
    pointerSize: ["pointerSize", "number"],
    pointerOffset: ["pointerOffset", "number"],
    pointerX: ["pointerX", "number"],
    pointerRotation: ["pointerRotation", "number"],
    segmentImageFit: ["segmentImageFit", "setting"],
    segmentImageShape: ["segmentImageShape", "setting"],
    segmentImageSize: ["segmentImageSize", "number"],
    segmentImageRadius: ["segmentImageRadius", "number"],
  };
  for (const [id, [key, kind]] of Object.entries(appearanceBindings)) {
    const element = $(`#${id}`);
    const eventName = element.type === "range" || element.type === "color" ? "input" : "change";
    if (kind === "text") element.addEventListener("input", onSetting);
    else element.addEventListener(eventName, onSetting);
    function onSetting(event) {
      updateState(
        (draft) => {
          const value =
            kind === "checked" ? event.target.checked : kind === "number" ? Number(event.target.value) : event.target.value;
          if (kind === "text") draft[key] = value;
          else draft.settings[key] = value;
          if (key === "backgroundScale") draft.settings.backgroundFit = "custom";
          if (["backgroundX", "backgroundY"].includes(key)) draft.settings.backgroundPosition = "custom";
        },
        {
          redraw: ![
            "volume",
            "soundEnabled",
            "confettiEnabled",
            "escapeCloses",
            "topbarVisible",
            "topbarLogoSize",
            "stageHeadingVisible",
            "scoreboardVisible",
            "nextDrawVisible",
            "resultDelay",
            "pointerShakeEnabled",
            "logoBackgroundTransparent",
            "backgroundFit",
            "backgroundPosition",
            "backgroundScale",
            "backgroundX",
            "backgroundY",
            "overlayDarkness",
            "backgroundBlur",
            "logoImageSize",
            "logoImageX",
            "logoImageY",
            "pointerX",
            "pointerRotation",
          ].includes(key),
        },
      );
      if (key === "backgroundScale") $("#backgroundFit").value = "custom";
      if (["backgroundX", "backgroundY"].includes(key)) $("#backgroundPosition").value = "custom";
      updateOutputs();
      if (["logoSize", "pointerSize", "pointerOffset", "scoreboardVisible", "stageHeadingVisible"].includes(key)) {
        setTimeout(resizeCanvas, 40);
      }
    }
  }

  $$(".palette").forEach((button) =>
    button.addEventListener("click", () => {
      const name = button.dataset.palette;
      updateState(
        (draft) => {
          draft.settings.palette = name;
          Object.assign(draft.settings, palettes[name]);
        },
        { controls: true },
      );
    }),
  );

  $("#backgroundUpload").addEventListener("change", (event) => handleAssetUpload(event.target, "background"));
  $("#topbarLogoUpload").addEventListener("change", (event) => handleAssetUpload(event.target, "topbarLogo"));
  $("#logoUpload").addEventListener("change", (event) => handleAssetUpload(event.target, "logo"));
  $("#pointerUpload").addEventListener("change", (event) => handleAssetUpload(event.target, "pointer"));
  $("#segmentImageUpload").addEventListener("change", (event) => handleAssetUpload(event.target, "segmentImage"));
  $("#winnerSoundUpload").addEventListener("change", (event) =>
    handleAssetUpload(event.target, "winnerSound", { audio: true }),
  );
  $("#previewSound").addEventListener("click", playWinnerSound);
  $("#hideTopbarButton").addEventListener("click", () => {
    updateState(
      (draft) => {
        draft.settings.topbarVisible = false;
      },
      { redraw: false, controls: true },
    );
    $("#topbarReveal").focus();
  });
  $("#topbarReveal").addEventListener("click", () => {
    updateState(
      (draft) => {
        draft.settings.topbarVisible = true;
      },
      { redraw: false, controls: true },
    );
    $("#hideTopbarButton").focus();
  });

  $$(".danger-outline[data-remove-asset]").forEach((button) =>
    button.addEventListener("click", () => {
      const asset = button.dataset.removeAsset;
      updateState((draft) => {
        draft.assets[asset] = null;
      });
      if (asset === "winnerSound") customWinnerAudio = null;
      loadSegmentAssets();
    }),
  );

  $("#mappingImageUpload").addEventListener("change", async (event) => {
    const number = $("#mappingNumber").value.trim();
    const file = event.target.files?.[0];
    if (!number || !file) return showToast("กรุณาระบุหมายเลขและเลือกรูป", "error");
    if (!state.numbers.some((item) => item.label === number)) return showToast("ไม่พบหมายเลขนี้ในรายการ", "error");
    try {
      const data = await readFileAsDataURL(file);
      updateState((draft) => {
        draft.assets.segmentMappings[number] = data;
      });
      $("#mappingNumber").value = "";
      loadSegmentAssets();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      event.target.value = "";
    }
  });
  $("#mappingList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-mapping-delete]");
    if (!button) return;
    updateState((draft) => {
      delete draft.assets.segmentMappings[button.dataset.mappingDelete];
    });
    loadSegmentAssets();
  });

  $("#historySearch").addEventListener("input", renderHistory);
  $("#historySort").addEventListener("change", renderHistory);
  $("#exportHistory").addEventListener("click", exportHistory);
  $("#undoLatest").addEventListener("click", undoLatest);
  $("#historyList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-delete]");
    if (!button || !confirm("ลบรายการประวัตินี้หรือไม่?")) return;
    updateState((draft) => {
      draft.history = draft.history.filter((entry) => entry.id !== button.dataset.historyDelete);
      draft.history.forEach((entry, index) => (entry.sequence = index + 1));
    });
  });
  $("#clearHistory").addEventListener("click", () => {
    if (!state.history.length) return;
    if (!confirm("ต้องการล้างประวัติทั้งหมดหรือไม่?")) return;
    if (!confirm("ยืนยันอีกครั้ง: ประวัติทั้งหมดจะถูกลบ แต่หมายเลขในวงล้อจะไม่เปลี่ยน")) return;
    updateState((draft) => {
      draft.history = [];
    });
  });

  $("#confirmWinner").addEventListener("click", confirmWinner);
  $("#redrawWinner").addEventListener("click", () => {
    closeWinnerModal();
    showToast("ยกเลิกผลแล้ว พร้อมสุ่มใหม่");
  });
  $("#closeWinner").addEventListener("click", () => closeWinnerModal());
  $("#copyWinner").addEventListener("click", async () => {
    try {
      await copyText(pendingWinner?.number ?? "");
      showToast("คัดลอกหมายเลขแล้ว");
    } catch {
      showToast("คัดลอกไม่สำเร็จ กรุณาเลือกหมายเลขด้วยตนเอง", "error");
    }
  });

  $("#exportProject").addEventListener("click", () => {
    const exportData = { ...state, exportedAt: new Date().toISOString(), format: "lucky-draw-wheel" };
    download("worldcup-lucky-draw.wheel.json", JSON.stringify(exportData, null, 2), "application/json");
  });
  $("#importProject").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("ไฟล์โปรเจกต์มีขนาดเกิน 30 MB");
      const imported = validateProjectPayload(JSON.parse(await file.text()));
      state = mergeState(imported);
      customWinnerAudio = null;
      applyStateToControls();
      loadSegmentAssets();
      applyVisualSettings();
      updateDashboard();
      renderNumberList();
      renderHistory();
      resizeCanvas();
      scheduleSave();
      showToast("โหลดโปรเจกต์เรียบร้อยแล้ว");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      event.target.value = "";
    }
  });
  $("#resetProject").addEventListener("click", async () => {
    if (!confirm("รีเซ็ตโปรเจกต์และลบข้อมูลที่บันทึกใน Browser เครื่องนี้หรือไม่?")) return;
    if (!confirm("ยืนยันอีกครั้ง: การตั้งค่า รูปภาพ และประวัติทั้งหมดจะถูกลบ")) return;
    await clearProject();
    state = defaultState();
    customWinnerAudio = null;
    applyStateToControls();
    loadSegmentAssets();
    applyVisualSettings();
    updateDashboard();
    renderNumberList();
    renderHistory();
    resizeCanvas();
    scheduleSave();
  });

  document.addEventListener("keydown", (event) => {
    const editable = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if (!modal.hidden && event.key === "Tab") {
      const focusable = $$("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])", modal)
        .filter((element) => !element.hidden && element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
      } else {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (!modal.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (event.code === "Space" && !editable) {
      event.preventDefault();
      if (modal.hidden) startDraw();
    }
    if (event.key.toLowerCase() === "f" && !editable && modal.hidden) $("#fullscreenButton").click();
    if (event.key.toLowerCase() === "s" && !editable && modal.hidden) {
      setStageMode(!$("#app").classList.contains("stage-mode"));
    }
    if (event.key === "Escape" && !modal.hidden && state.settings.escapeCloses) closeWinnerModal();
  });
}

function mergeState(saved) {
  const fresh = defaultState();
  return {
    ...fresh,
    ...saved,
    projectId: saved.projectId || fresh.projectId,
    sessionId: uid("session"),
    numbers: Array.isArray(saved.numbers) ? saved.numbers.slice(0, 1000) : fresh.numbers,
    history: Array.isArray(saved.history) ? saved.history : [],
    settings: { ...fresh.settings, ...(saved.settings ?? {}) },
    assets: {
      ...fresh.assets,
      ...(saved.assets ?? {}),
      segmentMappings: { ...(saved.assets?.segmentMappings ?? {}) },
    },
  };
}

async function initialize() {
  try {
    const saved = await loadProject();
    if (saved) state = mergeState(saved);
  } catch {
    showToast("เริ่มโปรเจกต์ใหม่ เนื่องจากอ่านข้อมูลเดิมไม่ได้", "error");
  }
  applyStateToControls();
  loadSegmentAssets();
  applyVisualSettings();
  updateDashboard();
  renderNumberList();
  renderHistory();
  renderMappings();
  bindControls();
  wheelResizeObserver = new ResizeObserver(resizeCanvas);
  wheelResizeObserver.observe(wheelFrame);
  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener(
    "pagehide",
    () => {
      wheelResizeObserver?.disconnect();
      cancelAnimationFrame(confettiFrame);
      clearTimeout(resultDelayTimer);
      audioContext?.close().catch(() => {});
    },
    { once: true },
  );
  resizeCanvas();
}

if (!window.__luckyDrawBooted) {
  window.__luckyDrawBooted = true;
  initialize();
}
