import { createClient } from "@supabase/supabase-js";
import { CACHE_KEY, DEMO_HISTORY_KEY, POLL_ID, defaultPoll } from "./defaults.js";
import { normalizePoll } from "./poll-core.js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const isConfigured = /^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl) && supabaseAnonKey.length > 20;
export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function getCachedPoll() {
  const cached = safeParse(localStorage.getItem(CACHE_KEY), null);
  return cached ? normalizePoll(cached) : defaultPoll();
}

export function cachePoll(poll) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(normalizePoll(poll)));
  } catch {
    // The live result remains usable even if storage is unavailable.
  }
}

export async function fetchPoll() {
  if (!supabase) return getCachedPoll();
  const { data, error } = await supabase.from("polls").select("*").eq("id", POLL_ID).single();
  if (error) throw error;
  const poll = normalizePoll(data);
  cachePoll(poll);
  return poll;
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  if (!supabase) return { user: { email: "demo@local" }, demo: true };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
}

function getDemoHistory() {
  return safeParse(localStorage.getItem(DEMO_HISTORY_KEY), []);
}

export async function savePoll(nextPoll, editor = "Demo Admin") {
  const payload = normalizePoll(nextPoll);
  if (!supabase) {
    const previous = getCachedPoll();
    payload.updated_at = new Date().toISOString();
    payload.updated_by = editor;
    const history = getDemoHistory();
    history.unshift({
      id: crypto.randomUUID(),
      poll_id: POLL_ID,
      changed_at: payload.updated_at,
      changed_by_email: editor,
      old_data: previous,
      new_data: payload,
    });
    localStorage.setItem(DEMO_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    cachePoll(payload);
    window.dispatchEvent(new CustomEvent("thairath-demo-update", { detail: payload }));
    return payload;
  }

  const { id: _id, updated_at: _updatedAt, updated_by: _updatedBy, ...changes } = payload;
  const { data, error } = await supabase
    .from("polls")
    .update(changes)
    .eq("id", POLL_ID)
    .select("*")
    .single();
  if (error) throw error;
  cachePoll(data);
  return normalizePoll(data);
}

export async function fetchHistory(limit = 20) {
  if (!supabase) return getDemoHistory().slice(0, limit);
  const { data, error } = await supabase
    .from("poll_history")
    .select("id,poll_id,changed_at,changed_by,changed_by_email,old_data,new_data")
    .eq("poll_id", POLL_ID)
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function restoreHistory(entry, editor) {
  if (!entry?.old_data) throw new Error("ไม่พบข้อมูลเดิมในรายการนี้");
  return savePoll(normalizePoll({ ...entry.old_data, id: POLL_ID }), editor);
}

export async function uploadPollAsset(file, screen, type) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("รองรับไฟล์ PNG, JPG และ WebP เท่านั้น");
  if (file.size > 8 * 1024 * 1024) throw new Error("รูปภาพต้องมีขนาดไม่เกิน 8 MB");
  if (!supabase) return readFileAsDataUrl(file);

  const extension = (file.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const path = `${screen}/${type}-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("poll-assets").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("poll-assets").getPublicUrl(path);
  return data.publicUrl;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

export function subscribeToPoll({ onPoll, onStatus }) {
  if (!supabase) {
    const demoHandler = (event) => onPoll(normalizePoll(event.detail));
    const storageHandler = (event) => {
      if (event.key === CACHE_KEY && event.newValue) onPoll(normalizePoll(safeParse(event.newValue, defaultPoll())));
    };
    window.addEventListener("thairath-demo-update", demoHandler);
    window.addEventListener("storage", storageHandler);
    onStatus("demo");
    return () => {
      window.removeEventListener("thairath-demo-update", demoHandler);
      window.removeEventListener("storage", storageHandler);
    };
  }

  let retryTimer;
  const refresh = async () => {
    try {
      onPoll(await fetchPoll());
      onStatus("connected");
    } catch {
      onStatus("reconnecting");
    }
  };
  const channel = supabase
    .channel(`poll-live-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "polls", filter: `id=eq.${POLL_ID}` },
      (payload) => {
        const poll = normalizePoll(payload.new);
        cachePoll(poll);
        onPoll(poll);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onStatus("connected");
      else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) onStatus("reconnecting");
    });

  const onlineHandler = () => refresh();
  const offlineHandler = () => onStatus("reconnecting");
  window.addEventListener("online", onlineHandler);
  window.addEventListener("offline", offlineHandler);
  retryTimer = window.setInterval(() => {
    if (!navigator.onLine) return;
    refresh();
  }, 15000);

  return () => {
    clearInterval(retryTimer);
    window.removeEventListener("online", onlineHandler);
    window.removeEventListener("offline", offlineHandler);
    supabase.removeChannel(channel);
  };
}
