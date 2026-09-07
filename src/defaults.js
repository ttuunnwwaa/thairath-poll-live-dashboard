export const POLL_ID = "00000000-0000-0000-0000-000000000001";
export const CACHE_KEY = "thairath-poll-latest-v1";
export const DEMO_HISTORY_KEY = "thairath-poll-history-v1";

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

export function defaultPoll() {
  return {
    id: POLL_ID,
    question: "คุณคิดว่าสินทรัพย์ไหนจะทำให้คุณรอดในอนาคต",
    option_gold: "ทองคำ",
    option_property: "อสังหาริมทรัพย์",
    votes_gold: 680,
    votes_property: 320,
    presentation: clone(DEFAULT_PRESENTATION),
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}
