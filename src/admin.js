import { DEFAULT_PRESENTATION, clone, defaultPoll } from "./defaults.js";
import {
  authCallbackError,
  authCallbackType,
  fetchHistory,
  fetchPoll,
  getCachedPoll,
  getSession,
  isConfigured,
  onAuthChange,
  restoreHistory,
  savePoll,
  signIn,
  signOut,
  updatePassword,
  uploadPollAsset,
} from "./data-service.js";
import { renderPreview } from "./display-view.js";
import { formatNumber, formatPercent, formatThaiDate, normalizePoll, pollStats, validatePoll } from "./poll-core.js";

const html = String.raw;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function toast(message, type = "success") {
  const region = document.getElementById("toast-region");
  const item = document.createElement("div");
  item.className = `toast toast--${type}`;
  item.textContent = message;
  region.append(item);
  setTimeout(() => item.remove(), 4200);
}

function baseLink(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}

function loginMarkup(message = "") {
  return html`<main class="auth-page">
    <section class="auth-card">
      <div class="auth-brand"><span class="brand-leaf"></span><strong>ไทยรัฐ</strong><i></i><b>POLL</b></div>
      <p class="section-kicker">ADMIN CONTROL ROOM</p>
      <h1>เข้าสู่ระบบผู้ดูแล</h1>
      <p>จัดการคะแนนและภาพบนจอทั้งหมดจากที่เดียว</p>
      ${message ? `<div class="form-alert">${escapeHtml(message)}</div>` : ""}
      <form id="login-form">
        ${isConfigured ? html`
          <label>อีเมลผู้ดูแล<input name="email" type="email" autocomplete="username" required placeholder="admin@example.com" /></label>
          <label>รหัสผ่าน<input name="password" type="password" autocomplete="current-password" required placeholder="••••••••" /></label>
          <button class="button button--primary button--wide" type="submit">เข้าสู่ระบบ</button>
        ` : html`
          <div class="setup-notice"><strong>โหมดตัวอย่างในเครื่อง</strong><span>ยังไม่พบค่า Supabase ในไฟล์ <code>.env</code> ข้อมูลจะบันทึกในเบราว์เซอร์นี้เท่านั้น</span></div>
          <button class="button button--primary button--wide" type="submit">เปิดหน้าผู้ดูแลแบบตัวอย่าง</button>
        `}
      </form>
      <a class="back-link" href="${baseLink("display")}">← ไปหน้าจอแสดงผล</a>
    </section>
  </main>`;
}

function passwordSetupMarkup(user, message = "") {
  return html`<main class="auth-page">
    <section class="auth-card">
      <div class="auth-brand"><span class="brand-leaf"></span><strong>ไทยรัฐ</strong><i></i><b>POLL</b></div>
      <p class="section-kicker">ADMIN INVITATION</p>
      <h1>ตั้งรหัสผ่านผู้ดูแล</h1>
      <p>บัญชี ${escapeHtml(user?.email || "")} ได้รับสิทธิ์ Admin แล้ว</p>
      ${message ? `<div class="form-alert">${escapeHtml(message)}</div>` : ""}
      <form id="password-setup-form">
        <label>รหัสผ่านใหม่<input name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="อย่างน้อย 8 ตัวอักษร" /></label>
        <label>ยืนยันรหัสผ่าน<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required placeholder="กรอกรหัสผ่านอีกครั้ง" /></label>
        <button class="button button--primary button--wide" type="submit">ตั้งรหัสผ่านและเข้าสู่ระบบ</button>
      </form>
      <p class="auth-footnote">ลิงก์คำเชิญใช้ได้ครั้งเดียว หากหมดอายุให้ผู้ดูแลส่งคำเชิญใหม่</p>
    </section>
  </main>`;
}

const modeCards = html`
  <label class="mode-card"><input type="radio" name="displayMode" value="combined"><span class="mode-icon mode-icon--combined"><i></i><i></i></span><b>หน้าจอปกติ</b><small>แสดง 2 ตัวเลือกในหน้าเดียว</small></label>
  <label class="mode-card"><input type="radio" name="displayMode" value="dual"><span class="mode-icon mode-icon--dual"><i></i><i></i></span><b>โหมดจอคู่</b><small>แยกสินทรัพย์ไปคนละจอ</small></label>
  <label class="mode-card"><input type="radio" name="displayMode" value="fullscreen"><span class="mode-icon mode-icon--full"><i></i></span><b>โหมดเต็มจอ</b><small>พื้นที่แนวตั้ง 512 × 896 px</small></label>`;

const screenContentOptions = [
  ["question", "คำถามอย่างเดียว"],
  ["combined", "ผลรวมสองตัวเลือก"],
  ["gold", "ทองคำพร้อมผลโพล"],
  ["property", "อสังหาริมทรัพย์พร้อมผลโพล"],
  ["total", "ยอดโหวตรวม"],
];

function screenContentSelect(position, label, size, value) {
  const options = screenContentOptions.map(([key, text]) => `<option value="${key}" ${value === key ? "selected" : ""}>${text}</option>`).join("");
  return html`<label class="screen-map-item"><span><i class="screen-shape screen-shape--${position}"></i><b>${label}</b><small>${size}</small></span><select data-path="presentation.screenAssignments.${position}">${options}</select></label>`;
}

function rangeField(label, path, min, max, value, unit = "px") {
  return html`<label class="range-field"><span>${label}<output data-output="${path}">${value}${unit}</output></span><input type="range" min="${min}" max="${max}" value="${value}" data-path="${path}" /></label>`;
}

function colorField(label, key, value, detail) {
  const path = `presentation.colors.${key}`;
  return html`<label class="color-field">
    <span>${label}<small>${detail}</small></span>
    <div><input type="color" data-path="${path}" value="${value}" aria-label="เลือก${label}" /><input class="color-hex" data-color-text="${path}" value="${value.toUpperCase()}" maxlength="7" spellcheck="false" aria-label="ค่าสี ${label}" /></div>
  </label>`;
}

function screenEditor(key, title, config) {
  return html`<article class="screen-editor" data-editor-screen="${key}">
    <div class="card-title"><div><span class="asset-dot asset-dot--${key}"></span><h3>${title}</h3></div><span>512 × 896</span></div>
    <div class="subsection">
      <h4>ภาพพื้นหลัง</h4>
      <label>URL ภาพ<input type="url" data-path="presentation.screens.${key}.backgroundUrl" value="${escapeHtml(config.backgroundUrl)}" placeholder="https://…" /></label>
      <label class="file-drop"><input type="file" accept="image/*" data-upload="background" data-screen="${key}" /><span>↑</span><b>อัปโหลดภาพพื้นหลัง</b><small>PNG, JPG หรือ WebP ไม่เกิน 8 MB</small></label>
      <div class="two-columns">
        <label>การครอบภาพ<select data-path="presentation.screens.${key}.backgroundFit"><option value="cover" ${config.backgroundFit === "cover" ? "selected" : ""}>เต็มพื้นที่ (Cover)</option><option value="contain" ${config.backgroundFit === "contain" ? "selected" : ""}>เห็นภาพครบ (Contain)</option></select></label>
        ${rangeField("ขนาดภาพ", `presentation.screens.${key}.backgroundScale`, 50, 200, config.backgroundScale, "%")}
      </div>
      <div class="two-columns">
        ${rangeField("ตำแหน่งแนวนอน", `presentation.screens.${key}.backgroundX`, 0, 100, config.backgroundX, "%")}
        ${rangeField("ตำแหน่งแนวตั้ง", `presentation.screens.${key}.backgroundY`, 0, 100, config.backgroundY, "%")}
      </div>
    </div>
    <div class="subsection">
      <h4>โลโก้หรือภาพประกอบ</h4>
      <label>URL ภาพ<input type="url" data-path="presentation.screens.${key}.artworkUrl" value="${escapeHtml(config.artworkUrl)}" placeholder="https://…" /></label>
      <label class="file-drop file-drop--small"><input type="file" accept="image/*" data-upload="artwork" data-screen="${key}" /><span>＋</span><b>อัปโหลดรูปประกอบ</b></label>
      ${rangeField("ขนาดรูป", `presentation.screens.${key}.artworkSize`, 10, 100, config.artworkSize, "%")}
      <div class="two-columns">
        ${rangeField("ตำแหน่งแนวนอน", `presentation.screens.${key}.artworkX`, 0, 100, config.artworkX, "%")}
        ${rangeField("ตำแหน่งแนวตั้ง", `presentation.screens.${key}.artworkY`, 0, 100, config.artworkY, "%")}
      </div>
    </div>
  </article>`;
}

function adminMarkup(poll, user) {
  const stats = pollStats(poll);
  const presentation = poll.presentation;
  return html`<main class="admin-page">
    <header class="admin-topbar">
      <div class="admin-brand"><span class="brand-leaf"></span><strong>ไทยรัฐ</strong><i></i><b>POLL</b><em>ADMIN</em></div>
      <div class="admin-status"><span class="connection-chip ${isConfigured ? "is-live" : "is-demo"}"><i></i>${isConfigured ? "เชื่อมต่อ Supabase" : "โหมดตัวอย่าง"}</span><span class="admin-user">${escapeHtml(user?.email || "Demo Admin")}</span><button class="icon-button" id="logout-button" type="button" title="ออกจากระบบ">↗</button></div>
    </header>
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <div><p>CONTROL ROOM</p><h1>จัดการโพล</h1></div>
        <nav><a class="active" href="#poll-section"><span>01</span>ข้อมูลโพล</a><a href="#display-section"><span>02</span>โหมดแสดงผล</a><a href="#design-section"><span>03</span>ปรับหน้าตา</a><a href="#history-section"><span>04</span>ประวัติ</a></nav>
        <div class="sidebar-links"><span>เปิดหน้าจอ</span><a href="${baseLink("display")}" target="_blank">จอรวม ↗</a><a href="${baseLink("display/gold")}" target="_blank">จอทองคำ ↗</a><a href="${baseLink("display/property")}" target="_blank">จออสังหาฯ ↗</a></div>
      </aside>
      <form class="admin-content" id="poll-form">
        <section class="admin-section" id="poll-section">
          <div class="section-heading"><div><p class="section-kicker">POLL CONTENT</p><h2>ข้อมูลและคะแนน</h2><span>แก้ไขข้อความและจำนวนคะแนนที่แสดงบนทุกจอ</span></div><div class="updated-badge"><span>อัปเดตล่าสุด</span><time id="admin-updated-time">${formatThaiDate(poll.updated_at)}</time></div></div>
          <div class="editor-grid">
            <article class="panel-card poll-editor-card">
              <label>คำถามโพล<textarea data-path="question" rows="3" maxlength="240">${escapeHtml(poll.question)}</textarea><small><span id="question-count">${poll.question.length}</span>/240 ตัวอักษร</small></label>
              <div class="option-input option-input--gold"><span class="option-number">01</span><div><label>ชื่อตัวเลือก<input data-path="option_gold" maxlength="80" value="${escapeHtml(poll.option_gold)}" /></label><label>จำนวนคะแนน<input data-path="votes_gold" type="number" inputmode="numeric" min="0" step="1" value="${poll.votes_gold}" /></label></div></div>
              <div class="option-input option-input--property"><span class="option-number">02</span><div><label>ชื่อตัวเลือก<input data-path="option_property" maxlength="80" value="${escapeHtml(poll.option_property)}" /></label><label>จำนวนคะแนน<input data-path="votes_property" type="number" inputmode="numeric" min="0" step="1" value="${poll.votes_property}" /></label></div></div>
            </article>
            <article class="panel-card summary-card">
              <p class="section-kicker">LIVE CALCULATION</p><h3>สรุปผลอัตโนมัติ</h3>
              <div class="summary-total"><span>ยอดโหวตรวม</span><strong id="summary-total">${formatNumber(stats.total)}</strong><small>คะแนน</small></div>
              <div class="summary-row summary-row--gold"><div><i></i><span id="summary-label-gold">${escapeHtml(poll.option_gold)}</span></div><strong><span id="summary-percent-gold">${formatPercent(stats.goldPercent)}</span>%</strong></div>
              <div class="summary-meter"><i id="summary-meter-gold" style="width:${stats.goldPercent}%"></i></div>
              <div class="summary-row summary-row--property"><div><i></i><span id="summary-label-property">${escapeHtml(poll.option_property)}</span></div><strong><span id="summary-percent-property">${formatPercent(stats.propertyPercent)}</span>%</strong></div>
              <div class="summary-meter summary-meter--property"><i id="summary-meter-property" style="width:${stats.propertyPercent}%"></i></div>
            </article>
          </div>
        </section>

        <section class="admin-section" id="display-section">
          <div class="section-heading"><div><p class="section-kicker">OUTPUT MODE</p><h2>โหมดการแสดงผล</h2><span>เลือกวิธีจัดจอสำหรับงาน โดยทุกโหมดใช้ข้อมูลชุดเดียวกัน</span></div></div>
          <div class="mode-grid">${modeCards}</div>
          <article class="screen-mapping-card">
            <div class="mapping-heading"><div><h3>กำหนดเนื้อหาแต่ละจอ</h3><span>เปลี่ยนได้อิสระโดยไม่ต้องสลับ URL ที่ตั้งไว้กับ LED processor</span></div><div class="mapping-presets"><button type="button" data-screen-preset="results">ผลโพล 3 จอ</button><button type="button" data-screen-preset="question">จอกลางเป็นคำถาม</button><button type="button" data-screen-preset="total">จอกลางเป็นยอดรวม</button></div></div>
            <div class="screen-map-grid">
              ${screenContentSelect("left", "จอซ้าย", "512 × 896", presentation.screenAssignments.left)}
              ${screenContentSelect("center", "จอกลาง", "1530 × 896", presentation.screenAssignments.center)}
              ${screenContentSelect("right", "จอขวา", "512 × 896", presentation.screenAssignments.right)}
            </div>
          </article>
          <div class="preview-heading"><div><h3>ตัวอย่างสดทั้ง 3 จอ</h3><span>แสดงตาม Screen Mapping และเปลี่ยนทันทีขณะปรับข้อมูล</span></div><div class="preview-tabs"><button type="button" data-preview-tab="combined" class="active">จอกลาง</button><button type="button" data-preview-tab="gold">จอซ้าย</button><button type="button" data-preview-tab="property">จอขวา</button></div></div>
          <div class="preview-stage" data-active-preview="combined">
            <div class="preview-wrap preview-wrap--combined" data-preview="combined"><div id="preview-combined"></div></div>
            <div class="preview-wrap preview-wrap--portrait" data-preview="gold"><div id="preview-gold"></div></div>
            <div class="preview-wrap preview-wrap--portrait" data-preview="property"><div id="preview-property"></div></div>
          </div>
        </section>

        <section class="admin-section" id="design-section">
          <div class="section-heading"><div><p class="section-kicker">VISUAL CONTROL</p><h2>ปรับหน้าตาโดยไม่แก้โค้ด</h2><span>ภาพและตำแหน่งตั้งค่าแยกกันสำหรับแต่ละจอ</span></div><button class="button button--ghost" id="reset-layout" type="button">↺ Reset การจัดวาง</button></div>
          <article class="panel-card font-editor">
            <div class="card-title"><div><span class="font-icon">Aa</span><h3>ฟอนต์และขนาดตัวอักษร</h3></div><span>Google Fonts</span></div>
            <div class="font-source-grid"><label>ชื่อฟอนต์<input data-path="presentation.font.name" value="${escapeHtml(presentation.font.name)}" placeholder="Noto Sans Thai" /></label><label>Google Fonts URL หรือชื่อฟอนต์<input data-path="presentation.font.url" value="${escapeHtml(presentation.font.url)}" placeholder="https://fonts.googleapis.com/…" /></label></div>
            <div class="font-ranges">${rangeField("คำถาม", "presentation.font.question", 24, 96, presentation.font.question)}${rangeField("ชื่อสินทรัพย์", "presentation.font.asset", 20, 72, presentation.font.asset)}${rangeField("เปอร์เซ็นต์", "presentation.font.percent", 48, 180, presentation.font.percent)}${rangeField("จำนวนโหวต", "presentation.font.votes", 14, 48, presentation.font.votes)}${rangeField("ข้อความรอง", "presentation.font.secondary", 12, 36, presentation.font.secondary)}</div>
          </article>
          <article class="panel-card color-editor">
            <div class="card-title"><div><span class="color-icon">◐</span><h3>สีพื้นหลังของเนื้อหา</h3></div><span>แสดงใต้ภาพพื้นหลัง</span></div>
            <div class="color-grid">
              ${colorField("ทองคำ", "gold", presentation.colors.gold, "ผลโพลตัวเลือกทองคำ")}
              ${colorField("จอกลาง", "center", presentation.colors.center, "คำถามและยอดโหวตรวม")}
              ${colorField("อสังหาริมทรัพย์", "property", presentation.colors.property, "ผลโพลตัวเลือกอสังหาฯ")}
            </div>
            <p class="color-help">หากใส่ภาพพื้นหลัง สีนี้จะเป็นสีรองด้านหลังภาพ โดยเฉพาะเมื่อเลือกการครอบภาพแบบ Contain</p>
          </article>
          <div class="screen-editor-grid">${screenEditor("gold", "จอทองคำ", presentation.screens.gold)}${screenEditor("property", "จออสังหาริมทรัพย์", presentation.screens.property)}</div>
        </section>

        <section class="admin-section" id="history-section">
          <div class="section-heading"><div><p class="section-kicker">AUDIT LOG</p><h2>ประวัติการแก้ไข</h2><span>แสดงค่าเดิมและค่าใหม่ พร้อมคืนค่าก่อนแก้ไขได้ในคลิกเดียว</span></div><button class="button button--ghost" id="refresh-history" type="button">↻ โหลดใหม่</button></div>
          <div class="history-list" id="history-list"><div class="history-empty">กำลังโหลดประวัติ…</div></div>
        </section>
        <div class="save-bar"><div><span id="dirty-indicator"><i></i> ยังไม่มีการเปลี่ยนแปลง</span><small>ทุกหน้าจอจะอัปเดตทันทีหลังบันทึก</small></div><button class="button button--primary" id="save-button" type="submit">บันทึกและเผยแพร่ <span>→</span></button></div>
      </form>
    </div>
  </main>`;
}

function setDeep(target, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const parent = keys.reduce((object, key) => object[key], target);
  parent[last] = value;
}

function historyMarkup(history) {
  if (!history.length) return '<div class="history-empty">ยังไม่มีประวัติการแก้ไข</div>';
  return history.map((entry) => {
    const oldPoll = normalizePoll(entry.old_data || defaultPoll());
    const nextPoll = normalizePoll(entry.new_data || defaultPoll());
    const oldStats = pollStats(oldPoll);
    const nextStats = pollStats(nextPoll);
    return html`<article class="history-item">
      <div class="history-meta"><span class="history-dot"></span><div><strong>${formatThaiDate(entry.changed_at)}</strong><small>${escapeHtml(entry.changed_by_email || "Admin")}</small></div></div>
      <div class="history-change"><div><span>ค่าเดิม</span><p>${escapeHtml(oldPoll.question)}</p><small>${escapeHtml(oldPoll.option_gold)} ${formatNumber(oldStats.gold)} · ${escapeHtml(oldPoll.option_property)} ${formatNumber(oldStats.property)}</small></div><b>→</b><div><span>ค่าใหม่</span><p>${escapeHtml(nextPoll.question)}</p><small>${escapeHtml(nextPoll.option_gold)} ${formatNumber(nextStats.gold)} · ${escapeHtml(nextPoll.option_property)} ${formatNumber(nextStats.property)}</small></div></div>
      <button class="button button--restore" type="button" data-restore-id="${entry.id}">↺ คืนค่าเดิม</button>
    </article>`;
  }).join("");
}

export async function renderAdmin(root) {
  let passwordSetupPending = ["invite", "recovery"].includes(authCallbackType);
  let session = await getSession().catch(() => null);
  root.innerHTML = loginMarkup();

  const showLogin = (message = "") => {
    root.innerHTML = loginMarkup(message);
    const form = root.querySelector("#login-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button");
      button.disabled = true;
      button.textContent = "กำลังเข้าสู่ระบบ…";
      try {
        const formData = new FormData(form);
        const result = await signIn(formData.get("email"), formData.get("password"));
        await showDashboard(result.user || result.session?.user || { email: "Demo Admin" });
      } catch (error) {
        showLogin(error.message === "Invalid login credentials" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : error.message);
      }
    });
  };

  const showDashboard = async (user, initialDraft = null, startDirty = false) => {
    if (isConfigured && user?.app_metadata?.role !== "admin") {
      showLogin("บัญชีนี้ยังไม่มีสิทธิ์ Admin โปรดตั้งค่า app_metadata.role เป็น admin ตาม README");
      return;
    }
    let saved = initialDraft ? normalizePoll(initialDraft) : getCachedPoll();
    if (!initialDraft) {
      try { saved = await fetchPoll(); } catch { toast("ใช้ข้อมูลล่าสุดจากเบราว์เซอร์ชั่วคราว", "warning"); }
    }
    let draft = normalizePoll(saved);
    let history = [];
    let dirty = startDirty;
    root.innerHTML = adminMarkup(draft, user);
    if (dirty) {
      const indicator = root.querySelector("#dirty-indicator");
      indicator.classList.add("is-dirty");
      indicator.innerHTML = "<i></i> มีการเปลี่ยนแปลงที่ยังไม่บันทึก";
    }

    const updateSummary = () => {
      const stats = pollStats(draft);
      root.querySelector("#summary-total").textContent = formatNumber(stats.total);
      root.querySelector("#summary-label-gold").textContent = draft.option_gold;
      root.querySelector("#summary-label-property").textContent = draft.option_property;
      root.querySelector("#summary-percent-gold").textContent = formatPercent(stats.goldPercent);
      root.querySelector("#summary-percent-property").textContent = formatPercent(stats.propertyPercent);
      root.querySelector("#summary-meter-gold").style.width = `${stats.goldPercent}%`;
      root.querySelector("#summary-meter-property").style.width = `${stats.propertyPercent}%`;
      root.querySelector("#question-count").textContent = draft.question.length;
    };

    const updatePreviews = () => {
      renderPreview(root.querySelector("#preview-combined"), draft, "combined");
      renderPreview(root.querySelector("#preview-gold"), draft, "gold");
      renderPreview(root.querySelector("#preview-property"), draft, "property");
    };

    const markDirty = () => {
      dirty = true;
      const indicator = root.querySelector("#dirty-indicator");
      indicator.classList.add("is-dirty");
      indicator.innerHTML = "<i></i> มีการเปลี่ยนแปลงที่ยังไม่บันทึก";
    };

    const loadHistory = async () => {
      const list = root.querySelector("#history-list");
      list.innerHTML = '<div class="history-empty">กำลังโหลดประวัติ…</div>';
      try {
        history = await fetchHistory(20);
        list.innerHTML = historyMarkup(history);
      } catch (error) {
        list.innerHTML = `<div class="history-empty">โหลดประวัติไม่สำเร็จ: ${escapeHtml(error.message)}</div>`;
      }
    };

    root.querySelectorAll('[name="displayMode"]').forEach((input) => {
      input.checked = input.value === draft.presentation.displayMode;
    });
    updateSummary();
    updatePreviews();
    loadHistory();

    const applyDraftValue = (path, value, input = null) => {
      setDeep(draft, path, value);
      const output = root.querySelector(`[data-output="${path}"]`);
      if (output && input) output.textContent = `${input.value}${path.includes("font.") ? "px" : "%"}`;
      if (input?.type === "color") {
        const textInput = root.querySelector(`[data-color-text="${path}"]`);
        if (textInput) textInput.value = input.value.toUpperCase();
      }
      updateSummary();
      updatePreviews();
      markDirty();
    };

    root.querySelectorAll("[data-path]").forEach((input) => {
      const listener = () => {
        const path = input.dataset.path;
        const value = input.type === "number" || input.type === "range" ? Number(input.value) : input.value;
        applyDraftValue(path, value, input);
      };
      input.addEventListener(input.type === "range" ? "input" : "input", listener);
      if (input.tagName === "SELECT") input.addEventListener("change", listener);
    });

    root.querySelectorAll("[data-color-text]").forEach((input) => input.addEventListener("input", () => {
      const value = input.value.trim();
      const valid = /^#[0-9a-f]{6}$/i.test(value);
      input.setCustomValidity(valid || !value ? "" : "กรุณากรอกสีรูปแบบ #RRGGBB");
      if (!valid) return;
      const path = input.dataset.colorText;
      const normalized = value.toLowerCase();
      const picker = root.querySelector(`input[type="color"][data-path="${path}"]`);
      if (picker) picker.value = normalized;
      applyDraftValue(path, normalized);
    }));

    root.querySelectorAll('[name="displayMode"]').forEach((input) => input.addEventListener("change", () => {
      draft.presentation.displayMode = input.value;
      markDirty();
    }));

    root.querySelectorAll("[data-screen-preset]").forEach((button) => button.addEventListener("click", () => {
      const preset = button.dataset.screenPreset;
      draft.presentation.screenAssignments = {
        left: "gold",
        center: preset === "question" ? "question" : preset === "total" ? "total" : "combined",
        right: "property",
      };
      for (const [position, value] of Object.entries(draft.presentation.screenAssignments)) {
        root.querySelector(`[data-path="presentation.screenAssignments.${position}"]`).value = value;
      }
      updatePreviews();
      markDirty();
      toast("เปลี่ยนรูปแบบเนื้อหา 3 จอแล้ว กรุณาตรวจตัวอย่างและกดบันทึก");
    }));

    root.querySelectorAll("[data-preview-tab]").forEach((button) => button.addEventListener("click", () => {
      root.querySelectorAll("[data-preview-tab]").forEach((item) => item.classList.toggle("active", item === button));
      root.querySelector(".preview-stage").dataset.activePreview = button.dataset.previewTab;
    }));

    root.querySelectorAll("[data-upload]").forEach((input) => input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const label = input.closest(".file-drop");
      label.classList.add("is-loading");
      try {
        const url = await uploadPollAsset(file, input.dataset.screen, input.dataset.upload);
        const field = input.dataset.upload === "background" ? "backgroundUrl" : "artworkUrl";
        draft.presentation.screens[input.dataset.screen][field] = url;
        const urlInput = root.querySelector(`[data-path="presentation.screens.${input.dataset.screen}.${field}"]`);
        urlInput.value = url;
        updatePreviews();
        markDirty();
        toast("อัปโหลดรูปเรียบร้อย");
      } catch (error) { toast(error.message, "error"); }
      finally { label.classList.remove("is-loading"); input.value = ""; }
    }));

    root.querySelector("#reset-layout").addEventListener("click", () => {
      const currentMode = draft.presentation.displayMode;
      draft.presentation = clone(DEFAULT_PRESENTATION);
      draft.presentation.displayMode = currentMode;
      showDashboard(user, draft, true).then(() => toast("คืนค่าการจัดวางเริ่มต้นแล้ว กรุณากดบันทึก"));
    });

    root.querySelector("#poll-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = root.querySelector("#save-button");
      try {
        validatePoll(draft);
        button.disabled = true;
        button.innerHTML = "กำลังบันทึก…";
        saved = await savePoll(draft, user?.email || "Demo Admin");
        draft = normalizePoll(saved);
        dirty = false;
        root.querySelector("#admin-updated-time").textContent = formatThaiDate(saved.updated_at);
        const indicator = root.querySelector("#dirty-indicator");
        indicator.classList.remove("is-dirty");
        indicator.innerHTML = "<i></i> บันทึกและเผยแพร่แล้ว";
        updatePreviews();
        await loadHistory();
        toast("บันทึกแล้ว ทุกหน้าจอกำลังอัปเดต");
      } catch (error) { toast(error.message, "error"); }
      finally { button.disabled = false; button.innerHTML = "บันทึกและเผยแพร่ <span>→</span>"; }
    });

    root.querySelector("#history-list").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-restore-id]");
      if (!button) return;
      const entry = history.find((item) => String(item.id) === button.dataset.restoreId);
      if (!entry) return;
      button.disabled = true;
      try {
        saved = await restoreHistory(entry, user?.email || "Demo Admin");
        toast("คืนค่าข้อมูลเดิมและเผยแพร่แล้ว");
        await showDashboard(user);
      } catch (error) { toast(error.message, "error"); button.disabled = false; }
    });
    root.querySelector("#refresh-history").addEventListener("click", loadHistory);
    root.querySelector("#logout-button").addEventListener("click", async () => { await signOut(); showLogin(); });

    window.onbeforeunload = () => dirty ? "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" : undefined;
  };

  const showPasswordSetup = (user, message = "") => {
    root.innerHTML = passwordSetupMarkup(user, message);
    const form = root.querySelector("#password-setup-form");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const password = String(formData.get("password") || "");
      const confirmPassword = String(formData.get("confirmPassword") || "");
      if (password.length < 8) return showPasswordSetup(user, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      if (password !== confirmPassword) return showPasswordSetup(user, "รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      const button = form.querySelector("button");
      button.disabled = true;
      button.textContent = "กำลังตั้งรหัสผ่าน…";
      try {
        passwordSetupPending = false;
        const result = await updatePassword(password);
        history.replaceState(null, "", baseLink("admin"));
        await showDashboard(result.user || user);
        toast("ตั้งรหัสผ่านเรียบร้อยแล้ว");
      } catch (error) {
        passwordSetupPending = true;
        showPasswordSetup(user, error.message);
      }
    });
  };

  if (authCallbackError) showLogin(authCallbackError === "otp_expired" ? "ลิงก์คำเชิญหมดอายุหรือถูกใช้ไปแล้ว โปรดขอคำเชิญใหม่" : "ลิงก์คำเชิญไม่ถูกต้อง โปรดขอคำเชิญใหม่");
  else if (session?.user && passwordSetupPending) showPasswordSetup(session.user);
  else if (session?.user) await showDashboard(session.user);
  else showLogin();
  return onAuthChange((nextSession, event) => {
    if (nextSession && (event === "PASSWORD_RECOVERY" || passwordSetupPending)) {
      showPasswordSetup(nextSession.user);
      return;
    }
    if (!nextSession && isConfigured) showLogin();
  });
}
