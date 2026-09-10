import { DEFAULT_OPTION_COLORS, DEFAULT_PRESENTATION, MAX_POLL_OPTIONS, POLL_IDS, clone, defaultPoll } from "./defaults.js";
import {
  authCallbackError,
  authCallbackType,
  fetchBroadcastState,
  fetchHistory,
  fetchPolls,
  getCachedBroadcastState,
  getCachedPoll,
  getSession,
  isConfigured,
  onAuthChange,
  restoreHistory,
  savePoll,
  setBroadcastState,
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
    <section class="auth-card auth-card--login">
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
      <div class="auth-display-picker">
        <span>เปิดหน้าจอแสดงผล</span>
        <div>
          <a href="${baseLink("display")}"><small>DISPLAY 01</small><strong>จอกลาง</strong><em>1530 × 896</em></a>
          <a href="${baseLink("display/gold")}"><small>DISPLAY 02</small><strong>จอซ้าย</strong><em>512 × 896</em></a>
          <a href="${baseLink("display/property")}"><small>DISPLAY 03</small><strong>จอขวา</strong><em>512 × 896</em></a>
        </div>
      </div>
      <a class="back-link" href="${baseLink("")}">← กลับหน้าเลือกทั้งหมด</a>
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

function screenContentSelect(position, label, size, value, poll) {
  const contentOptions = [
    ["question", "คำถามอย่างเดียว"],
    ["combined", "ผลรวมทุกตัวเลือก"],
    ...poll.options.map((option, index) => [index === 0 ? "gold" : index === 1 ? "property" : `option:${option.id}`, `${option.label} พร้อมผลโพล`]),
    ["total", "ยอดโหวตรวม"],
  ];
  const options = contentOptions.map(([key, text]) => `<option value="${key}" ${value === key ? "selected" : ""}>${escapeHtml(text)}</option>`).join("");
  return html`<label class="screen-map-item"><span><i class="screen-shape screen-shape--${position}"></i><b>${label}</b><small>${size}</small></span><select data-path="presentation.screenAssignments.${position}">${options}</select></label>`;
}

function optionEditorRows(poll) {
  return poll.options.map((option, index) => html`<div class="option-input option-input--dynamic" data-option-row="${escapeHtml(option.id)}" style="--option-color:${escapeHtml(option.color)}">
    <span class="option-number">${String(index + 1).padStart(2, "0")}</span>
    <div>
      <label>ชื่อตัวเลือก<input data-option-id="${escapeHtml(option.id)}" data-option-field="label" maxlength="80" value="${escapeHtml(option.label)}" /></label>
      <label>จำนวนคะแนน<input data-option-id="${escapeHtml(option.id)}" data-option-field="votes" type="number" inputmode="numeric" min="0" step="1" value="${option.votes}" /></label>
      <label class="option-color-label">สี<input data-option-id="${escapeHtml(option.id)}" data-option-field="color" type="color" value="${escapeHtml(option.color)}" aria-label="สีตัวเลือกที่ ${index + 1}" /></label>
      <button class="option-remove" data-remove-option="${escapeHtml(option.id)}" type="button" ${poll.options.length <= 2 ? "disabled" : ""} aria-label="ลบ${escapeHtml(option.label)}">×</button>
    </div>
  </div>`).join("");
}

function summaryOptionsMarkup(poll) {
  const stats = pollStats(poll);
  return stats.options.map((option) => html`<div class="summary-option" style="--option-color:${escapeHtml(option.color)}">
    <div class="summary-row"><div><i></i><span>${escapeHtml(option.label)}</span></div><strong>${formatPercent(option.percent)}%</strong></div>
    <div class="summary-meter"><i style="width:${option.percent}%"></i></div>
  </div>`).join("");
}

function rangeField(label, path, min, max, value, unit = "px", step = 1) {
  return html`<label class="range-field"><span>${label}<output data-output="${path}">${value}${unit}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}" data-path="${path}" /></label>`;
}

function colorField(label, key, value, detail) {
  const path = `presentation.colors.${key}`;
  return html`<label class="color-field">
    <span>${escapeHtml(label)}<small>${escapeHtml(detail)}</small></span>
    <div><input type="color" data-path="${path}" value="${value}" aria-label="เลือก${escapeHtml(label)}" /><input class="color-hex" data-color-text="${path}" value="${value.toUpperCase()}" maxlength="7" spellcheck="false" aria-label="ค่าสี ${escapeHtml(label)}" /></div>
  </label>`;
}

function optionVisualEditor(option, index) {
  const config = option.visual;
  const path = `options.${index}.visual`;
  return html`<article class="screen-editor option-visual-editor" data-editor-option="${escapeHtml(option.id)}" style="--option-color:${escapeHtml(option.color)}">
    <div class="card-title"><div><span class="asset-dot"></span><h3>${escapeHtml(option.label)}</h3></div><span>ตัวเลือก ${String(index + 1).padStart(2, "0")}</span></div>
    <div class="subsection">
      <h4>ภาพพื้นหลัง</h4>
      <label>URL ภาพ<input type="url" data-path="${path}.backgroundUrl" value="${escapeHtml(config.backgroundUrl)}" placeholder="https://…" /></label>
      <label class="file-drop"><input type="file" accept="image/*" data-upload="background" data-option-index="${index}" /><span>↑</span><b>อัปโหลดภาพพื้นหลัง</b><small>PNG, JPG หรือ WebP ไม่เกิน 8 MB</small></label>
      <div class="two-columns">
        <label>การครอบภาพ<select data-path="${path}.backgroundFit"><option value="cover" ${config.backgroundFit === "cover" ? "selected" : ""}>เต็มพื้นที่ (Cover)</option><option value="contain" ${config.backgroundFit === "contain" ? "selected" : ""}>เห็นภาพครบ (Contain)</option></select></label>
        ${rangeField("ขนาดภาพ", `${path}.backgroundScale`, 50, 200, config.backgroundScale, "%")}
      </div>
      <div class="two-columns">
        ${rangeField("ตำแหน่งแนวนอน", `${path}.backgroundX`, 0, 100, config.backgroundX, "%")}
        ${rangeField("ตำแหน่งแนวตั้ง", `${path}.backgroundY`, 0, 100, config.backgroundY, "%")}
      </div>
    </div>
    <div class="subsection">
      <h4>โลโก้หรือภาพประกอบ</h4>
      <label>URL ภาพ<input type="url" data-path="${path}.artworkUrl" value="${escapeHtml(config.artworkUrl)}" placeholder="https://…" /></label>
      <label class="file-drop file-drop--small"><input type="file" accept="image/*" data-upload="artwork" data-option-index="${index}" /><span>＋</span><b>อัปโหลดรูปประกอบ</b></label>
      ${rangeField("ขนาดรูป", `${path}.artworkSize`, 10, 100, config.artworkSize, "%")}
      <div class="two-columns">
        ${rangeField("ตำแหน่งแนวนอน", `${path}.artworkX`, 0, 100, config.artworkX, "%")}
        ${rangeField("ตำแหน่งแนวตั้ง", `${path}.artworkY`, 0, 100, config.artworkY, "%")}
      </div>
    </div>
  </article>`;
}

function adminMarkup(poll, user, broadcastState) {
  const stats = pollStats(poll);
  const presentation = poll.presentation;
  const pollNumber = POLL_IDS.indexOf(poll.id) + 1;
  const activePollNumber = POLL_IDS.indexOf(broadcastState.active_poll_id) + 1;
  const isActivePoll = poll.id === broadcastState.active_poll_id;
  const pollTabs = POLL_IDS.map((id, index) => html`<button class="poll-set-tab ${poll.id === id ? "is-selected" : ""}" type="button" data-poll-tab="${id}">
    <span>POLL ${String(index + 1).padStart(2, "0")}</span><strong>โพลชุดที่ ${index + 1}</strong>${broadcastState.active_poll_id === id ? '<em><i></i> LIVE</em>' : ""}
  </button>`).join("");
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
        <section class="poll-set-bar">
          <div class="poll-set-tabs">${pollTabs}</div>
          <div class="broadcast-controls">
            <div><span>กำลังออกจอ</span><strong>โพลชุดที่ ${activePollNumber}</strong></div>
            <div class="live-phase-control">
              <span>เปลี่ยนสิ่งที่ออกจอทันที</span>
              <div class="live-phase-buttons" role="group" aria-label="สถานะบนจอ">
                <button type="button" data-live-phase="question" class="${broadcastState.phase === "question" ? "is-active" : ""}" aria-pressed="${broadcastState.phase === "question"}" ${isActivePoll ? "" : "disabled"}>คำถาม</button>
                <button type="button" data-live-phase="results" class="${broadcastState.phase === "results" ? "is-active" : ""}" aria-pressed="${broadcastState.phase === "results"}" ${isActivePoll ? "" : "disabled"}>ผลโพล</button>
                <button type="button" data-live-phase="summary" class="${broadcastState.phase === "summary" ? "is-active" : ""}" aria-pressed="${broadcastState.phase === "summary"}" ${isActivePoll ? "" : "disabled"}>ยอดรวม</button>
              </div>
            </div>
            <button class="button ${isActivePoll ? "button--live" : "button--primary"}" id="activate-poll" type="button" ${isActivePoll ? "disabled" : ""}>${isActivePoll ? "● กำลังขึ้นจอ" : `นำโพลชุดที่ ${pollNumber} ขึ้นจอ →`}</button>
          </div>
        </section>
        <section class="admin-section" id="poll-section">
          <div class="section-heading"><div><p class="section-kicker">POLL SET ${String(pollNumber).padStart(2, "0")}</p><h2>ข้อมูลและคะแนน</h2><span>${isActivePoll ? "ชุดนี้กำลังออกจอ การบันทึกจะอัปเดตหน้าจอทันที" : "แก้ไขและบันทึกเป็นแบบร่างได้โดยไม่กระทบจอที่กำลังใช้งาน"}</span></div><div class="updated-badge"><span>อัปเดตล่าสุด</span><time id="admin-updated-time">${formatThaiDate(poll.updated_at)}</time></div></div>
          <div class="editor-grid">
            <article class="panel-card poll-editor-card">
              <label>คำถามโพล<textarea data-path="question" rows="3" maxlength="240">${escapeHtml(poll.question)}</textarea><small><span id="question-count">${poll.question.length}</span>/240 ตัวอักษร</small></label>
              <div class="option-list" id="option-list">${optionEditorRows(poll)}</div>
              <button class="button button--ghost add-option-button" id="add-option" type="button" ${poll.options.length >= MAX_POLL_OPTIONS ? "disabled" : ""}>＋ เพิ่มตัวเลือก <small>${poll.options.length}/${MAX_POLL_OPTIONS}</small></button>
            </article>
            <article class="panel-card summary-card">
              <p class="section-kicker">LIVE CALCULATION</p><h3>สรุปผลอัตโนมัติ</h3>
              <div class="summary-total"><span>ยอดโหวตรวม</span><strong id="summary-total">${formatNumber(stats.total)}</strong><small>คะแนน</small></div>
              <div id="summary-options">${summaryOptionsMarkup(poll)}</div>
            </article>
          </div>
        </section>

        <section class="admin-section" id="display-section">
          <div class="section-heading"><div><p class="section-kicker">OUTPUT MODE</p><h2>โหมดการแสดงผล</h2><span>เลือกวิธีจัดจอสำหรับงาน โดยทุกโหมดใช้ข้อมูลชุดเดียวกัน</span></div></div>
          <div class="display-launcher">
            <div class="display-launcher-heading"><span>เปิดจอจริง</span><small>เปิดแต่ละ URL ในแท็บแยก แล้วกดปุ่มเต็มจอบนหน้าจอ</small></div>
            <div class="display-launcher-links">
              <a href="${baseLink("display")}" target="_blank" rel="noopener"><span class="screen-shape screen-shape--center"></span><span><small>1530 × 896</small><strong>จอกลาง</strong></span><b>↗</b></a>
              <a href="${baseLink("display/gold")}" target="_blank" rel="noopener"><span class="screen-shape screen-shape--left"></span><span><small>512 × 896</small><strong>จอซ้ายแนวตั้ง</strong></span><b>↗</b></a>
              <a href="${baseLink("display/property")}" target="_blank" rel="noopener"><span class="screen-shape screen-shape--right"></span><span><small>512 × 896</small><strong>จอขวาแนวตั้ง</strong></span><b>↗</b></a>
            </div>
          </div>
          <div class="mode-grid">${modeCards}</div>
          <article class="screen-mapping-card">
            <div class="mapping-heading"><div><h3>กำหนดเนื้อหาแต่ละจอ</h3><span>เปลี่ยนได้อิสระโดยไม่ต้องสลับ URL ที่ตั้งไว้กับ LED processor</span></div><div class="mapping-presets"><button type="button" data-screen-preset="results">ผลโพล 3 จอ</button><button type="button" data-screen-preset="question">จอกลางเป็นคำถาม</button><button type="button" data-screen-preset="total">จอกลางเป็นยอดรวม</button></div></div>
            <div class="screen-map-grid">
              ${screenContentSelect("left", "จอซ้าย", "512 × 896", presentation.screenAssignments.left, poll)}
              ${screenContentSelect("center", "จอกลาง", "1530 × 896", presentation.screenAssignments.center, poll)}
              ${screenContentSelect("right", "จอขวา", "512 × 896", presentation.screenAssignments.right, poll)}
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
          <div class="section-heading"><div><p class="section-kicker">VISUAL CONTROL</p><h2>ปรับหน้าตาโดยไม่แก้โค้ด</h2><span>ภาพและตำแหน่งตั้งค่าแยกตามแต่ละตัวเลือก และตามไปทุกจอที่นำตัวเลือกนั้นขึ้นแสดง</span></div><button class="button button--ghost" id="reset-layout" type="button">↺ Reset การจัดวาง</button></div>
          <article class="panel-card font-editor">
            <div class="card-title"><div><span class="font-icon">Aa</span><h3>ฟอนต์และขนาดตัวอักษร</h3></div><span>Google Fonts</span></div>
            <div class="font-source-grid"><label>ชื่อฟอนต์<input data-path="presentation.font.name" value="${escapeHtml(presentation.font.name)}" placeholder="Noto Sans Thai" /></label><label>Google Fonts URL หรือชื่อฟอนต์<input data-path="presentation.font.url" value="${escapeHtml(presentation.font.url)}" placeholder="https://fonts.googleapis.com/…" /></label></div>
            <div class="font-ranges">${rangeField("คำถาม", "presentation.font.question", 24, 96, presentation.font.question)}${rangeField("ชื่อสินทรัพย์", "presentation.font.asset", 20, 72, presentation.font.asset)}${rangeField("เปอร์เซ็นต์", "presentation.font.percent", 48, 180, presentation.font.percent)}${rangeField("จำนวนโหวต", "presentation.font.votes", 14, 48, presentation.font.votes)}${rangeField("ข้อความรอง", "presentation.font.secondary", 12, 36, presentation.font.secondary)}</div>
          </article>
          <article class="panel-card motion-editor">
            <div class="card-title"><div><span class="motion-icon">↝</span><h3>ความเร็วแอนิเมชัน</h3></div><span>ตัวเลขและแถบคะแนน</span></div>
            <div class="motion-control">${rangeField("ความเร็ว", "presentation.animation.speed", 0.25, 3, presentation.animation.speed, "×", 0.05)}<div><span>ช้า 0.25×</span><span>มาตรฐาน 1×</span><span>เร็ว 3×</span></div></div>
          </article>
          <article class="panel-card color-editor">
            <div class="card-title"><div><span class="color-icon">◐</span><h3>สีของหน้าจอและตัวอักษร</h3></div><span>ปรับแยกตามการใช้งาน</span></div>
            <div class="color-grid">
              ${colorField(poll.options[0]?.label || "ตัวเลือกที่ 1", "gold", presentation.colors.gold, "สีของตัวเลือกที่ 1 ทุกหน้าจอ")}
              ${colorField("จอกลาง", "center", presentation.colors.center, "คำถามและยอดโหวตรวม")}
              ${colorField(poll.options[1]?.label || "ตัวเลือกที่ 2", "property", presentation.colors.property, "สีของตัวเลือกที่ 2 ทุกหน้าจอ")}
              ${colorField("พื้นหัว–ท้ายจอ", "chrome", presentation.colors.chrome, "พื้นที่สีเขียวเข้ม")}
              ${colorField("ข้อความหลัก", "textPrimary", presentation.colors.textPrimary, "คำถาม ชื่อ และตัวเลข")}
              ${colorField("ข้อความรอง", "textSecondary", presentation.colors.textSecondary, "ป้ายกำกับและรายละเอียด")}
            </div>
            <p class="color-help">หากใส่ภาพพื้นหลัง สีนี้จะเป็นสีรองด้านหลังภาพ โดยเฉพาะเมื่อเลือกการครอบภาพแบบ Contain</p>
          </article>
          <article class="panel-card brand-editor">
            <div class="card-title"><div><span class="brand-editor-icon">T</span><h3>โลโก้มุมซ้ายบน</h3></div><span>โพลชุดนี้ · ใช้ร่วมกันทุกจอ</span></div>
            <div class="brand-editor-grid">
              <div>
                <label>URL โลโก้<input type="url" data-path="presentation.branding.logoUrl" value="${escapeHtml(presentation.branding.logoUrl)}" placeholder="https://…" /></label>
                <label class="file-drop file-drop--small"><input type="file" accept="image/*" data-upload="logo" /><span>＋</span><b>อัปโหลดโลโก้</b><small>PNG โปร่งใสแนะนำ</small></label>
                <button class="button button--ghost reset-logo-button" id="reset-logo" type="button">↺ ใช้โลโก้ไทยรัฐเริ่มต้น</button>
              </div>
              <div class="brand-controls">
                <label class="toggle-field"><span><b>แสดงโลโก้บนจอ</b><small>ปิดได้โดยไม่ลบไฟล์โลโก้</small></span><input type="checkbox" data-path="presentation.branding.showLogo" ${presentation.branding.showLogo ? "checked" : ""} /></label>
                ${rangeField("ขนาดโลโก้", "presentation.branding.logoSize", 32, 240, presentation.branding.logoSize)}
              </div>
            </div>
          </article>
          <div class="option-visuals-heading"><div><h3>ภาพและตำแหน่งรายตัวเลือก</h3><span>ตัวเลือกใหม่จะมีชุดปรับแต่งของตัวเองอัตโนมัติ</span></div><strong>${poll.options.length} ตัวเลือก</strong></div>
          <div class="screen-editor-grid">${poll.options.map(optionVisualEditor).join("")}</div>
        </section>

        <section class="admin-section" id="history-section">
          <div class="section-heading"><div><p class="section-kicker">AUDIT LOG</p><h2>ประวัติการแก้ไข</h2><span>แสดงค่าเดิมและค่าใหม่ พร้อมคืนค่าก่อนแก้ไขได้ในคลิกเดียว</span></div><button class="button button--ghost" id="refresh-history" type="button">↻ โหลดใหม่</button></div>
          <div class="history-list" id="history-list"><div class="history-empty">กำลังโหลดประวัติ…</div></div>
        </section>
        <div class="save-bar"><div><span id="dirty-indicator"><i></i> ยังไม่มีการเปลี่ยนแปลง</span><small>${isActivePoll ? "ชุดนี้กำลังออกจอ ทุกหน้าจอจะอัปเดตทันทีหลังบันทึก" : "ชุดนี้ยังไม่ออกจอ บันทึกได้อย่างปลอดภัยในแบบร่าง"}</small></div><button class="button button--primary" id="save-button" type="submit">${isActivePoll ? "บันทึกและอัปเดตจอ" : "บันทึกแบบร่าง"} <span>→</span></button></div>
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
      <div class="history-change"><div><span>ค่าเดิม</span><p>${escapeHtml(oldPoll.question)}</p><small>${oldStats.options.map((option) => `${escapeHtml(option.label)} ${formatNumber(option.votes)}`).join(" · ")}</small></div><b>→</b><div><span>ค่าใหม่</span><p>${escapeHtml(nextPoll.question)}</p><small>${nextStats.options.map((option) => `${escapeHtml(option.label)} ${formatNumber(option.votes)}`).join(" · ")}</small></div></div>
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

  const showDashboard = async (user, initialDraft = null, startDirty = false, selectedPollId = null) => {
    if (isConfigured && user?.app_metadata?.role !== "admin") {
      showLogin("บัญชีนี้ยังไม่มีสิทธิ์ Admin โปรดตั้งค่า app_metadata.role เป็น admin ตาม README");
      return;
    }
    let broadcastState = getCachedBroadcastState();
    let polls = POLL_IDS.map((id) => getCachedPoll(id));
    if (!initialDraft) {
      try {
        [polls, broadcastState] = await Promise.all([fetchPolls(), fetchBroadcastState()]);
      } catch { toast("ใช้ข้อมูลล่าสุดจากเบราว์เซอร์ชั่วคราว", "warning"); }
    }
    const selectedId = selectedPollId || initialDraft?.id || broadcastState.active_poll_id;
    let saved = initialDraft ? normalizePoll(initialDraft) : polls.find((poll) => poll.id === selectedId) || getCachedPoll(selectedId);
    let draft = normalizePoll(saved);
    let history = [];
    let dirty = startDirty;
    root.innerHTML = adminMarkup(draft, user, broadcastState);
    if (dirty) {
      const indicator = root.querySelector("#dirty-indicator");
      indicator.classList.add("is-dirty");
      indicator.innerHTML = "<i></i> มีการเปลี่ยนแปลงที่ยังไม่บันทึก";
    }

    const updateSummary = () => {
      const stats = pollStats(draft);
      root.querySelector("#summary-total").textContent = formatNumber(stats.total);
      root.querySelector("#summary-options").innerHTML = summaryOptionsMarkup(draft);
      root.querySelector("#question-count").textContent = draft.question.length;
    };

    const updatePreviews = () => {
      const phase = draft.id === broadcastState.active_poll_id ? broadcastState.phase : "results";
      renderPreview(root.querySelector("#preview-combined"), draft, "combined", phase);
      renderPreview(root.querySelector("#preview-gold"), draft, "gold", phase);
      renderPreview(root.querySelector("#preview-property"), draft, "property", phase);
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
        history = await fetchHistory(draft.id, 20);
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

    root.querySelectorAll("[data-poll-tab]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.pollTab === draft.id) return;
      if (dirty && !window.confirm("มีการแก้ไขที่ยังไม่บันทึก ต้องการเปลี่ยนชุดโพลและละทิ้งการแก้ไขหรือไม่?")) return;
      showDashboard(user, null, false, button.dataset.pollTab);
    }));

    const syncPhaseButtons = (disabled = false) => {
      root.querySelectorAll("[data-live-phase]").forEach((button) => {
        const active = button.dataset.livePhase === broadcastState.phase;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
        button.disabled = disabled || draft.id !== broadcastState.active_poll_id;
      });
    };

    root.querySelectorAll("[data-live-phase]").forEach((button) => button.addEventListener("click", async () => {
      if (draft.id !== broadcastState.active_poll_id || button.dataset.livePhase === broadcastState.phase) return;
      syncPhaseButtons(true);
      try {
        broadcastState = await setBroadcastState({ phase: button.dataset.livePhase });
        syncPhaseButtons();
        updatePreviews();
        toast(`เปลี่ยนหน้าจอเป็น “${button.textContent.trim()}” แล้ว`);
      } catch (error) {
        syncPhaseButtons();
        toast(error.message, "error");
      }
    }));

    root.querySelector("#activate-poll").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "กำลังนำขึ้นจอ…";
      try {
        validatePoll(draft);
        if (dirty) {
          saved = await savePoll(draft, user?.email || "Demo Admin");
          draft = normalizePoll(saved);
          dirty = false;
        }
        broadcastState = await setBroadcastState({ active_poll_id: draft.id, phase: "question" });
        toast("นำโพลชุดนี้ขึ้นจอแล้ว โดยเริ่มที่หน้าแสดงคำถาม");
        await showDashboard(user, null, false, draft.id);
      } catch (error) {
        toast(error.message, "error");
        button.disabled = false;
        button.textContent = `นำโพลชุดที่ ${POLL_IDS.indexOf(draft.id) + 1} ขึ้นจอ →`;
      }
    });

    const applyDraftValue = (path, value, input = null) => {
      setDeep(draft, path, value);
      if (path === "presentation.colors.gold") draft.options[0].color = value;
      if (path === "presentation.colors.property") draft.options[1].color = value;
      const output = root.querySelector(`[data-output="${path}"]`);
      if (output && input) output.textContent = `${input.value}${input.dataset.unit || ""}`;
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
        const value = input.type === "checkbox" ? input.checked : input.type === "number" || input.type === "range" ? Number(input.value) : input.value;
        applyDraftValue(path, value, input);
      };
      input.addEventListener(input.type === "range" ? "input" : "input", listener);
      if (input.tagName === "SELECT") input.addEventListener("change", listener);
    });

    root.querySelectorAll("[data-option-field]").forEach((input) => input.addEventListener("input", () => {
      const optionIndex = draft.options.findIndex((option) => option.id === input.dataset.optionId);
      if (optionIndex < 0) return;
      const field = input.dataset.optionField;
      draft.options[optionIndex][field] = field === "votes" ? Number(input.value) : input.value;
      if (field === "color" && optionIndex < 2) draft.presentation.colors[optionIndex === 0 ? "gold" : "property"] = input.value;
      draft.option_gold = draft.options[0].label;
      draft.option_property = draft.options[1].label;
      draft.votes_gold = Number(draft.options[0].votes) || 0;
      draft.votes_property = Number(draft.options[1].votes) || 0;
      updateSummary();
      updatePreviews();
      markDirty();
    }));

    root.querySelector("#add-option").addEventListener("click", () => {
      if (draft.options.length >= MAX_POLL_OPTIONS) return;
      const index = draft.options.length;
      draft.options.push({
        id: `option-${Date.now().toString(36)}`,
        label: `ตัวเลือกที่ ${index + 1}`,
        votes: 0,
        color: DEFAULT_OPTION_COLORS[index],
        visual: clone(DEFAULT_PRESENTATION.screens.gold),
      });
      showDashboard(user, draft, true, draft.id).then(() => toast("เพิ่มตัวเลือกแล้ว กรุณากรอกชื่อและคะแนน"));
    });

    root.querySelector("#option-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-option]");
      if (!button || draft.options.length <= 2) return;
      const removedId = button.dataset.removeOption;
      draft.options = draft.options.filter((option) => option.id !== removedId);
      for (const [position, content] of Object.entries(draft.presentation.screenAssignments)) {
        if (content === `option:${removedId}`) draft.presentation.screenAssignments[position] = position === "left" ? "gold" : position === "right" ? "property" : "combined";
      }
      showDashboard(user, draft, true, draft.id).then(() => toast("ลบตัวเลือกแล้ว การเปลี่ยนแปลงยังไม่ขึ้นจอจนกว่าจะบันทึก"));
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
        const isLogo = input.dataset.upload === "logo";
        const optionIndex = input.dataset.optionIndex === undefined ? -1 : Number(input.dataset.optionIndex);
        const option = optionIndex >= 0 ? draft.options[optionIndex] : null;
        const uploadGroup = isLogo ? "brand" : option ? `option-${option.id}` : input.dataset.screen;
        const url = await uploadPollAsset(file, uploadGroup, input.dataset.upload);
        const path = isLogo
          ? "presentation.branding.logoUrl"
          : option
            ? `options.${optionIndex}.visual.${input.dataset.upload === "background" ? "backgroundUrl" : "artworkUrl"}`
            : `presentation.screens.${input.dataset.screen}.${input.dataset.upload === "background" ? "backgroundUrl" : "artworkUrl"}`;
        setDeep(draft, path, url);
        const urlInput = root.querySelector(`[data-path="${path}"]`);
        urlInput.value = url;
        updatePreviews();
        markDirty();
        toast(isLogo ? "อัปโหลดโลโก้เรียบร้อย" : "อัปโหลดรูปเรียบร้อย");
      } catch (error) { toast(error.message, "error"); }
      finally { label.classList.remove("is-loading"); input.value = ""; }
    }));

    root.querySelector("#reset-logo").addEventListener("click", () => {
      draft.presentation.branding.logoUrl = "";
      draft.presentation.branding.showLogo = true;
      root.querySelector('[data-path="presentation.branding.logoUrl"]').value = "";
      root.querySelector('[data-path="presentation.branding.showLogo"]').checked = true;
      updatePreviews();
      markDirty();
      toast("คืนโลโก้ไทยรัฐเริ่มต้นแล้ว กรุณากดบันทึก");
    });

    root.querySelector("#reset-layout").addEventListener("click", () => {
      const currentMode = draft.presentation.displayMode;
      draft.presentation = clone(DEFAULT_PRESENTATION);
      draft.presentation.displayMode = currentMode;
      draft.options.forEach((option, index) => {
        option.visual = clone(DEFAULT_PRESENTATION.screens[index === 1 ? "property" : "gold"]);
      });
      showDashboard(user, draft, true, draft.id).then(() => toast("คืนค่าการจัดวางเริ่มต้นแล้ว กรุณากดบันทึก"));
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
        indicator.innerHTML = draft.id === broadcastState.active_poll_id
          ? "<i></i> บันทึกและอัปเดตจอแล้ว"
          : "<i></i> บันทึกแบบร่างแล้ว";
        updatePreviews();
        await loadHistory();
        toast(draft.id === broadcastState.active_poll_id ? "บันทึกแล้ว ทุกหน้าจอกำลังอัปเดต" : "บันทึกแบบร่างแล้ว โดยไม่กระทบจอสด");
      } catch (error) { toast(error.message, "error"); }
      finally {
        button.disabled = false;
        button.innerHTML = `${draft.id === broadcastState.active_poll_id ? "บันทึกและอัปเดตจอ" : "บันทึกแบบร่าง"} <span>→</span>`;
      }
    });

    root.querySelector("#history-list").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-restore-id]");
      if (!button) return;
      const entry = history.find((item) => String(item.id) === button.dataset.restoreId);
      if (!entry) return;
      button.disabled = true;
      try {
        saved = await restoreHistory(entry, user?.email || "Demo Admin");
        toast(draft.id === broadcastState.active_poll_id ? "คืนค่าข้อมูลเดิมและอัปเดตจอแล้ว" : "คืนค่าข้อมูลเดิมในแบบร่างแล้ว");
        await showDashboard(user, null, false, draft.id);
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
