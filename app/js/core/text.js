// Roblox text: rich text parsing + line layout (wrapping, truncation, TextScaled).
// Produces positioned runs that the painter renders as SVG <text>.

import { measureWidth, ascentRatio } from './fonts.js';
import { resolveFontFamily, weightName, WEIGHTS } from './schema.js';
import { normColor } from './types.js';

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' };
const decode = (s) => s.replace(/&(lt|gt|quot|apos|amp);/g, (m) => ENTITIES[m]);

function parseAttrs(s) {
  const out = {};
  s.replace(/([a-zA-Z]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (_, k, __, a, b) => {
    out[k.toLowerCase()] = a ?? b;
    return '';
  });
  return out;
}

function parseColor(v) {
  if (!v) return null;
  try {
    return normColor(v);
  } catch {
    return null;
  }
}

/**
 * Parses Roblox rich text into segments: [{ text, style }] with '\n' as own segments.
 * base = { family, weight, italic, size, color, transparency }
 */
export function parseRichText(src, base, rich) {
  const segs = [];
  if (!rich) {
    const t = String(src ?? '');
    t.split('\n').forEach((line, i) => {
      if (i) segs.push({ text: '\n', style: base });
      if (line) segs.push({ text: line, style: base });
    });
    return segs;
  }
  const stack = [Object.assign({}, base)];
  const top = () => stack[stack.length - 1];
  const re = /<!--[\s\S]*?-->|<\s*(\/?)\s*([a-zA-Z]+)([^>]*?)\/?\s*>|([^<]+|<)/g;
  let m;
  const s = String(src ?? '');
  while ((m = re.exec(s))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[4] !== undefined) {
      const txt = decode(m[4]);
      txt.split('\n').forEach((line, i) => {
        if (i) segs.push({ text: '\n', style: top() });
        if (line) segs.push({ text: line, style: top() });
      });
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'br') {
      segs.push({ text: '\n', style: top() });
      continue;
    }
    const known = ['b', 'i', 'u', 's', 'font', 'stroke', 'uppercase', 'uc', 'smallcaps', 'sc', 'mark'];
    if (!known.includes(tag)) {
      // Roblox renders unknown tags literally
      segs.push({ text: m[0], style: top() });
      continue;
    }
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const st = Object.assign({}, top());
    const a = parseAttrs(m[3] || '');
    switch (tag) {
      case 'b': st.weight = 'Bold'; break;
      case 'i': st.italic = true; break;
      case 'u': st.underline = true; break;
      case 's': st.strike = true; break;
      case 'uppercase': case 'uc': st.upper = true; break;
      case 'smallcaps': case 'sc': st.smallcaps = true; break;
      case 'mark':
        st.mark = { color: parseColor(a.color) || '#FFFF00', transparency: a.transparency != null ? +a.transparency : 0 };
        break;
      case 'stroke':
        st.stroke = {
          color: parseColor(a.color) || '#000000',
          thickness: a.thickness != null ? +a.thickness : 1,
          transparency: a.transparency != null ? +a.transparency : 0,
          joins: (a.joins || 'round').toLowerCase(),
        };
        break;
      case 'font':
        if (a.color) st.color = parseColor(a.color) || st.color;
        if (a.size) st.size = +a.size || st.size;
        if (a.face || a.family) st.family = resolveFontFamily(a.face || a.family) || st.family;
        if (a.weight) st.weight = /^\d+$/.test(a.weight) ? weightName(+a.weight) : (Object.keys(WEIGHTS).find((k) => k.toLowerCase() === a.weight.toLowerCase()) || st.weight);
        if (a.transparency) st.transparency = +a.transparency;
        break;
    }
    stack.push(st);
  }
  return segs;
}

function applyCase(text, st) {
  return st.upper ? text.toUpperCase() : st.smallcaps ? text.toUpperCase() : text;
}

function pieceWidth(text, st) {
  const size = st.smallcaps ? st.size * 0.8 : st.size;
  return measureWidth(applyCase(text, st), st.family, st.weight, st.italic ? 'Italic' : 'Normal', size);
}

/**
 * Lays out text inside a box.
 * opts: { text, rich, base, width, height, wrapped, truncate, xAlign, yAlign, lineHeight, maxGraphemes }
 * returns { lines: [{ y, height, baseline, width, x, pieces: [{ text, style, x, width }] }], bounds: {w,h}, fits }
 */
export function layoutText(opts) {
  const { base, width, height, wrapped, truncate = 'None', xAlign = 'Center', yAlign = 'Center', lineHeight = 1 } = opts;
  let segs = parseRichText(opts.text, base, opts.rich);
  if (opts.maxGraphemes != null && opts.maxGraphemes >= 0) {
    let left = opts.maxGraphemes;
    segs = segs.map((s) => {
      if (s.text === '\n') return s;
      const chars = [...s.text];
      const take = chars.slice(0, Math.max(0, left));
      left -= take.length;
      return { text: take.join(''), style: s.style };
    }).filter((s) => s.text);
  }

  // tokenise into words / spaces keeping styles
  const tokens = [];
  for (const s of segs) {
    if (s.text === '\n') {
      tokens.push({ br: true, style: s.style });
      continue;
    }
    for (const part of s.text.split(/(\s+)/)) if (part) tokens.push({ text: part, style: s.style, space: /^\s+$/.test(part) });
  }

  const lines = [];
  let cur = { pieces: [], width: 0, maxSize: base.size };
  const pushLine = () => {
    // trim trailing spaces from width
    while (cur.pieces.length && cur.pieces[cur.pieces.length - 1].space) {
      cur.width -= cur.pieces[cur.pieces.length - 1].width;
      cur.pieces.pop();
    }
    lines.push(cur);
    cur = { pieces: [], width: 0, maxSize: base.size };
  };
  const addPiece = (text, style, space) => {
    const w = pieceWidth(text, style);
    cur.pieces.push({ text, style, width: w, space });
    cur.width += w;
    cur.maxSize = Math.max(cur.maxSize, style.size);
  };

  for (const t of tokens) {
    if (t.br) {
      cur.maxSize = Math.max(cur.maxSize, t.style.size);
      pushLine();
      continue;
    }
    const w = pieceWidth(t.text, t.style);
    if (!wrapped || cur.width + w <= width + 0.01 || (t.space && !cur.pieces.length)) {
      if (t.space && wrapped && cur.width + w > width + 0.01) continue; // spaces at wrap point vanish
      addPiece(t.text, t.style, t.space);
      continue;
    }
    if (t.space) {
      pushLine();
      continue;
    }
    if (cur.pieces.length) pushLine();
    if (w <= width + 0.01) {
      addPiece(t.text, t.style, false);
      continue;
    }
    // word longer than the line: break by characters
    let chunk = '';
    for (const ch of [...t.text]) {
      if (chunk && pieceWidth(chunk + ch, t.style) > width + 0.01) {
        addPiece(chunk, t.style, false);
        pushLine();
        chunk = '';
      }
      chunk += ch;
    }
    if (chunk) addPiece(chunk, t.style, false);
  }
  if (cur.pieces.length || !lines.length || tokens.length && tokens[tokens.length - 1].br) pushLine();

  // vertical metrics: first line = its size; subsequent lines advance by size*lineHeight
  let y = 0;
  lines.forEach((ln, i) => {
    const h = ln.maxSize;
    const adv = i === 0 ? h : h * lineHeight;
    if (i > 0) y += adv - h;
    ln.y = y;
    ln.height = h;
    ln.baseline = y + h * ascentRatio(base.family);
    y += h;
  });
  let totalH = y;
  let maxW = Math.max(0, ...lines.map((l) => l.width));
  let fits = maxW <= width + 0.5 && totalH <= height + 0.5;

  // truncation
  if (truncate !== 'None' && !fits && lines.length) {
    const ell = '...';
    let visible = lines;
    if (wrapped) {
      visible = lines.filter((l) => l.y + l.height <= height + 0.5);
      if (!visible.length) visible = [lines[0]];
    } else visible = lines.slice(0, Math.max(1, lines.filter((l) => l.y + l.height <= height + 0.5).length));
    const last = visible[visible.length - 1];
    const truncated = visible.length < lines.length || last.width > width + 0.5;
    if (truncated) {
      const st = last.pieces.length ? last.pieces[last.pieces.length - 1].style : base;
      const ellW = pieceWidth(ell, st);
      // remove pieces/characters until it fits with ellipsis
      const avail = width - ellW;
      let acc = 0;
      const out = [];
      for (const p of last.pieces) {
        if (acc + p.width <= avail) {
          out.push(p);
          acc += p.width;
          continue;
        }
        if (truncate === 'SplitWord' || !out.length) {
          let s = '';
          for (const ch of [...p.text]) {
            if (acc + pieceWidth(s + ch, p.style) > avail) break;
            s += ch;
          }
          if (s) {
            const w = pieceWidth(s, p.style);
            out.push({ text: s, style: p.style, width: w });
            acc += w;
          }
        }
        break;
      }
      while (out.length && out[out.length - 1].space) acc -= out.pop().width;
      out.push({ text: ell, style: st, width: ellW });
      last.pieces = out;
      last.width = acc + ellW;
      lines.length = 0;
      lines.push(...visible);
      totalH = last.y + last.height;
      maxW = Math.max(0, ...lines.map((l) => l.width));
    }
  }

  // alignment
  const offY = yAlign === 'Top' ? 0 : yAlign === 'Bottom' ? height - totalH : (height - totalH) / 2;
  for (const ln of lines) {
    ln.x = xAlign === 'Left' ? 0 : xAlign === 'Right' ? width - ln.width : (width - ln.width) / 2;
    ln.y += offY;
    ln.baseline += offY;
    let x = ln.x;
    for (const p of ln.pieces) {
      p.x = x;
      x += p.width;
    }
  }
  return { lines, bounds: { w: maxW, h: totalH }, fits };
}

/** Largest integer TextSize (1..100, clamped by constraint) that makes the text fit (Roblox TextScaled). */
export function scaledTextSize(opts, min = 1, max = 100) {
  let lo = Math.max(1, Math.floor(min)), hi = Math.min(100, Math.floor(max)), best = lo;
  if (hi < lo) return lo;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = layoutText(Object.assign({}, opts, { base: Object.assign({}, opts.base, { size: mid }), wrapped: true, truncate: 'None' }));
    if (r.fits) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

/** Plain-text bounds (used by AutomaticSize). */
export function textBounds(opts) {
  return layoutText(Object.assign({}, opts, { truncate: 'None' })).bounds;
}

export { applyCase };
