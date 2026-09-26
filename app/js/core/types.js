// Value helpers for Roblox datatypes as stored in RbxUI documents.
//
// JSON encoding (identical in the editor, the exporters and the CLI):
//   Color3          "#RRGGBB"
//   UDim            [scale, offset]
//   UDim2           [xScale, xOffset, yScale, yOffset]
//   Vector2         [x, y]
//   Rect            [minX, minY, maxX, maxY]
//   ColorSequence   [[time, "#RRGGBB"], ...]      (time 0..1, first=0, last=1)
//   NumberSequence  [[time, value], ...]
//   Font            { family: "Montserrat", weight: "Bold", style: "Normal" }
//   Enum            "ItemName"
//   ContentId       "rbxassetid://123" | "asset:<localAssetId>" | ""

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const round = (v, d = 3) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

export function deepClone(v) {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

// ---------- Color3 ----------
export function hexToRgb(hex) {
  let h = String(hex || '#000000').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toUpperCase();
}

/** Accepts "#hex", "rgb(r,g,b)", [r,g,b] (0-255) or {r,g,b}; returns "#RRGGBB". */
export function normColor(v) {
  if (Array.isArray(v)) return rgbToHex(v[0], v[1], v[2]);
  if (v && typeof v === 'object') return rgbToHex(v.r ?? v.R ?? 0, v.g ?? v.G ?? 0, v.b ?? v.B ?? 0);
  const s = String(v ?? '').trim();
  const m = s.match(/^rgb\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i);
  if (m) return rgbToHex(+m[1], +m[2], +m[3]);
  return rgbToHex(...hexToRgb(s));
}

export function rgba(hex, alpha = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${round(clamp(alpha, 0, 1), 4)})`;
}

export function mulColor(hexA, hexB) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex((a[0] * b[0]) / 255, (a[1] * b[1]) / 255, (a[2] * b[2]) / 255);
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Relative luminance (WCAG) of a hex color, 0..1 */
export function luminance(hex) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---------- Sequences ----------
export function evalColorSequence(seq, t) {
  if (!seq || !seq.length) return '#FFFFFF';
  if (t <= seq[0][0]) return seq[0][1];
  for (let i = 0; i < seq.length - 1; i++) {
    const [t0, c0] = seq[i], [t1, c1] = seq[i + 1];
    if (t >= t0 && t <= t1) {
      const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      const a = hexToRgb(c0), b = hexToRgb(c1);
      return rgbToHex(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
    }
  }
  return seq[seq.length - 1][1];
}

export function evalNumberSequence(seq, t) {
  if (!seq || !seq.length) return 0;
  if (t <= seq[0][0]) return seq[0][1];
  for (let i = 0; i < seq.length - 1; i++) {
    const [t0, v0] = seq[i], [t1, v1] = seq[i + 1];
    if (t >= t0 && t <= t1) return t1 === t0 ? v0 : lerp(v0, v1, (t - t0) / (t1 - t0));
  }
  return seq[seq.length - 1][1];
}

/** Normalizes a sequence: sorted, clamped, first time 0 and last time 1 (Roblox requirement). */
export function normSequence(seq, isColor) {
  let s = (Array.isArray(seq) ? seq : []).map((k) => [clamp(+k[0] || 0, 0, 1), isColor ? normColor(k[1]) : +k[1] || 0]);
  if (!s.length) s = isColor ? [[0, '#FFFFFF'], [1, '#FFFFFF']] : [[0, 0], [1, 0]];
  s.sort((a, b) => a[0] - b[0]);
  if (s.length === 1) s.push([1, s[0][1]]);
  s[0][0] = 0;
  s[s.length - 1][0] = 1;
  if (s.length > 20) s = s.slice(0, 19).concat([s[s.length - 1]]);
  return s;
}

// ---------- UDim helpers ----------
export const udim2 = (xs = 0, xo = 0, ys = 0, yo = 0) => [xs, xo, ys, yo];
export const resolveUDim = (u, size) => (u ? u[0] * size + u[1] : 0);

// ---------- ids ----------
let idCounter = 0;
export function newId(prefix = 'n') {
  idCounter = (idCounter + 1) % 1e6;
  return prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7) + idCounter.toString(36);
}

export function formatNum(v, d = 3) {
  const r = round(v, d);
  return Object.is(r, -0) ? '0' : String(r);
}
