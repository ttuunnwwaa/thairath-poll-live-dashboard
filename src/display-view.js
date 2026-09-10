import { DEFAULT_PRESENTATION } from "./defaults.js";
import { formatNumber, formatPercent, formatThaiDate, normalizeFontUrl, pollStats } from "./poll-core.js";

const html = String.raw;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function brandMarkup(compact = false) {
  return html`<div class="poll-brand ${compact ? "poll-brand--compact" : ""}">
    <span class="brand-identity"><span class="brand-default-logo"><span class="brand-leaf" aria-hidden="true"></span><span class="brand-th">ไทยรัฐ</span></span><img class="brand-custom-logo" alt="โลโก้" hidden /></span>
    <span class="brand-divider"></span><span class="brand-poll">POLL</span>
    <span class="live-label"><i></i> LIVE</span>
  </div>`;
}

function optionMarkup(option, poll, index, compact = false, surfaceKey = null) {
  const stats = pollStats(poll);
  const result = stats.options.find((item) => item.id === option.id) || stats.options[index];
  const variant = surfaceKey || (index === 0 ? "gold" : index === 1 ? "property" : "custom");
  const screenAttribute = ["gold", "property"].includes(surfaceKey) ? `data-screen="${surfaceKey}"` : "";
  return html`<article class="poll-option poll-option--${variant} ${compact ? "poll-option--compact" : ""}" data-option-id="${escapeHtml(option.id)}" ${screenAttribute} style="--option-color:${escapeHtml(option.color)}">
    <div class="screen-background" aria-hidden="true"></div><div class="screen-grain" aria-hidden="true"></div>
    <img class="screen-artwork" alt="" hidden />
    <div class="option-content">
      <p class="option-kicker">ผลสำรวจความคิดเห็น</p><h2 class="option-name">${escapeHtml(option.label)}</h2>
      <div class="option-result"><strong class="animated-number option-percent" data-value="${result.percent}" data-format="percent">${formatPercent(result.percent)}</strong><span>%</span></div>
      <div class="option-meter" aria-label="${formatPercent(result.percent)} เปอร์เซ็นต์"><i style="width:${result.percent}%"></i></div>
      <p class="option-votes"><strong class="animated-number" data-value="${result.votes}" data-format="number">${formatNumber(result.votes)}</strong> คะแนน</p>
    </div><span class="option-index">${String(index + 1).padStart(2, "0")}</span>
  </article>`;
}

export function contentForScreen(poll, physicalType, phase = "results") {
  if (phase === "question") return "question";
  if (phase === "summary") return "total";
  const position = physicalType === "combined" ? "center" : physicalType === "gold" ? "left" : "right";
  const fallback = position === "center" ? "combined" : position === "left" ? "gold" : "property";
  return poll.presentation?.screenAssignments?.[position] || fallback;
}

export function optionIdsForContent(content, poll) {
  const validIds = new Set(poll.options.map((option) => option.id));
  let candidates = [];
  if (content === "combined") candidates = poll.options.map((option) => option.id);
  else if (content === "gold") candidates = [poll.options[0]?.id];
  else if (content === "property") candidates = [poll.options[1]?.id];
  else if (content?.startsWith("option:")) candidates = [content.slice(7)];
  else if (content?.startsWith("options:")) candidates = content.slice(8).split(",");
  return [...new Set(candidates)].filter((id) => id && validIds.has(id));
}

export function optionContentForIds(ids, poll) {
  const validIds = new Set(poll.options.map((option) => option.id));
  const selectedIds = [...new Set(ids)].filter((id) => validIds.has(id));
  if (selectedIds.length === 1) return `option:${selectedIds[0]}`;
  if (selectedIds.length > 1) return `options:${selectedIds.join(",")}`;
  return "";
}

function resultsMarkup(content, poll, physicalType) {
  const stats = pollStats(poll);
  if (content === "question") return html`<article class="question-stage">
    <p>THAIRATH POLL · คำถามวันนี้</p><h2>${escapeHtml(poll.question)}</h2>
    <span>ร่วมแสดงความคิดเห็นของคุณ</span><i aria-hidden="true"></i>
  </article>`;
  const optionIds = optionIdsForContent(content, poll);
  if (optionIds.length) {
    const surfaceKey = physicalType === "gold" ? "gold" : physicalType === "property" ? "property" : null;
    const compact = content === "combined" || optionIds.length > 1;
    return optionIds.map((optionId) => {
      const index = poll.options.findIndex((option) => option.id === optionId);
      return optionMarkup(poll.options[index], poll, index, compact, surfaceKey);
    }).join("");
  }
  return html`<article class="total-stage">
    <p>ผลโหวตทั้งหมด</p><div><strong class="animated-number" data-value="${stats.total}" data-format="number">${formatNumber(stats.total)}</strong><span>คะแนน</span></div>
    <small>${stats.options.map((option) => `${escapeHtml(option.label)} · ${formatPercent(option.percent)}%`).join(" &nbsp;&nbsp; ")}</small>
  </article>`;
}

export function displayMarkup(poll, physicalType = "combined", { preview = false, phase = "results" } = {}) {
  const stats = pollStats(poll);
  const content = contentForScreen(poll, physicalType, phase);
  const isPhysicalCenter = physicalType === "combined";
  const displayedOptionIds = optionIdsForContent(content, poll);
  const optionCount = displayedOptionIds.length;
  const isMultiple = content === "combined" || content.startsWith("options:");
  const contentClass = content.startsWith("options:") ? "multiple" : content;
  const optionGridClass = isMultiple ? `option-grid--${optionCount}` : "";
  return html`<main class="display-shell display-shell--${physicalType} display-content--${contentClass} ${preview ? "is-preview" : ""}" data-content="${content}" data-phase="${phase}">
    <header class="display-header">${brandMarkup(!isPhysicalCenter)}<p class="display-question">${escapeHtml(poll.question)}</p></header>
    <section class="display-results ${isMultiple ? "display-results--multiple" : "display-results--single"} ${optionCount > 2 ? "has-many-options" : ""} ${optionGridClass} result-count--${optionCount}" data-option-count="${optionCount}">${resultsMarkup(content, poll, physicalType)}</section>
    <footer class="display-footer">
      <div><span>ยอดโหวตรวม</span><strong class="animated-number" data-value="${stats.total}" data-format="number">${formatNumber(stats.total)}</strong><small>คะแนน</small></div>
      <div class="updated-copy"><span>อัปเดตล่าสุด</span><time>${formatThaiDate(poll.updated_at)}</time></div>
    </footer>
    ${preview ? "" : '<button class="fullscreen-control" type="button" aria-label="เปิดเต็มจอ" title="เปิดเต็มจอ">⛶</button>'}
    ${preview ? "" : '<div class="connection-indicator" data-status="loading"><i></i><span>กำลังเชื่อมต่อข้อมูลล่าสุด</span></div>'}
  </main>`;
}

function setFont(presentation) {
  let link = document.getElementById("poll-google-font");
  if (!link) {
    link = document.createElement("link");
    link.id = "poll-google-font";
    link.rel = "stylesheet";
    document.head.append(link);
  }
  const url = /^https:\/\//i.test(presentation.font.url)
    ? presentation.font.url
    : normalizeFontUrl(presentation.font.url, presentation.font.name);
  if (link.href !== url) link.href = url;
}

export function applyDisplayPresentation(root, poll) {
  const { presentation } = poll;
  const primaryOptionColor = poll.options[0]?.color || presentation.colors.gold;
  const secondaryOptionColor = poll.options[1]?.color || presentation.colors.property;
  setFont(presentation);
  root.style.setProperty("--poll-font", `'${presentation.font.name.replace(/["']/g, "")}', 'Noto Sans Thai', sans-serif`);
  root.style.setProperty("--color-gold", primaryOptionColor);
  root.style.setProperty("--color-center", presentation.colors.center);
  root.style.setProperty("--color-property", secondaryOptionColor);
  root.style.setProperty("--color-chrome", presentation.colors.chrome);
  root.style.setProperty("--color-text-primary", presentation.colors.textPrimary);
  root.style.setProperty("--color-text-secondary", presentation.colors.textSecondary);
  root.style.setProperty("--brand-logo-size", `${presentation.branding.logoSize}px`);
  root.style.setProperty("--animation-duration", `${Math.round(750 / presentation.animation.speed)}ms`);
  for (const key of ["question", "asset", "percent", "votes", "secondary"]) {
    root.style.setProperty(`--font-${key}`, `${presentation.font[key]}px`);
  }
  root.querySelectorAll("[data-option-id]").forEach((screen) => {
    const displayedOption = poll.options.find((option) => option.id === screen.dataset.optionId);
    if (!displayedOption) return;
    const legacyConfig = screen.dataset.screen
      ? presentation.screens[screen.dataset.screen]
      : DEFAULT_PRESENTATION.screens.gold;
    const config = displayedOption.visual || legacyConfig;
    const background = screen.querySelector(".screen-background");
    background.style.backgroundColor = displayedOption.color;
    background.style.backgroundImage = config.backgroundUrl ? `url("${config.backgroundUrl.replace(/["\\]/g, "")}")` : "";
    background.style.backgroundSize = config.backgroundScale === 100 ? config.backgroundFit : `${config.backgroundScale}% auto`;
    background.style.backgroundPosition = `${config.backgroundX}% ${config.backgroundY}%`;
    background.style.backgroundRepeat = "no-repeat";
    const artwork = screen.querySelector(".screen-artwork");
    artwork.hidden = !config.artworkUrl;
    if (config.artworkUrl) artwork.src = config.artworkUrl;
    artwork.style.width = `${config.artworkSize}%`;
    artwork.style.left = `${config.artworkX}%`;
    artwork.style.top = `${config.artworkY}%`;
  });
  root.querySelectorAll(".poll-brand").forEach((brand) => {
    brand.classList.toggle("is-logo-hidden", !presentation.branding.showLogo);
    const customLogo = brand.querySelector(".brand-custom-logo");
    const defaultLogo = brand.querySelector(".brand-default-logo");
    const hasCustomLogo = Boolean(presentation.branding.logoUrl);
    const showDefaultLogo = () => {
      customLogo.hidden = true;
      defaultLogo.hidden = false;
    };
    if (!hasCustomLogo) {
      customLogo.removeAttribute("src");
      showDefaultLogo();
      return;
    }
    customLogo.onload = () => {
      customLogo.hidden = false;
      defaultLogo.hidden = true;
    };
    customLogo.onerror = showDefaultLogo;
    customLogo.hidden = false;
    defaultLogo.hidden = true;
    if (customLogo.getAttribute("src") !== presentation.branding.logoUrl) {
      customLogo.src = presentation.branding.logoUrl;
    } else if (customLogo.complete && customLogo.naturalWidth === 0) {
      showDefaultLogo();
    }
  });
}

function animateValue(element, nextValue, duration = 650) {
  if (!element) return;
  const previous = Number(element.dataset.current ?? element.dataset.value ?? 0);
  const target = Number(nextValue) || 0;
  element.dataset.current = String(target);
  const format = element.dataset.format === "percent" ? formatPercent : formatNumber;
  if (Math.abs(previous - target) < .001 || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = format(target);
    return;
  }
  const start = performance.now();
  const frame = (now) => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = format(previous + (target - previous) * eased);
    if (progress < 1 && Number(element.dataset.current) === target) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function setConnectionStatus(root, status) {
  const indicator = root.querySelector(".connection-indicator");
  if (!indicator) return;
  indicator.dataset.status = status;
  indicator.querySelector("span").textContent = status === "connected"
    ? "ข้อมูลล่าสุด" : status === "demo" ? "โหมดตัวอย่างในเครื่อง" : "กำลังเชื่อมต่อข้อมูลล่าสุด";
}

export function updateDisplay(root, poll, physicalType = "combined", { rebuild = false, phase = "results" } = {}) {
  const currentContent = root.querySelector(".display-shell")?.dataset.content;
  const nextContent = contentForScreen(poll, physicalType, phase);
  const renderedOptionIds = [...root.querySelectorAll("[data-option-id]")].map((element) => element.dataset.optionId);
  const nextOptionIds = optionIdsForContent(nextContent, poll);
  const optionStructureChanged = JSON.stringify(renderedOptionIds) !== JSON.stringify(nextOptionIds);
  if (rebuild || !currentContent || currentContent !== nextContent || optionStructureChanged) {
    const status = root.querySelector(".connection-indicator")?.dataset.status;
    root.innerHTML = displayMarkup(poll, physicalType, { phase });
    applyDisplayPresentation(root, poll);
    if (status) setConnectionStatus(root, status);
    return;
  }
  const stats = pollStats(poll);
  const animationDuration = Math.round(650 / poll.presentation.animation.speed);
  // Apply visual and motion variables before changing values so this update uses
  // the newly selected animation speed immediately.
  applyDisplayPresentation(root, poll);
  root.querySelector(".display-shell").dataset.phase = phase;
  root.querySelector(".display-question").textContent = poll.question;
  const questionStage = root.querySelector(".question-stage h2");
  if (questionStage) questionStage.textContent = poll.question;
  root.querySelector(".updated-copy time").textContent = formatThaiDate(poll.updated_at);
  root.querySelectorAll(".display-footer .animated-number, .total-stage .animated-number").forEach((element) => animateValue(element, stats.total, animationDuration));
  root.querySelectorAll("[data-option-id]").forEach((screen) => {
    const option = stats.options.find((item) => item.id === screen.dataset.optionId);
    if (!option) return;
    screen.querySelector(".option-name").textContent = option.label;
    animateValue(screen.querySelector('[data-format="percent"]'), option.percent, animationDuration);
    animateValue(screen.querySelector('[data-format="number"]'), option.votes, animationDuration);
    screen.querySelector(".option-meter i").style.width = `${option.percent}%`;
  });
}

export function renderPreview(root, poll, physicalType, phase = "results") {
  root.innerHTML = displayMarkup(poll, physicalType, { preview: true, phase });
  applyDisplayPresentation(root, poll);
}
