import "./styles.css";
import { renderAdmin } from "./admin.js";
import { fetchPoll, getCachedPoll, isConfigured, subscribeToPoll } from "./data-service.js";
import { updateDisplay } from "./display-view.js";

const root = document.getElementById("app");

function resolveRoute() {
  const redirected = new URLSearchParams(location.search).get("route");
  if (redirected) {
    const routePath = redirected.startsWith("/") ? redirected : `/${redirected}`;
    history.replaceState(null, "", `${import.meta.env.BASE_URL.replace(/\/$/, "")}${routePath}`);
    return routePath.split(/[?#]/)[0];
  }
  const base = new URL(import.meta.env.BASE_URL, location.origin).pathname.replace(/\/$/, "");
  let path = location.pathname;
  if (base && path.startsWith(base)) path = path.slice(base.length);
  return `/${path.replace(/^\//, "").replace(/\/$/, "")}` || "/";
}

function fullscreen() {
  if (document.fullscreenElement) return document.exitFullscreen();
  return document.documentElement.requestFullscreen?.();
}

function setConnectionStatus(status) {
  const indicator = root.querySelector(".connection-indicator");
  if (!indicator) return;
  indicator.dataset.status = status;
  indicator.querySelector("span").textContent = status === "connected"
    ? "ข้อมูลล่าสุด"
    : status === "demo"
      ? "โหมดตัวอย่างในเครื่อง"
      : "กำลังเชื่อมต่อข้อมูลล่าสุด";
}

async function mountDisplay(type) {
  let poll = getCachedPoll();
  updateDisplay(root, poll, type, { rebuild: true });
  setConnectionStatus(isConfigured ? "loading" : "demo");
  root.addEventListener("click", (event) => {
    if (event.target.closest(".fullscreen-control")) fullscreen();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "f" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) fullscreen();
  });

  try {
    poll = await fetchPoll();
    updateDisplay(root, poll, type);
    setConnectionStatus(isConfigured ? "connected" : "demo");
  } catch {
    setConnectionStatus("reconnecting");
  }

  subscribeToPoll({
    onPoll(nextPoll) {
      poll = nextPoll;
      updateDisplay(root, poll, type);
    },
    onStatus: setConnectionStatus,
  });
}

function mountHome() {
  root.innerHTML = `<main class="home-page">
    <section>
      <div class="home-brand"><span class="brand-leaf"></span><strong>ไทยรัฐ</strong><i></i><b>POLL</b></div>
      <p>LIVE EVENT DASHBOARD</p>
      <h1>เลือกหน้าจอที่ต้องการเปิด</h1>
      <div class="home-links">
        <a href="${import.meta.env.BASE_URL}admin"><span>CONTROL</span><strong>หน้าผู้ดูแล</strong><small>แก้คะแนนและงานภาพ →</small></a>
        <a href="${import.meta.env.BASE_URL}display"><span>DISPLAY 01</span><strong>จอรวม</strong><small>สองตัวเลือกในจอเดียว →</small></a>
        <a href="${import.meta.env.BASE_URL}display/gold"><span>DISPLAY 02</span><strong>จอทองคำ</strong><small>แนวตั้ง 512 × 896 →</small></a>
        <a href="${import.meta.env.BASE_URL}display/property"><span>DISPLAY 03</span><strong>จออสังหาริมทรัพย์</strong><small>แนวตั้ง 512 × 896 →</small></a>
      </div>
    </section>
  </main>`;
}

const route = resolveRoute();
document.body.dataset.route = route;
if (route === "/admin") renderAdmin(root);
else if (route === "/display/gold") mountDisplay("gold");
else if (route === "/display/property") mountDisplay("property");
else if (route === "/display") mountDisplay("combined");
else mountHome();
