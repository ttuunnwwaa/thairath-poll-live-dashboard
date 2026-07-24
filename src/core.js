export const TAU = Math.PI * 2;

export function normalizeAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

export function parseEntries(input) {
  return String(input ?? "")
    .split(/[\n\r,;\t]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function detectDelimiter(input) {
  const text = String(input ?? "").replace(/^\uFEFF/, "");
  const firstRecord = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const delimiter of candidates) {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < firstRecord.length; index += 1) {
      const character = firstRecord[index];
      if (character === '"') {
        if (quoted && firstRecord[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted && character === delimiter) count += 1;
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function parseDelimitedText(input, delimiter = detectDelimiter(input)) {
  const text = String(input ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(value.trim());
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

export function dedupeEntries(entries, allowDuplicates = false) {
  if (allowDuplicates) return { accepted: [...entries], duplicates: [] };
  const seen = new Set();
  const accepted = [];
  const duplicates = [];
  for (const value of entries) {
    if (seen.has(value)) duplicates.push(value);
    else {
      seen.add(value);
      accepted.push(value);
    }
  }
  return { accepted, duplicates };
}

export function generateRange({ start, end, digits = 1, prefix = "", suffix = "" }) {
  const first = Number(start);
  const last = Number(end);
  const width = Math.max(1, Math.min(12, Number(digits) || 1));
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first) {
    throw new Error("ช่วงหมายเลขไม่ถูกต้อง");
  }
  if (last - first + 1 > 1000) throw new Error("รองรับสูงสุด 1,000 หมายเลข");
  return Array.from({ length: last - first + 1 }, (_, index) =>
    `${prefix}${String(first + index).padStart(width, "0")}${suffix}`,
  );
}

export function secureRandomIndex(length, cryptoObject = globalThis.crypto) {
  if (!Number.isInteger(length) || length <= 0) throw new Error("ไม่มีรายการสำหรับสุ่ม");
  if (!cryptoObject?.getRandomValues) return Math.floor(Math.random() * length);
  const max = 0x100000000;
  const limit = max - (max % length);
  const value = new Uint32Array(1);
  do cryptoObject.getRandomValues(value);
  while (value[0] >= limit);
  return value[0] % length;
}

export function targetRotation(currentRotation, winnerIndex, segmentCount, minimumRotations) {
  const arc = TAU / segmentCount;
  const targetMod = normalizeAngle(-(winnerIndex + 0.5) * arc);
  const currentMod = normalizeAngle(currentRotation);
  const forward = normalizeAngle(targetMod - currentMod);
  return currentRotation + Math.max(1, minimumRotations) * TAU + forward;
}

export function winnerIndexAtPointer(rotation, segmentCount) {
  if (!Number.isInteger(segmentCount) || segmentCount <= 0) {
    throw new Error("จำนวนช่องต้องมากกว่า 0");
  }
  const arc = TAU / segmentCount;
  return Math.floor(normalizeAngle(-rotation) / arc) % segmentCount;
}

export function spinEaseOut(progress) {
  const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
  return 1 - (1 - clamped) ** 5;
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function formatCSV(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
}

export function contrastRatio(hexA, hexB) {
  const luminance = (hex) => {
    const clean = hex.replace("#", "");
    const values = [0, 2, 4].map((offset) => parseInt(clean.slice(offset, offset + 2), 16) / 255);
    const linear = values.map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function uid(prefix = "id") {
  const bytes = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.random() * 256;
  return `${prefix}-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function isSafeSvg(text) {
  return !/<script|foreignObject|on\w+\s*=|javascript:|data:text\/html/i.test(String(text ?? ""));
}

export function validateProjectPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("รูปแบบไฟล์โปรเจกต์ไม่ถูกต้อง");
  if (payload.format !== "lucky-draw-wheel") throw new Error("รูปแบบไฟล์โปรเจกต์ไม่ถูกต้อง");
  if (!Array.isArray(payload.numbers)) throw new Error("ไฟล์โปรเจกต์ไม่มีรายการหมายเลข");
  if (payload.numbers.length > 1000) throw new Error("โปรเจกต์มีหมายเลขเกิน 1,000 รายการ");
  if (payload.history != null && !Array.isArray(payload.history)) throw new Error("ประวัติโปรเจกต์ไม่ถูกต้อง");
  if (payload.settings != null && typeof payload.settings !== "object") throw new Error("การตั้งค่าโปรเจกต์ไม่ถูกต้อง");
  if (payload.assets != null && typeof payload.assets !== "object") throw new Error("ข้อมูลรูปภาพโปรเจกต์ไม่ถูกต้อง");
  if (payload.assets?.segmentMappings != null && typeof payload.assets.segmentMappings !== "object") {
    throw new Error("ข้อมูลรูปประจำช่องไม่ถูกต้อง");
  }
  return payload;
}
