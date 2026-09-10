import { createClient } from "@supabase/supabase-js";
import {
  BROADCAST_CACHE_KEY,
  CACHE_KEY,
  DEMO_HISTORY_KEY,
  POLL_ID,
  POLL_IDS,
  defaultBroadcastState,
  defaultPoll,
} from "./defaults.js";
import { broadcastStatePatch, normalizeBroadcastState, normalizePoll } from "./poll-core.js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
const initialAuthHash = String(window.__THAIRATH_AUTH_HASH__ || location.hash);
const initialAuthParams = new URLSearchParams(initialAuthHash.replace(/^#/, ""));

export const authCallbackType = initialAuthParams.get("type");
export const authCallbackError = initialAuthParams.get("error_code");

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

function pollCacheKey(id) {
  return `${CACHE_KEY}:${id}`;
}

export function getCachedPoll(id = POLL_ID) {
  const current = localStorage.getItem(pollCacheKey(id));
  const legacy = id === POLL_ID ? localStorage.getItem(CACHE_KEY) : null;
  const cached = safeParse(current || legacy, null);
  return cached ? normalizePoll({ ...cached, id }) : defaultPoll(id);
}

export function cachePoll(poll) {
  try {
    const normalized = normalizePoll(poll);
    localStorage.setItem(pollCacheKey(normalized.id), JSON.stringify(normalized));
    if (normalized.id === POLL_ID) localStorage.setItem(CACHE_KEY, JSON.stringify(normalized));
  } catch {
    // The live result remains usable even if storage is unavailable.
  }
}

export async function fetchPoll(id = POLL_ID) {
  if (!supabase) return getCachedPoll(id);
  const { data, error } = await supabase.from("polls").select("*").eq("id", id).single();
  if (error) throw error;
  const poll = normalizePoll(data);
  cachePoll(poll);
  return poll;
}

export async function fetchPolls() {
  if (!supabase) return POLL_IDS.map((id) => getCachedPoll(id));
  const { data, error } = await supabase.from("polls").select("*").in("id", POLL_IDS);
  if (error) throw error;
  const byId = new Map((data || []).map((poll) => [poll.id, normalizePoll(poll)]));
  const polls = POLL_IDS.map((id) => byId.get(id) || defaultPoll(id));
  polls.forEach(cachePoll);
  return polls;
}

export function getCachedBroadcastState() {
  return normalizeBroadcastState(safeParse(localStorage.getItem(BROADCAST_CACHE_KEY), defaultBroadcastState()));
}

function cacheBroadcastState(state) {
  const normalized = normalizeBroadcastState(state);
  try { localStorage.setItem(BROADCAST_CACHE_KEY, JSON.stringify(normalized)); } catch { /* Keep the live view running. */ }
  return normalized;
}

export async function fetchBroadcastState() {
  if (!supabase) return getCachedBroadcastState();
  const { data, error } = await supabase.from("broadcast_state").select("*").eq("id", true).single();
  if (error) throw error;
  return cacheBroadcastState(data);
}

export async function fetchLivePoll() {
  const state = await fetchBroadcastState();
  return { state, poll: await fetchPoll(state.active_poll_id) };
}

export async function setBroadcastState(changes) {
  const next = normalizeBroadcastState({ ...getCachedBroadcastState(), ...changes });
  if (!supabase) {
    next.updated_at = new Date().toISOString();
    cacheBroadcastState(next);
    window.dispatchEvent(new CustomEvent("thairath-demo-broadcast", { detail: next }));
    return next;
  }
  // Only update fields requested by this action. A display or admin tab may have
  // an older cached active poll, so sending the whole cached state could switch
  // the broadcast back while another tab is only changing the phase.
  const payload = broadcastStatePatch(changes);
  if (!Object.keys(payload).length) return fetchBroadcastState();
  const { data, error } = await supabase
    .from("broadcast_state")
    .update(payload)
    .eq("id", true)
    .select("*")
    .single();
  if (error) throw error;
  return cacheBroadcastState(data);
}

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
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

export async function updatePassword(password) {
  if (!supabase) throw new Error("การตั้งรหัสผ่านใช้ได้เฉพาะเมื่อเชื่อมต่อ Supabase");
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

function getDemoHistory(pollId = POLL_ID) {
  return safeParse(localStorage.getItem(`${DEMO_HISTORY_KEY}:${pollId}`), []);
}

export async function savePoll(nextPoll, editor = "Demo Admin") {
  const payload = normalizePoll(nextPoll);
  if (!supabase) {
    const previous = getCachedPoll(payload.id);
    payload.updated_at = new Date().toISOString();
    payload.updated_by = editor;
    const history = getDemoHistory(payload.id);
    history.unshift({
      id: crypto.randomUUID(),
      poll_id: payload.id,
      changed_at: payload.updated_at,
      changed_by_email: editor,
      old_data: previous,
      new_data: payload,
    });
    localStorage.setItem(`${DEMO_HISTORY_KEY}:${payload.id}`, JSON.stringify(history.slice(0, 50)));
    cachePoll(payload);
    window.dispatchEvent(new CustomEvent("thairath-demo-update", { detail: payload }));
    return payload;
  }

  const { id: _id, updated_at: _updatedAt, updated_by: _updatedBy, ...changes } = payload;
  const { data, error } = await supabase
    .from("polls")
    .update(changes)
    .eq("id", payload.id)
    .select("*")
    .single();
  if (error) throw error;
  cachePoll(data);
  return normalizePoll(data);
}

export async function fetchHistory(pollId = POLL_ID, limit = 20) {
  if (!supabase) return getDemoHistory(pollId).slice(0, limit);
  const { data, error } = await supabase
    .from("poll_history")
    .select("id,poll_id,changed_at,changed_by,changed_by_email,old_data,new_data")
    .eq("poll_id", pollId)
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function restoreHistory(entry, editor) {
  if (!entry?.old_data) throw new Error("ไม่พบข้อมูลเดิมในรายการนี้");
  return savePoll(normalizePoll({ ...entry.old_data, id: entry.poll_id || POLL_ID }), editor);
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

export function subscribeToPoll({ onPoll, onBroadcast, onStatus }) {
  if (!supabase) {
    let activePollId = getCachedBroadcastState().active_poll_id;
    const demoHandler = (event) => {
      const poll = normalizePoll(event.detail);
      if (poll.id === activePollId) onPoll(poll);
    };
    const broadcastHandler = (event) => {
      const state = normalizeBroadcastState(event.detail);
      activePollId = state.active_poll_id;
      onBroadcast?.(state);
      onPoll(getCachedPoll(activePollId));
    };
    const storageHandler = (event) => {
      if (event.key === BROADCAST_CACHE_KEY && event.newValue) {
        const state = normalizeBroadcastState(safeParse(event.newValue, defaultBroadcastState()));
        activePollId = state.active_poll_id;
        onBroadcast?.(state);
        onPoll(getCachedPoll(activePollId));
      } else if (event.key?.startsWith(`${CACHE_KEY}:`) && event.newValue) {
        const poll = normalizePoll(safeParse(event.newValue, defaultPoll(activePollId)));
        if (poll.id === activePollId) onPoll(poll);
      }
    };
    window.addEventListener("thairath-demo-update", demoHandler);
    window.addEventListener("thairath-demo-broadcast", broadcastHandler);
    window.addEventListener("storage", storageHandler);
    onStatus("demo");
    return () => {
      window.removeEventListener("thairath-demo-update", demoHandler);
      window.removeEventListener("thairath-demo-broadcast", broadcastHandler);
      window.removeEventListener("storage", storageHandler);
    };
  }

  let retryTimer;
  let activePollId = getCachedBroadcastState().active_poll_id;
  const refresh = async () => {
    try {
      const state = await fetchBroadcastState();
      activePollId = state.active_poll_id;
      onBroadcast?.(state);
      onPoll(await fetchPoll(activePollId));
      onStatus("connected");
    } catch {
      onStatus("reconnecting");
    }
  };
  const channel = supabase
    .channel(`poll-live-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "polls" },
      (payload) => {
        const poll = normalizePoll(payload.new);
        cachePoll(poll);
        if (poll.id === activePollId) onPoll(poll);
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "broadcast_state", filter: "id=eq.true" },
      async (payload) => {
        const state = cacheBroadcastState(payload.new);
        activePollId = state.active_poll_id;
        onBroadcast?.(state);
        try { onPoll(await fetchPoll(activePollId)); } catch { onStatus("reconnecting"); }
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
