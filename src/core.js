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
