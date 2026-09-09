export const POLL_IDS = Object.freeze([
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
]);
export const POLL_ID = POLL_IDS[0];
export const CACHE_KEY = "thairath-poll-latest-v1";
export const DEMO_HISTORY_KEY = "thairath-poll-history-v1";
export const BROADCAST_CACHE_KEY = "thairath-poll-broadcast-v1";

export const DEFAULT_PRESENTATION = Object.freeze({
  displayMode: "combined",
  screenAssignments: {
    left: "gold",
    center: "combined",
    right: "property",
  },
  font: {
    name: "Noto Sans Thai",
    url: "https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800;900&display=swap",
    question: 48,
    asset: 38,
    percent: 104,
    votes: 22,
    secondary: 18,
  },
  colors: {
    gold: "#8a5c12",
    center: "#0b513b",
    property: "#0d6348",
    chrome: "#031f17",
    textPrimary: "#ffffff",
    textSecondary: "#b9cec5",
  },
  branding: {
    showLogo: true,
    logoUrl: "",
    logoSize: 82,
  },
  screens: {
    gold: {
      backgroundUrl: "",
      backgroundFit: "cover",
      backgroundX: 50,
      backgroundY: 50,
      backgroundScale: 100,
      artworkUrl: "",
      artworkSize: 42,
      artworkX: 50,
      artworkY: 33,
    },
    property: {
      backgroundUrl: "",
      backgroundFit: "cover",
      backgroundX: 50,
      backgroundY: 50,
      backgroundScale: 100,
      artworkUrl: "",
      artworkSize: 42,
      artworkX: 50,
      artworkY: 33,
    },
  },
});

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function defaultPoll(id = POLL_ID) {
  const isSecondPoll = id === POLL_IDS[1];
  return {
    id,
    question: isSecondPoll ? "คำถามสำหรับโพลชุดที่ 2" : "คุณคิดว่าสินทรัพย์ไหนจะทำให้คุณรอดในอนาคต",
    option_gold: isSecondPoll ? "ตัวเลือกที่ 1" : "ทองคำ",
    option_property: isSecondPoll ? "ตัวเลือกที่ 2" : "อสังหาริมทรัพย์",
    votes_gold: isSecondPoll ? 0 : 680,
    votes_property: isSecondPoll ? 0 : 320,
    presentation: clone(DEFAULT_PRESENTATION),
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}

export function defaultBroadcastState() {
  return {
    id: true,
    active_poll_id: POLL_ID,
    phase: "results",
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}
