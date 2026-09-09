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

function optionMarkup(key, poll, compact = false) {
  const stats = pollStats(poll);
  const isGold = key === "gold";
  const label = isGold ? poll.option_gold : poll.option_property;
  const votes = isGold ? stats.gold : stats.property;
  const percent = isGold ? stats.goldPercent : stats.propertyPercent;
  return html`<article class="poll-option poll-option--${key} ${compact ? "poll-option--compact" : ""}" data-screen="${key}">
    <div class="screen-background" aria-hidden="true"></div><div class="screen-grain" aria-hidden="true"></div>
    <img class="screen-artwork" alt="" hidden />
    <div class="option-content">
      <p class="option-kicker">ผลสำรวจความคิดเห็น</p><h2 class="option-name">${escapeHtml(label)}</h2>
      <div class="option-result"><strong class="animated-number option-percent" data-value="${percent}" data-format="percent">${formatPercent(percent)}</strong><span>%</span></div>
      <div class="option-meter" aria-label="${formatPercent(percent)} เปอร์เซ็นต์"><i style="width:${percent}%"></i></div>
      <p class="option-votes"><strong class="animated-number" data-value="${votes}" data-format="number">${formatNumber(votes)}</strong> คะแนน</p>
    </div><span class="option-index">${isGold ? "01" : "02"}</span>
  </article>`;
}

export function contentForScreen(poll, physicalType, phase = "results") {
  if (phase === "question") return "question";
  if (phase === "summary") return "total";
  const position = physicalType === "combined" ? "center" : physicalType === "gold" ? "left" : "right";
  const fallback = position === "center" ? "combined" : position === "left" ? "gold" : "property";
  return poll.presentation?.screenAssignments?.[position] || fallback;
}

function resultsMarkup(content, poll) {
  const stats = pollStats(poll);
  if (content === "combined") return optionMarkup("gold", poll, true) + optionMarkup("property", poll, true);
  if (content === "gold" || content === "property") return optionMarkup(content, poll);
  if (content === "question") return html`<article class="question-stage">
    <p>THAIRATH POLL · คำถามวันนี้</p><h2>${escapeHtml(poll.question)}</h2>
    <span>ร่วมแสดงความคิดเห็นของคุณ</span><i aria-hidden="true"></i>
  </article>`;
  return html`<article class="total-stage">
    <p>ผลโหวตทั้งหมด</p><div><strong class="animated-number" data-value="${stats.total}" data-format="number">${formatNumber(stats.total)}</strong><span>คะแนน</span></div>
    <small>${escapeHtml(poll.option_gold)} · ${formatPercent(stats.goldPercent)}% &nbsp;&nbsp; ${escapeHtml(poll.option_property)} · ${formatPercent(stats.propertyPercent)}%</small>
  </article>`;
}

export function displayMarkup(poll, physicalType = "combined", { preview = false, phase = "results" } = {}) {
  const stats = pollStats(poll);
  const content = contentForScreen(poll, physicalType, phase);
  const isPhysicalCenter = physicalType === "combined";
  return html`<main class="display-shell display-shell--${physicalType} display-content--${content} ${preview ? "is-preview" : ""}" data-content="${content}" data-phase="${phase}">
    <header class="display-header">${brandMarkup(!isPhysicalCenter)}<p class="display-question">${escapeHtml(poll.question)}</p></header>
    <section class="display-results ${content === "combined" ? "display-results--combined" : "display-results--single"}">${resultsMarkup(content, poll)}</section>
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
  setFont(presentation);
  root.style.setProperty("--poll-font", `'${presentation.font.name.replace(/["']/g, "")}', 'Noto Sans Thai', sans-serif`);
  root.style.setProperty("--color-gold", presentation.colors.gold);
  root.style.setProperty("--color-center", presentation.colors.center);
  root.style.setProperty("--color-property", presentation.colors.property);
  root.style.setProperty("--color-chrome", presentation.colors.chrome);
  root.style.setProperty("--color-text-primary", presentation.colors.textPrimary);
  root.style.setProperty("--color-text-secondary", presentation.colors.textSecondary);
  root.style.setProperty("--brand-logo-size", `${presentation.branding.logoSize}px`);
  for (const key of ["question", "asset", "percent", "votes", "secondary"]) {
    root.style.setProperty(`--font-${key}`, `${presentation.font[key]}px`);
  }
  root.querySelectorAll("[data-screen]").forEach((screen) => {
    const config = presentation.screens[screen.dataset.screen];
    const background = screen.querySelector(".screen-background");
    background.style.backgroundColor = presentation.colors[screen.dataset.screen];
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
    customLogo.hidden = !hasCustomLogo;
    defaultLogo.hidden = hasCustomLogo;
    if (hasCustomLogo && customLogo.src !== presentation.branding.logoUrl) customLogo.src = presentation.branding.logoUrl;
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
  if (rebuild || !currentContent || currentContent !== nextContent) {
    const status = root.querySelector(".connection-indicator")?.dataset.status;
    root.innerHTML = displayMarkup(poll, physicalType, { phase });
    applyDisplayPresentation(root, poll);
    if (status) setConnectionStatus(root, status);
    return;
  }
  const stats = pollStats(poll);
  root.querySelector(".display-shell").dataset.phase = phase;
  root.querySelector(".display-question").textContent = poll.question;
  const questionStage = root.querySelector(".question-stage h2");
  if (questionStage) questionStage.textContent = poll.question;
  root.querySelector(".updated-copy time").textContent = formatThaiDate(poll.updated_at);
  root.querySelectorAll(".display-footer .animated-number, .total-stage .animated-number").forEach((element) => animateValue(element, stats.total));
  root.querySelectorAll("[data-screen]").forEach((screen) => {
    const isGold = screen.dataset.screen === "gold";
    const percent = isGold ? stats.goldPercent : stats.propertyPercent;
    const votes = isGold ? stats.gold : stats.property;
    screen.querySelector(".option-name").textContent = isGold ? poll.option_gold : poll.option_property;
    animateValue(screen.querySelector('[data-format="percent"]'), percent);
    animateValue(screen.querySelector('[data-format="number"]'), votes);
    screen.querySelector(".option-meter i").style.width = `${percent}%`;
  });
  applyDisplayPresentation(root, poll);
}

export function renderPreview(root, poll, physicalType, phase = "results") {
  root.innerHTML = displayMarkup(poll, physicalType, { preview: true, phase });
  applyDisplayPresentation(root, poll);
}
