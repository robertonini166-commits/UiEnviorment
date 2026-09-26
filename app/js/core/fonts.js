// Font registry: loads the bundled OFL versions of Roblox's font families and exposes
// metrics so text renders at Roblox's size. In Roblox, TextSize is the height of one
// line (ascent + descent), while CSS font-size is the em square. We convert with
// em = TextSize * unitsPerEm / (ascent - descent).

import { FONT_FAMILIES } from './fonts-data.js';
import { WEIGHTS } from './schema.js';

export { FONT_FAMILIES };

const byId = Object.fromEntries(FONT_FAMILIES.map((f) => [f.id, f]));
let baseUrl = new URL('../../fonts/', import.meta.url).href;
const userFaces = new Map(); // id -> [{weight, style, url}] (fonts imported by the user, e.g. Builder Sans from Studio)
let robloxMetrics = true;

export function setFontBaseUrl(u) {
  baseUrl = u;
}
export function setRobloxTextMetrics(on) {
  robloxMetrics = !!on;
}
export function usingRobloxMetrics() {
  return robloxMetrics;
}

export function familyInfo(id) {
  return byId[id] || byId.Montserrat;
}

/** Family actually used for preview (own files, user-imported files, or an approximation). */
export function previewFamily(id) {
  const f = familyInfo(id);
  if (userFaces.has(f.id) || f.faces.length) return f;
  const approx = FONT_FAMILIES.find((x) => x.name === f.approx);
  return approx || byId.Montserrat;
}

export const cssFamily = (id) => `RbxF-${previewFamily(id).id}${userFaces.has(id) ? '-user' : ''}`;
export const isApproximated = (id) => !familyInfo(id).faces.length && !userFaces.has(id);

export function availableWeights(id) {
  const u = userFaces.get(id);
  const faces = u || previewFamily(id).faces;
  return [...new Set(faces.filter((f) => f.style === 'Normal').map((f) => f.weight))].sort((a, b) => a - b);
}

/** Line-height-to-em ratio for a family: (ascent - descent) / unitsPerEm */
export function lineScale(id) {
  const f = previewFamily(id);
  const m = f.metrics;
  if (!m || !robloxMetrics) return 1;
  const asc = m.useTypo ? m.typoAscent : m.hheaAscent;
  const desc = m.useTypo ? m.typoDescent : m.hheaDescent;
  return (asc - desc) / m.upm;
}

/** Ascent (from top of line box) as fraction of the line height. */
export function ascentRatio(id) {
  const f = previewFamily(id);
  const m = f.metrics;
  if (!m) return 0.8;
  const asc = m.useTypo ? m.typoAscent : m.hheaAscent;
  const desc = m.useTypo ? m.typoDescent : m.hheaDescent;
  return asc / (asc - desc);
}

/** CSS px font-size (em) for a Roblox TextSize. */
export const emSize = (id, textSize) => textSize / lineScale(id);

// ---------- loading (browser only) ----------
const loaded = new Set();
const pending = new Map();
const hasDom = typeof document !== 'undefined' && typeof FontFace !== 'undefined';

function faceKey(id, weight, style) {
  return `${id}|${weight}|${style}`;
}

/** Nearest available face (CSS font matching rules, simplified). */
function nearestFace(faces, weight, style) {
  const same = faces.filter((f) => f.style === style);
  const pool = same.length ? same : faces;
  let best = pool[0], bd = Infinity;
  for (const f of pool) {
    const d = Math.abs(f.weight - weight) + (f.weight < weight && weight > 500 ? 0.5 : 0);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

export function ensureFont(id, weightName = 'Regular', style = 'Normal') {
  if (!hasDom) return Promise.resolve();
  const weight = typeof weightName === 'number' ? weightName : WEIGHTS[weightName] || 400;
  const fam = previewFamily(id);
  const user = userFaces.get(id);
  const faces = user || fam.faces;
  if (!faces.length) return Promise.resolve();
  const face = nearestFace(faces, weight, style);
  const key = faceKey(user ? id + '-user' : fam.id, face.weight, face.style);
  if (loaded.has(key)) return Promise.resolve();
  if (pending.has(key)) return pending.get(key);
  const url = face.url || baseUrl + face.file;
  const ff = new FontFace(cssFamily(id), `url(${JSON.stringify(url)})`, {
    weight: String(face.weight), style: face.style === 'Italic' ? 'italic' : 'normal', display: 'block',
  });
  const p = ff.load().then((f) => {
    document.fonts.add(f);
    loaded.add(key);
    pending.delete(key);
  }).catch((e) => {
    pending.delete(key);
    console.warn('No se pudo cargar la fuente', id, e);
  });
  pending.set(key, p);
  return p;
}

export function isFontLoaded(id, weightName = 'Regular', style = 'Normal') {
  const weight = typeof weightName === 'number' ? weightName : WEIGHTS[weightName] || 400;
  const fam = previewFamily(id);
  const user = userFaces.get(id);
  const faces = user || fam.faces;
  if (!faces.length) return true;
  const face = nearestFace(faces, weight, style);
  return loaded.has(faceKey(user ? id + '-user' : fam.id, face.weight, face.style));
}

/** Loads all fonts used in a set of nodes. */
export function ensureFontsFor(nodes) {
  const ps = [];
  for (const n of nodes) {
    const f = n.props?.FontFace;
    if (f) ps.push(ensureFont(f.family, f.weight, f.style));
    // rich text may reference faces too; load regular + bold variants
    if (f && n.props.RichText) {
      ps.push(ensureFont(f.family, 'Bold', f.style));
      const faces = String(n.props.Text || '').match(/(?:face|family)\s*=\s*["']([^"']+)["']/g) || [];
      for (const m of faces) ps.push(ensureFont(m.replace(/.*=\s*["']|["']$/g, '').replace(/.*families\/|\.json$/g, ''), f.weight, f.style));
    }
  }
  return Promise.all(ps);
}

/** Registers a user-provided font file (e.g. from Roblox Studio's content/fonts folder). */
export async function registerUserFont(id, weight, style, url) {
  if (!byId[id]) throw new Error('Familia de Roblox desconocida: ' + id);
  const arr = userFaces.get(id) || [];
  arr.push({ weight, style, url });
  userFaces.set(id, arr);
  await ensureFont(id, weight, style);
}

export function userFontList() {
  return [...userFaces.entries()].map(([id, faces]) => ({ id, faces }));
}

// ---------- measuring ----------
let ctx = null;
const widthCache = new Map();

export function fontCss(id, weightName, style, textSize) {
  const w = typeof weightName === 'number' ? weightName : WEIGHTS[weightName] || 400;
  return `${style === 'Italic' ? 'italic ' : ''}${w} ${emSize(id, textSize)}px "${cssFamily(id)}", sans-serif`;
}

export function measureWidth(text, id, weightName, style, textSize) {
  if (!text) return 0;
  const font = fontCss(id, weightName, style, 100);
  const key = font + '\u0000' + text;
  let w = widthCache.get(key);
  if (w === undefined) {
    if (!ctx) {
      if (typeof OffscreenCanvas !== 'undefined') ctx = new OffscreenCanvas(8, 8).getContext('2d');
      else if (typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d');
    }
    if (ctx) {
      ctx.font = font;
      w = ctx.measureText(text).width;
    } else {
      w = text.length * 55; // node fallback approximation
    }
    if (widthCache.size > 20000) widthCache.clear();
    // Only cache once the font is really available; otherwise we'd cache fallback widths.
    if (isFontLoaded(id, weightName, style)) widthCache.set(key, w);
  }
  return (w * textSize) / 100;
}

export function clearMeasureCache() {
  widthCache.clear();
}
