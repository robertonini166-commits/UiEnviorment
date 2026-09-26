// Paints the *own* visuals of one GuiObject (not its children) as an SVG string,
// following Roblox rendering rules as closely as possible:
//   UIShadow -> background (+UIGradient) -> image -> legacy border -> UIStroke (border) -> text (UIStroke contextual + fill)

import { isText, isImage } from './schema.js';
import { hexToRgb, mulColor, evalColorSequence, evalNumberSequence, clamp, round } from './types.js';
import { layoutText, scaledTextSize, applyCase } from './text.js';
import { cssFamily, emSize } from './fonts.js';
import { WEIGHTS } from './schema.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (v) => round(v, 3);

export function cornerRadii(node, w, h) {
  const c = node.children.find((x) => x.ClassName === 'UICorner');
  if (!c) return null;
  const m = Math.min(w, h);
  const P = c.props;
  const r = (u) => clamp((u ? u[0] * m + u[1] : 0), 0, m / 2);
  const base = P.CornerRadius || [0, 0];
  const tl = r(P.TopLeftRadius || base), tr = r(P.TopRightRadius || base);
  const br = r(P.BottomRightRadius || base), bl = r(P.BottomLeftRadius || base);
  return [tl, tr, br, bl];
}

/** Rounded rect path; e = outward offset (negative = inward), radii grow/shrink with it. */
export function rectPath(x, y, w, h, radii, e = 0, forceMinR = 0) {
  x -= e; y -= e; w += 2 * e; h += 2 * e;
  if (w <= 0 || h <= 0) return '';
  const m = Math.min(w, h) / 2;
  const rr = (radii || [0, 0, 0, 0]).map((r) => clamp(Math.max(r > 0 ? r + e : 0, forceMinR), 0, m));
  const [tl, tr, br, bl] = rr;
  if (!tl && !tr && !br && !bl) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
  return `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}` + (tr ? `A${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}` : '') +
    `V${f(y + h - br)}` + (br ? `A${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}` : '') +
    `H${f(x + bl)}` + (bl ? `A${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}` : '') +
    `V${f(y + tl)}` + (tl ? `A${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}` : '') + 'Z';
}

/** Merged stop list for a UIGradient multiplied by a base color/transparency. */
function gradientStops(g, baseColor, baseAlpha) {
  const cs = g.props.Color || [[0, '#FFFFFF'], [1, '#FFFFFF']];
  const ts = g.props.Transparency || [[0, 0], [1, 0]];
  const times = new Set([0, 1, ...cs.map((k) => k[0]), ...ts.map((k) => k[0])]);
  return [...times].sort((a, b) => a - b).map((t) => ({
    t,
    color: mulColor(evalColorSequence(cs, t), baseColor),
    alpha: baseAlpha * (1 - clamp(evalNumberSequence(ts, t), 0, 1)),
  }));
}

/**
 * SVG gradient definition in Roblox space. Linear gradients live in the object's
 * normalized (UV) space; radial uses pixels with radius (w+h)/4.
 */
function gradientDef(id, g, w, h, baseColor, baseAlpha) {
  const P = g.props;
  const stops = gradientStops(g, baseColor, baseAlpha).map((s) => `<stop offset="${f(s.t)}" stop-color="${s.color}" stop-opacity="${f(s.alpha)}"/>`).join('');
  const spread = P.TileMode === 'Repeat' ? 'repeat' : P.TileMode === 'Mirror' ? 'reflect' : 'pad';
  const scale = Math.max(0.001, P.Scale ?? 1);
  const [ox, oy] = P.Offset || [0, 0];
  if (P.Type === 'Radial') {
    return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(w * (0.5 + ox))}" cy="${f(h * (0.5 + oy))}" r="${f(((w + h) / 4) * scale)}" spreadMethod="${spread}">${stops}</radialGradient>`;
  }
  const rad = ((P.Rotation || 0) * Math.PI) / 180;
  const dx = Math.cos(rad), dy = Math.sin(rad);
  const half = ((Math.abs(dx) + Math.abs(dy)) / 2) * scale;
  const cx = 0.5 + ox, cy = 0.5 + oy;
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" gradientTransform="matrix(${f(w)} 0 0 ${f(h)} 0 0)" x1="${f(cx - dx * half)}" y1="${f(cy - dy * half)}" x2="${f(cx + dx * half)}" y2="${f(cy + dy * half)}" spreadMethod="${spread}">${stops}</linearGradient>`;
}

function conicCss(g, baseColor, baseAlpha, w, h) {
  const P = g.props;
  const scale = Math.max(0.001, P.Scale ?? 1);
  const stops = gradientStops(g, baseColor, baseAlpha).map((s) => {
    const [r, gg, b] = hexToRgb(s.color);
    return `rgba(${r},${gg},${b},${f(s.alpha)}) ${f(s.t * 360 * scale)}deg`;
  });
  const [ox, oy] = P.Offset || [0, 0];
  return `conic-gradient(from ${f((P.Rotation || 0) + 90)}deg at ${f((0.5 + ox) * 100)}% ${f((0.5 + oy) * 100)}%, ${stops.join(',')})`;
}

const enabled = (m) => m.props.Enabled !== false;

/**
 * @param node   GuiObject node
 * @param box    layout box {w,h,...}
 * @param ctx    { assetUrl(contentId) -> {url,width,height}|null, mode: 'edit'|'preview', state: {hover,pressed} }
 * @returns { svg: string, textSize?: number }
 */
export function paintNode(node, box, ctx = {}) {
  const P = node.props;
  const w = Math.max(0, box.w), h = Math.max(0, box.h);
  const id = 'p' + node.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const defs = [];
  const layers = [];
  const radii = cornerRadii(node, w, h);
  const shape = rectPath(0, 0, w, h, radii);
  const gradient = node.children.find((c) => c.ClassName === 'UIGradient' && enabled(c));
  const strokes = node.children.filter((c) => c.ClassName === 'UIStroke' && enabled(c)).sort((a, b) => (a.props.ZIndex || 0) - (b.props.ZIndex || 0));
  const text = isText(node.ClassName);
  const borderStrokes = strokes.filter((s) => !text || s.props.ApplyStrokeMode === 'Border');
  const textStrokes = text ? strokes.filter((s) => s.props.ApplyStrokeMode !== 'Border') : [];
  let conic = null;
  let result = {};

  // --- UIShadow ---
  const shadows = node.children.filter((c) => c.ClassName === 'UIShadow' && enabled(c)).sort((a, b) => (a.props.ZIndex || 0) - (b.props.ZIndex || 0));
  shadows.forEach((s, i) => {
    const S = s.props, m = Math.min(w, h);
    const [sxs, sxo, sys, syo] = S.Spread || [0, 0, 0, 0];
    const [oxs, oxo, oys, oyo] = S.Offset || [0, 0, 0, 0];
    const spX = sxs * w + sxo, spY = sys * h + syo;
    const blur = Math.max(0, (S.BlurRadius ? S.BlurRadius[0] * m + S.BlurRadius[1] : 0));
    const x = oxs * w + oxo - spX / 2, y = oys * h + oyo - spY / 2;
    const d = rectPath(x, y, w + spX, h + spY, radii);
    const fid = `${id}sh${i}`;
    if (blur > 0) defs.push(`<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${f(blur / 2)}"/></filter>`);
    layers.push(`<path d="${d}" fill="${S.Color || '#000000'}" fill-opacity="${f(1 - clamp(S.Transparency ?? 0, 0, 1))}"${blur > 0 ? ` filter="url(#${fid})"` : ''}/>`);
  });

  // --- background ---
  const bgA = 1 - clamp(P.BackgroundTransparency ?? 0, 0, 1);
  if (bgA > 0 && w > 0 && h > 0) {
    if (gradient && gradient.props.Type === 'Conical') {
      conic = conicCss(gradient, P.BackgroundColor3, bgA, w, h);
    } else if (gradient) {
      defs.push(gradientDef(`${id}bg`, gradient, w, h, P.BackgroundColor3, bgA));
      layers.push(`<path d="${shape}" fill="url(#${id}bg)"/>`);
    } else {
      layers.push(`<path d="${shape}" fill="${P.BackgroundColor3}" fill-opacity="${f(bgA)}"/>`);
    }
  }

  // --- image ---
  if (isImage(node.ClassName)) {
    let img = P.Image;
    if (ctx.mode === 'preview' && node.ClassName === 'ImageButton') {
      if (ctx.state?.pressed && P.PressedImage) img = P.PressedImage;
      else if (ctx.state?.hover && P.HoverImage) img = P.HoverImage;
    }
    const asset = img && ctx.assetUrl ? ctx.assetUrl(img) : null;
    const iA = 1 - clamp(P.ImageTransparency ?? 0, 0, 1);
    if (asset && asset.url && iA > 0) {
      layers.push(paintImage(node, asset, w, h, radii, shape, id, defs, gradient, iA));
    } else if (img && !asset?.url && ctx.mode !== 'export') {
      // Roblox asset without local preview
      layers.push(`<g opacity="0.55"><path d="${shape}" fill="#8b8f99" fill-opacity="0.25" stroke="#8b8f99" stroke-dasharray="4 3"/><text x="${f(w / 2)}" y="${f(h / 2)}" font-size="${f(Math.max(8, Math.min(12, w / 8)))}" fill="#dfe3ea" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${esc(String(img).replace('rbxassetid://', 'id '))}</text></g>`);
    }
  }

  // --- viewport / video placeholders ---
  if (node.ClassName === 'ViewportFrame' || node.ClassName === 'VideoFrame') {
    layers.push(`<g opacity="0.6"><path d="${shape}" fill="none" stroke="#9aa3b5" stroke-dasharray="6 4"/><text x="${f(w / 2)}" y="${f(h / 2)}" font-size="12" fill="#c7cdd8" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${node.ClassName}</text></g>`);
  }

  // --- legacy border (BorderSizePixel) ---
  const bsp = P.BorderSizePixel || 0;
  if (bsp > 0 && bgA > 0) {
    const e = P.BorderMode === 'Inset' ? -bsp / 2 : P.BorderMode === 'Middle' ? 0 : bsp / 2;
    layers.push(`<path d="${rectPath(0, 0, w, h, null, e)}" fill="none" stroke="${P.BorderColor3 || '#000000'}" stroke-opacity="${f(bgA)}" stroke-width="${bsp}" stroke-linejoin="miter"/>`);
  }

  // --- UIStroke (border) ---
  borderStrokes.forEach((s, i) => {
    const S = s.props;
    const m = Math.min(w, h);
    const T = S.StrokeSizingMode === 'ScaledSize' ? (S.Thickness || 0) * m : S.Thickness || 0;
    if (T <= 0) return;
    const off = S.BorderOffset ? S.BorderOffset[0] * m + S.BorderOffset[1] : 0;
    const pos = S.BorderStrokePosition || 'Outer';
    const e = (pos === 'Outer' ? T / 2 : pos === 'Inner' ? -T / 2 : 0) + off;
    const join = S.LineJoinMode || 'Round';
    const minR = join === 'Round' && e > 0 ? e : 0;
    const d = rectPath(0, 0, w, h, radii, e, minR);
    let paint = S.Color || '#000000';
    const sg = s.children.find((c) => c.ClassName === 'UIGradient' && enabled(c));
    const alpha = 1 - clamp(S.Transparency ?? 0, 0, 1);
    let opacityAttr = ` stroke-opacity="${f(alpha)}"`;
    if (sg && sg.props.Type !== 'Conical') {
      defs.push(gradientDef(`${id}st${i}`, sg, w, h, paint, alpha));
      paint = `url(#${id}st${i})`;
      opacityAttr = '';
    }
    layers.push(`<path d="${d}" fill="none" stroke="${paint}"${opacityAttr} stroke-width="${f(T)}" stroke-linejoin="${join === 'Miter' ? 'miter' : join === 'Bevel' ? 'bevel' : 'round'}" stroke-miterlimit="10"/>`);
  });

  // --- ScrollingFrame scrollbar ---
  if (node.ClassName === 'ScrollingFrame' && box.canvas) {
    const t = P.ScrollBarThickness ?? 12;
    const a = 1 - clamp(P.ScrollBarImageTransparency ?? 0, 0, 1);
    const dir = P.ScrollingDirection || 'XY';
    if (t > 0 && a > 0) {
      if (box.canvas.h > h + 0.5 && dir !== 'X') {
        const len = Math.max(t, (h * h) / box.canvas.h);
        const x = P.VerticalScrollBarPosition === 'Left' ? 0 : w - t;
        layers.push(`<rect x="${f(x)}" y="0" width="${t}" height="${f(len)}" fill="${P.ScrollBarImageColor3 || '#000000'}" fill-opacity="${f(a)}"/>`);
      }
      if (box.canvas.w > w + 0.5 && dir !== 'Y') {
        const len = Math.max(t, (w * w) / box.canvas.w);
        layers.push(`<rect x="0" y="${f(h - t)}" width="${f(len)}" height="${t}" fill="${P.ScrollBarImageColor3 || '#000000'}" fill-opacity="${f(a)}"/>`);
      }
    }
  }

  // --- text ---
  if (text) {
    const tr = paintText(node, box, id, defs, gradient, textStrokes, ctx);
    layers.push(tr.svg);
    result.textSize = tr.textSize;
    result.textFits = tr.fits;
  }

  const svg = `<svg class="rbx-paint" width="${f(w)}" height="${f(h)}" overflow="visible" xmlns="http://www.w3.org/2000/svg">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${layers.join('')}</svg>`;
  return Object.assign(result, { svg, conic, radii });
}

function paintImage(node, asset, w, h, radii, shape, id, defs, gradient, alpha) {
  const P = node.props;
  const iw = asset.width || w || 1, ih = asset.height || h || 1;
  const href = esc(asset.url);
  const pix = P.ResampleMode === 'Pixelated' ? ' style="image-rendering:pixelated"' : '';
  const rs = P.ImageRectSize || [0, 0];
  const ro = P.ImageRectOffset || [0, 0];
  const useRect = rs[0] > 0 && rs[1] > 0;
  const vb = useRect ? [ro[0], ro[1], rs[0], rs[1]] : [0, 0, iw, ih];
  const clipId = `${id}ic`;
  defs.push(`<clipPath id="${clipId}"><path d="${shape}"/></clipPath>`);
  let body = '';
  const st = P.ScaleType || 'Stretch';
  const sub = (x, y, ww, hh, vx, vy, vw, vh, par = 'none') =>
    ww > 0 && hh > 0 && vw > 0 && vh > 0 ? `<svg x="${f(x)}" y="${f(y)}" width="${f(ww)}" height="${f(hh)}" viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}" preserveAspectRatio="${par}" overflow="hidden"><image href="${href}" width="${iw}" height="${ih}" preserveAspectRatio="none"${pix}/></svg>` : '';
  if (st === 'Slice') {
    const sc = P.SliceCenter || [0, 0, 0, 0];
    let [x0, y0, x1, y1] = sc;
    if (!(x1 > x0) || !(y1 > y0)) [x0, y0, x1, y1] = [0, 0, iw, ih];
    const s = P.SliceScale ?? 1;
    const L = x0 * s, T = y0 * s, R = (iw - x1) * s, B = (ih - y1) * s;
    const cols = [[0, L, 0, x0], [L, w - L - R, x0, x1 - x0], [w - R, R, x1, iw - x1]];
    const rows = [[0, T, 0, y0], [T, h - T - B, y0, y1 - y0], [h - B, B, y1, ih - y1]];
    for (const [dx, dw, sx, sw] of cols) for (const [dy, dh, sy, sh] of rows) body += sub(dx, dy, dw, dh, sx, sy, sw, sh);
  } else if (st === 'Tile') {
    const ts = P.TileSize || [1, 0, 1, 0];
    const tw = ts[0] * w + ts[1], th = ts[2] * h + ts[3];
    if (tw > 0.5 && th > 0.5) {
      defs.push(`<pattern id="${id}tile" patternUnits="userSpaceOnUse" width="${f(tw)}" height="${f(th)}">${sub(0, 0, tw, th, ...vb)}</pattern>`);
      body = `<rect width="${f(w)}" height="${f(h)}" fill="url(#${id}tile)"/>`;
    }
  } else {
    const par = st === 'Fit' ? 'xMidYMid meet' : st === 'Crop' ? 'xMidYMid slice' : 'none';
    body = sub(0, 0, w, h, ...vb, par);
  }
  // tint (multiply) via color matrix
  const [r, g, b] = (P.ImageColor3 && P.ImageColor3 !== '#FFFFFF') ? hexToRgb(P.ImageColor3) : [255, 255, 255];
  let filter = '';
  if (r !== 255 || g !== 255 || b !== 255) {
    defs.push(`<filter id="${id}tint" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${f(r / 255)} 0 0 0 0 0 ${f(g / 255)} 0 0 0 0 0 ${f(b / 255)} 0 0 0 0 0 1 0"/></filter>`);
    filter = ` filter="url(#${id}tint)"`;
  }
  let out = `<g clip-path="url(#${clipId})" opacity="${f(alpha)}"><g${filter}>${body}</g>`;
  if (gradient && gradient.props.Type !== 'Conical') {
    // gradient multiplies color and alpha of the image
    defs.push(gradientDef(`${id}ig`, gradient, w, h, '#FFFFFF', 1));
    const gc = { props: Object.assign({}, gradient.props, { Transparency: [[0, 0], [1, 0]] }) };
    const ga = { props: Object.assign({}, gradient.props, { Color: [[0, '#FFFFFF'], [1, '#FFFFFF']] }) };
    defs.push(gradientDef(`${id}igc`, gc, w, h, '#FFFFFF', 1));
    defs.push(`<mask id="${id}igm" maskUnits="userSpaceOnUse" x="0" y="0" width="${f(w)}" height="${f(h)}" style="mask-type:alpha">${gradientDef(`${id}iga`, ga, w, h, '#FFFFFF', 1)}<rect width="${f(w)}" height="${f(h)}" fill="url(#${id}iga)"/></mask>`);
    defs.push(`<mask id="${id}imgm" maskUnits="userSpaceOnUse" x="0" y="0" width="${f(w)}" height="${f(h)}" style="mask-type:alpha">${body}</mask>`);
    out = `<g clip-path="url(#${clipId})" opacity="${f(alpha)}" mask="url(#${id}igm)"><g style="isolation:isolate"><g${filter}>${body}</g><rect width="${f(w)}" height="${f(h)}" fill="url(#${id}igc)" mask="url(#${id}imgm)" style="mix-blend-mode:multiply"/></g>`;
  }
  return out + '</g>';
}

function textStyleBase(P) {
  const ff = P.FontFace || { family: 'Montserrat', weight: 'Regular', style: 'Normal' };
  return { family: ff.family, weight: ff.weight, italic: ff.style === 'Italic', size: P.TextSize || 14, color: P.TextColor3 || '#000000', transparency: 0 };
}

/** Effective text size (TextScaled + UITextSizeConstraint) and layout for a text node inside its box. */
export function textLayoutFor(node, box, overrideWidth) {
  const P = node.props;
  const pad = box.pad || { l: 0, r: 0, t: 0, b: 0 };
  const w = overrideWidth ?? Math.max(0, box.w - pad.l - pad.r);
  const h = Math.max(0, box.h - pad.t - pad.b);
  const base = textStyleBase(P);
  let content = P.Text ?? '';
  let placeholder = false;
  if (node.ClassName === 'TextBox' && !content && P.PlaceholderText) {
    content = P.PlaceholderText;
    placeholder = true;
    base.color = P.PlaceholderColor3 || '#B2B2B2';
  }
  const tsc = node.children.find((c) => c.ClassName === 'UITextSizeConstraint');
  const minS = tsc ? tsc.props.MinTextSize ?? 1 : 1;
  const maxS = tsc ? tsc.props.MaxTextSize ?? 100 : 100;
  const opts = {
    text: content, rich: !!P.RichText && !placeholder, base, width: w, height: h,
    wrapped: !!P.TextWrapped || !!P.TextScaled, truncate: P.TextTruncate || 'None',
    xAlign: P.TextXAlignment || 'Center', yAlign: P.TextYAlignment || 'Center', lineHeight: P.LineHeight || 1,
    maxGraphemes: P.MaxVisibleGraphemes,
  };
  if (P.TextScaled) base.size = scaledTextSize(opts, minS, maxS);
  else if (tsc) base.size = clamp(base.size, minS, maxS);
  const lay = layoutText(opts);
  return { lay, base, pad, w, h, placeholder };
}

function paintText(node, box, id, defs, gradient, textStrokes, ctx) {
  const P = node.props;
  const { lay, base, pad } = textLayoutFor(node, box);
  const textA = 1 - clamp(P.TextTransparency ?? 0, 0, 1);
  const fillPaint = !!(gradient && gradient.props.Type !== 'Conical');
  const gradIds = new Set();
  const strokeParts = [], fillParts = [], decoParts = [];
  const legacyA = 1 - clamp(P.TextStrokeTransparency ?? 1, 0, 1);
  for (const ln of lay.lines) {
    for (const p of ln.pieces) {
      if (!p.text || /^\s+$/.test(p.text)) {
        if (p.style.mark) decoParts.push(markRect(p, ln, pad));
        continue;
      }
      const st = p.style;
      const size = st.smallcaps ? st.size * 0.8 : st.size;
      const em = emSize(st.family, size);
      const weight = WEIGHTS[st.weight] || 400;
      const x = pad.l + p.x, y = pad.t + ln.baseline;
      const fontAttrs = `font-family="${cssFamily(st.family)}" font-size="${f(em)}" font-weight="${weight}"${st.italic ? ' font-style="italic"' : ''} xml:space="preserve"`;
      const txt = esc(applyCase(p.text, st));
      const a = textA * (1 - clamp(st.transparency || 0, 0, 1));
      if (st.mark) decoParts.push(markRect(p, ln, pad));
      // strokes: UIStroke (contextual), rich <stroke>, legacy TextStroke
      const strokesHere = [];
      if (legacyA > 0) strokesHere.push({ color: P.TextStrokeColor3 || '#000000', T: 1, alpha: legacyA, join: 'round' });
      for (const s of textStrokes) {
        const S = s.props;
        const T = S.StrokeSizingMode === 'ScaledSize' ? (S.Thickness || 0) * size : S.Thickness || 0;
        let color = S.Color || '#000000';
        let paintRef = null;
        const sg = s.children.find((c) => c.ClassName === 'UIGradient' && enabled(c));
        if (sg && sg.props.Type !== 'Conical') {
          const gid = `${id}ts${strokeParts.length}`;
          defs.push(gradientDef(gid, sg, box.w, box.h, color, 1));
          paintRef = `url(#${gid})`;
        }
        strokesHere.push({ color: paintRef || color, T, alpha: 1 - clamp(S.Transparency ?? 0, 0, 1), join: (S.LineJoinMode || 'Round').toLowerCase() });
      }
      if (st.stroke) strokesHere.push({ color: st.stroke.color, T: st.stroke.thickness, alpha: 1 - clamp(st.stroke.transparency, 0, 1), join: st.stroke.joins });
      for (const s of strokesHere) {
        if (s.T <= 0 || s.alpha <= 0) continue;
        strokeParts.push(`<text x="${f(x)}" y="${f(y)}" ${fontAttrs} fill="none" stroke="${s.color}" stroke-opacity="${f(s.alpha)}" stroke-width="${f(s.T * 2)}" stroke-linejoin="${s.join === 'miter' ? 'miter' : s.join === 'bevel' ? 'bevel' : 'round'}">${txt}</text>`);
      }
      let fillColor = st.color;
      if (fillPaint) {
        // UIGradient multiplies the text color: one gradient per distinct color
        const gid = `${id}tx${st.color.slice(1)}`;
        if (!gradIds.has(gid)) {
          gradIds.add(gid);
          defs.push(gradientDef(gid, gradient, box.w, box.h, st.color, 1));
        }
        fillColor = `url(#${gid})`;
      }
      if (a > 0) fillParts.push(`<text x="${f(x)}" y="${f(y)}" ${fontAttrs} fill="${fillColor}" fill-opacity="${f(a)}">${txt}</text>`);
      if (st.underline || st.strike) {
        const th = Math.max(1, size * 0.06);
        if (st.underline) decoParts.push(`<rect x="${f(x)}" y="${f(y + size * 0.1)}" width="${f(p.width)}" height="${f(th)}" fill="${st.color}" fill-opacity="${f(a)}"/>`);
        if (st.strike) decoParts.push(`<rect x="${f(x)}" y="${f(y - size * 0.28)}" width="${f(p.width)}" height="${f(th)}" fill="${st.color}" fill-opacity="${f(a)}"/>`);
      }
    }
  }
  const marks = decoParts.filter((d) => d.startsWith('<rect data-mark'));
  const decos = decoParts.filter((d) => !d.startsWith('<rect data-mark'));
  const svg = `<g class="rbx-text">${marks.join('')}${strokeParts.join('')}${fillParts.join('')}${decos.join('')}</g>`;
  return { svg, textSize: base.size, fits: lay.fits };
}

function markRect(p, ln, pad) {
  const m = p.style.mark;
  return `<rect data-mark="1" x="${f(pad.l + p.x)}" y="${f(pad.t + ln.y)}" width="${f(p.width)}" height="${f(ln.height)}" fill="${m.color}" fill-opacity="${f(1 - clamp(m.transparency, 0, 1))}"/>`;
}

export { textStyleBase };
