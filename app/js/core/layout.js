// Roblox GUI layout engine.
// Computes, for every node of a ScreenGui tree, the box Roblox would give it:
//   { x, y, w, h }        position relative to the parent's box (DOM parent) and size
//   { ax, ay }            absolute position inside the screen (ignores rotation/UIScale of ancestors)
//   rot, scale, anchor    own rotation (deg), own UIScale and AnchorPoint (for transforms)
//   content {x,y,w,h}     area where children are placed (after UIPadding / canvas)
// Rotation and UIScale are visual transforms (children inherit them through nesting),
// exactly like Roblox, so layout itself is done in unrotated space.

import { isGuiObject, isText, isLayout } from './schema.js';

const vis = (n) => n.props.Visible !== false;

function mod(node, cls) {
  for (const c of node.children) if (c.ClassName === cls) return c;
  return null;
}

function padding(node, w, h) {
  const p = mod(node, 'UIPadding');
  if (!p) return { l: 0, r: 0, t: 0, b: 0 };
  const P = p.props;
  const u = (v, s) => (v ? v[0] * s + v[1] : 0);
  return { l: u(P.PaddingLeft, w), r: u(P.PaddingRight, w), t: u(P.PaddingTop, h), b: u(P.PaddingBottom, h) };
}

function applyConstraints(node, w, h) {
  const sc = mod(node, 'UISizeConstraint');
  if (sc) {
    const [minx, miny] = sc.props.MinSize || [0, 0];
    const [maxx, maxy] = sc.props.MaxSize || [Infinity, Infinity];
    w = Math.min(Math.max(w, minx), maxx >= 1e9 ? Infinity : maxx);
    h = Math.min(Math.max(h, miny), maxy >= 1e9 ? Infinity : maxy);
  }
  const ar = mod(node, 'UIAspectRatioConstraint');
  if (ar) {
    const r = ar.props.AspectRatio > 0 ? ar.props.AspectRatio : 1;
    if (ar.props.AspectType === 'ScaleWithParentSize') {
      if (ar.props.DominantAxis === 'Height') w = h * r;
      else h = w / r;
    } else if (w / Math.max(h, 1e-9) > r) w = h * r;
    else h = w / r;
  }
  return [Math.max(0, w), Math.max(0, h)];
}

/** Size of a GuiObject given its parent's content area size. */
export function computeSize(node, areaW, areaH) {
  const S = node.props.Size || [0, 0, 0, 0];
  const sc = node.props.SizeConstraint;
  const bx = sc === 'RelativeYY' ? areaH : areaW;
  const by = sc === 'RelativeXX' ? areaW : areaH;
  return applyConstraints(node, S[0] * bx + S[1], S[2] * by + S[3]);
}

function sortItems(items, sortOrder) {
  const indexed = items.map((n, i) => ({ n, i }));
  indexed.sort((a, b) => {
    if (sortOrder === 'Name') return a.n.Name < b.n.Name ? -1 : a.n.Name > b.n.Name ? 1 : a.i - b.i;
    if (sortOrder === 'LayoutOrder') return (a.n.props.LayoutOrder || 0) - (b.n.props.LayoutOrder || 0) || a.i - b.i;
    return a.i - b.i;
  });
  return indexed.map((x) => x.n);
}

/**
 * @param {object} screen ScreenGui node (with design.width/height)
 * @param {object} opts { measureText(node, maxW) -> {w,h}, width, height }
 * @returns {Map<string, object>}
 */
export function layoutScreen(screen, opts = {}) {
  const W = opts.width ?? screen.design?.width ?? 1280;
  const H = opts.height ?? screen.design?.height ?? 720;
  const boxes = new Map();
  const root = { x: 0, y: 0, w: W, h: H, ax: 0, ay: 0, rot: 0, scale: 1, anchor: [0, 0], content: { x: 0, y: 0, w: W, h: H } };
  boxes.set(screen.id, root);
  layoutChildren(screen, root, boxes, opts);
  return boxes;
}

/** GuiObject children of a node, flattening Folders (their children are laid out in the same area). */
function layoutChildren(node, box, boxes, opts) {
  const area = box.content;
  const guis = [];
  const folders = [];
  for (const c of node.children) {
    if (isGuiObject(c.ClassName)) guis.push(c);
    else if (c.ClassName === 'Folder') folders.push(c);
  }
  // Folders: occupy parent's content area, children laid out inside with their own layouts
  for (const f of folders) {
    const fb = { x: area.x, y: area.y, w: area.w, h: area.h, ax: box.ax + area.x, ay: box.ay + area.y, rot: 0, scale: 1, anchor: [0, 0], folder: true, content: { x: 0, y: 0, w: area.w, h: area.h } };
    boxes.set(f.id, fb);
    layoutChildren(f, fb, boxes, opts);
  }
  const layout = node.children.find((c) => isLayout(c.ClassName));
  if (layout) {
    const items = sortItems(guis.filter(vis), layout.props.SortOrder);
    if (layout.ClassName === 'UIListLayout') listLayout(layout, items, box, boxes, opts);
    else if (layout.ClassName === 'UIGridLayout') gridLayout(layout, items, box, boxes, opts);
    else pageLayout(layout, items, box, boxes, opts);
    for (const c of guis) if (!boxes.has(c.id)) placeFree(c, box, boxes, opts); // invisible ones
  } else {
    for (const c of guis) placeFree(c, box, boxes, opts);
  }
}

function finishBox(node, box, parentBox, boxes, opts) {
  box.ax = parentBox.ax + box.x;
  box.ay = parentBox.ay + box.y;
  box.rot = node.props.Rotation || 0;
  const us = mod(node, 'UIScale');
  box.scale = us ? us.props.Scale ?? 1 : 1;
  box.anchor = node.props.AnchorPoint || [0, 0];
  const pad = padding(node, box.w, box.h);
  box.pad = pad;
  box.content = { x: pad.l, y: pad.t, w: Math.max(0, box.w - pad.l - pad.r), h: Math.max(0, box.h - pad.t - pad.b) };
  if (node.ClassName === 'ScrollingFrame') {
    const cs = node.props.CanvasSize || [0, 0, 0, 0];
    const cw = cs[0] * box.w + cs[1], ch = cs[2] * box.h + cs[3];
    box.canvas = { w: Math.max(cw, box.w), h: Math.max(ch, box.h) };
    box.content = { x: pad.l, y: pad.t, w: Math.max(0, box.canvas.w - pad.l - pad.r), h: Math.max(0, box.canvas.h - pad.t - pad.b) };
  }
  boxes.set(node.id, box);
  layoutChildren(node, box, boxes, opts);
  autoSize(node, box, boxes, opts, parentBox);
}

/** AutomaticSize: grow to fit content (text or children), then re-layout children once. */
function autoSize(node, box, boxes, opts, parentBox) {
  const mode = node.ClassName === 'ScrollingFrame' ? node.props.AutomaticCanvasSize : node.props.AutomaticSize;
  if (!mode || mode === 'None') return;
  const pad = box.pad;
  let cw = 0, ch = 0;
  if (isText(node.ClassName) && opts.measureText) {
    const maxW = node.props.TextWrapped && mode === 'Y' ? box.w - pad.l - pad.r : Infinity;
    const b = opts.measureText(node, maxW);
    cw = b.w;
    ch = b.h;
  }
  const collect = (n) => {
    for (const c of n.children) {
      if (c.ClassName === 'Folder') {
        collect(c);
        continue;
      }
      if (!isGuiObject(c.ClassName) || !vis(c)) continue;
      const b = boxes.get(c.id);
      if (!b) continue;
      cw = Math.max(cw, b.x - pad.l + b.w);
      ch = Math.max(ch, b.y - pad.t + b.h);
    }
  };
  collect(node);
  if (box.layoutExtent) {
    cw = Math.max(cw, box.layoutExtent.w);
    ch = Math.max(ch, box.layoutExtent.h);
  }
  const needW = cw + pad.l + pad.r, needH = ch + pad.t + pad.b;
  if (node.ClassName === 'ScrollingFrame') {
    let changed = false;
    if ((mode === 'X' || mode === 'XY') && needW > box.canvas.w) {
      box.canvas.w = needW;
      changed = true;
    }
    if ((mode === 'Y' || mode === 'XY') && needH > box.canvas.h) {
      box.canvas.h = needH;
      changed = true;
    }
    if (changed) box.content = { x: pad.l, y: pad.t, w: box.canvas.w - pad.l - pad.r, h: box.canvas.h - pad.t - pad.b };
    return;
  }
  let nw = box.w, nh = box.h;
  if ((mode === 'X' || mode === 'XY') && needW > nw) nw = needW;
  if ((mode === 'Y' || mode === 'XY') && needH > nh) nh = needH;
  if (nw === box.w && nh === box.h) return;
  // keep anchor point fixed
  if (!box.inLayout) {
    const [axp, ayp] = box.anchor;
    box.x -= (nw - box.w) * axp;
    box.y -= (nh - box.h) * ayp;
    box.ax = parentBox.ax + box.x;
    box.ay = parentBox.ay + box.y;
  }
  box.w = nw;
  box.h = nh;
  box.content = { x: pad.l, y: pad.t, w: Math.max(0, nw - pad.l - pad.r), h: Math.max(0, nh - pad.t - pad.b) };
  box.autoSized = true;
  layoutChildren(node, box, boxes, opts);
}

function placeFree(node, parentBox, boxes, opts) {
  const area = parentBox.content;
  const [w, h] = computeSize(node, area.w, area.h);
  const P = node.props.Position || [0, 0, 0, 0];
  const A = node.props.AnchorPoint || [0, 0];
  const box = {
    x: area.x + P[0] * area.w + P[1] - A[0] * w,
    y: area.y + P[2] * area.h + P[3] - A[1] * h,
    w, h,
  };
  finishBox(node, box, parentBox, boxes, opts);
}

// ---------- UIListLayout (with flex + wrap) ----------
function listLayout(layout, items, parentBox, boxes, opts) {
  const L = layout.props;
  const area = parentBox.content;
  const horiz = L.FillDirection === 'Horizontal';
  const mainSize = horiz ? area.w : area.h;
  const crossSize = horiz ? area.h : area.w;
  const gap = L.Padding ? L.Padding[0] * mainSize + L.Padding[1] : 0;
  const flexMain = horiz ? L.HorizontalFlex : L.VerticalFlex;
  const mainAlign = horiz ? L.HorizontalAlignment : L.VerticalAlignment; // Left/Center/Right | Top/Center/Bottom
  const crossAlign = horiz ? L.VerticalAlignment : L.HorizontalAlignment;

  const entries = items.map((n) => {
    const [w, h] = computeSize(n, area.w, area.h);
    const fi = mod(n, 'UIFlexItem');
    let grow = 0, shrink = 0;
    const mode = fi?.props.FlexMode || 'None';
    if (mode === 'Fill') [grow, shrink] = [1, 1];
    else if (mode === 'Grow') [grow, shrink] = [1, 0];
    else if (mode === 'Shrink') [grow, shrink] = [0, 1];
    else if (mode === 'Custom') [grow, shrink] = [fi.props.GrowRatio ?? 0, fi.props.ShrinkRatio ?? 0];
    if (flexMain === 'Fill' && mode === 'None') [grow, shrink] = [1, 1];
    const lineAlign = fi && fi.props.ItemLineAlignment && fi.props.ItemLineAlignment !== 'Automatic' ? fi.props.ItemLineAlignment : L.ItemLineAlignment || 'Automatic';
    return { n, main: horiz ? w : h, cross: horiz ? h : w, grow, shrink, lineAlign };
  });

  // split into lines
  const lines = [];
  let cur = [], used = 0;
  for (const e of entries) {
    const add = (cur.length ? gap : 0) + e.main;
    if (L.Wraps && cur.length && used + add > mainSize + 0.01) {
      lines.push(cur);
      cur = [];
      used = 0;
    }
    used += (cur.length ? gap : 0) + e.main;
    cur.push(e);
  }
  if (cur.length) lines.push(cur);

  const lineCross = lines.map((ln) => Math.max(0, ...ln.map((e) => e.cross)));
  const single = lines.length <= 1 && !L.Wraps;
  const totalCross = single ? crossSize : lineCross.reduce((a, b) => a + b, 0) + gap * Math.max(0, lines.length - 1);
  let crossCursor = single ? 0 : crossAlign === 'Center' ? (crossSize - totalCross) / 2 : crossAlign === 'Right' || crossAlign === 'Bottom' ? crossSize - totalCross : 0;
  let maxMain = 0;

  lines.forEach((ln, li) => {
    const lc = single ? crossSize : lineCross[li];
    const basis = ln.reduce((a, e) => a + e.main, 0);
    let free = mainSize - basis - gap * (ln.length - 1);
    // flex grow / shrink
    if (free > 0) {
      const tg = ln.reduce((a, e) => a + e.grow, 0);
      if (tg > 0) {
        for (const e of ln) e.main += (free * e.grow) / tg;
        free = 0;
      }
    } else if (free < 0) {
      const ts = ln.reduce((a, e) => a + e.shrink * e.main, 0);
      if (ts > 0) {
        const f = free;
        for (const e of ln) e.main = Math.max(0, e.main + (f * e.shrink * e.main) / ts);
        free = 0;
      }
    }
    let start = 0, between = gap;
    const n = ln.length;
    if (free > 0 && ['SpaceBetween', 'SpaceAround', 'SpaceEvenly'].includes(flexMain)) {
      if (flexMain === 'SpaceBetween') between = gap + (n > 1 ? free / (n - 1) : 0), start = n > 1 ? 0 : free / 2;
      else if (flexMain === 'SpaceAround') between = gap + free / n, start = free / n / 2;
      else between = gap + free / (n + 1), start = free / (n + 1);
    } else {
      start = mainAlign === 'Center' ? free / 2 : mainAlign === 'Right' || mainAlign === 'Bottom' ? free : 0;
    }
    let pos = start;
    for (const e of ln) {
      let align = e.lineAlign;
      if (align === 'Automatic') align = crossAlign === 'Center' ? 'Center' : crossAlign === 'Right' || crossAlign === 'Bottom' ? 'End' : 'Start';
      let cross = e.cross;
      if (align === 'Stretch') cross = lc;
      const co = align === 'Center' ? (lc - cross) / 2 : align === 'End' ? lc - cross : 0;
      const bx = horiz ? { x: area.x + pos, y: area.y + crossCursor + co, w: e.main, h: cross } : { x: area.x + crossCursor + co, y: area.y + pos, w: cross, h: e.main };
      bx.inLayout = true;
      finishBox(e.n, bx, parentBox, boxes, opts);
      pos += e.main + between;
    }
    maxMain = Math.max(maxMain, pos - between + (free > 0 && mainAlign !== 'Left' && mainAlign !== 'Top' ? 0 : 0));
    crossCursor += lc + gap;
  });
  const contentMain = Math.max(0, ...lines.map((ln) => ln.reduce((a, e) => a + e.main, 0) + gap * (ln.length - 1)));
  const contentCross = lineCross.reduce((a, b) => a + b, 0) + gap * Math.max(0, lines.length - 1);
  parentBox.layoutExtent = horiz ? { w: contentMain, h: contentCross } : { w: contentCross, h: contentMain };
}

// ---------- UIGridLayout ----------
function gridLayout(layout, items, parentBox, boxes, opts) {
  const L = layout.props;
  const area = parentBox.content;
  const cs = L.CellSize || [0, 100, 0, 100], cp = L.CellPadding || [0, 5, 0, 5];
  let cw = cs[0] * area.w + cs[1], ch = cs[2] * area.h + cs[3];
  const ar = mod(layout, 'UIAspectRatioConstraint');
  if (ar) {
    const r = ar.props.AspectRatio || 1;
    if (cw / Math.max(ch, 1e-9) > r) cw = ch * r;
    else ch = cw / r;
  }
  const px = cp[0] * area.w + cp[1], py = cp[2] * area.h + cp[3];
  const horiz = L.FillDirection !== 'Vertical';
  let perLine = horiz ? Math.floor((area.w + px) / (cw + px)) : Math.floor((area.h + py) / (ch + py));
  perLine = Math.max(1, perLine);
  if (L.FillDirectionMaxCells > 0) perLine = Math.min(perLine, L.FillDirectionMaxCells);
  const n = items.length;
  const cols = horiz ? Math.min(perLine, n) : Math.ceil(n / perLine);
  const rows = horiz ? Math.ceil(n / perLine) : Math.min(perLine, n);
  const gw = cols * cw + Math.max(0, cols - 1) * px, gh = rows * ch + Math.max(0, rows - 1) * py;
  const ox = L.HorizontalAlignment === 'Center' ? (area.w - gw) / 2 : L.HorizontalAlignment === 'Right' ? area.w - gw : 0;
  const oy = L.VerticalAlignment === 'Center' ? (area.h - gh) / 2 : L.VerticalAlignment === 'Bottom' ? area.h - gh : 0;
  const sc = L.StartCorner || 'TopLeft';
  items.forEach((it, i) => {
    let c = horiz ? i % perLine : Math.floor(i / perLine);
    let r = horiz ? Math.floor(i / perLine) : i % perLine;
    if (sc === 'TopRight' || sc === 'BottomRight') c = cols - 1 - c;
    if (sc === 'BottomLeft' || sc === 'BottomRight') r = rows - 1 - r;
    const [w, h] = applyConstraints(it, cw, ch);
    const bx = { x: area.x + ox + c * (cw + px), y: area.y + oy + r * (ch + py), w, h, inLayout: true };
    finishBox(it, bx, parentBox, boxes, opts);
  });
  parentBox.layoutExtent = { w: gw, h: gh };
}

// ---------- UIPageLayout (pages laid side by side, first page in view) ----------
function pageLayout(layout, items, parentBox, boxes, opts) {
  const L = layout.props;
  const area = parentBox.content;
  const horiz = L.FillDirection !== 'Vertical';
  const gap = L.Padding ? L.Padding[0] * (horiz ? area.w : area.h) + L.Padding[1] : 0;
  let pos = 0;
  items.forEach((it) => {
    const [w, h] = computeSize(it, area.w, area.h);
    const bx = horiz
      ? { x: area.x + pos + (L.HorizontalAlignment === 'Center' ? 0 : 0), y: area.y + (L.VerticalAlignment === 'Center' ? (area.h - h) / 2 : L.VerticalAlignment === 'Bottom' ? area.h - h : 0), w, h, inLayout: true }
      : { x: area.x + (L.HorizontalAlignment === 'Center' ? (area.w - w) / 2 : L.HorizontalAlignment === 'Right' ? area.w - w : 0), y: area.y + pos, w, h, inLayout: true };
    if (horiz && L.HorizontalAlignment === 'Center' && pos === 0) bx.x = area.x + (area.w - w) / 2;
    if (!horiz && L.VerticalAlignment === 'Center' && pos === 0) bx.y = area.y + (area.h - h) / 2;
    finishBox(it, bx, parentBox, boxes, opts);
    pos = (horiz ? bx.x - area.x + w : bx.y - area.y + h) + gap;
  });
}

// ---------- geometry helpers used by the editor ----------
/** Corners of a node in screen space, accounting for ancestors' rotation/UIScale. */
export function worldCorners(boxes, chain) {
  // chain: array of node ids from screen root to node
  let pts = null;
  for (let i = chain.length - 1; i >= 1; i--) {
    const b = boxes.get(chain[i]);
    if (!b) return null;
    if (!pts) pts = [[0, 0], [b.w, 0], [b.w, b.h], [0, b.h]];
    // local -> parent: scale around anchor, rotate around center, translate
    pts = pts.map(([x, y]) => localToParent(b, x, y));
  }
  return pts;
}

/** Pivot points used for a box's visual transform (UIScale around AnchorPoint, rotation around the scaled center). */
export function transformInfo(b) {
  const ox = b.anchor[0] * b.w, oy = b.anchor[1] * b.h;
  const cx = ox + (b.w / 2 - ox) * b.scale, cy = oy + (b.h / 2 - oy) * b.scale;
  return { ox, oy, cx, cy };
}

/** CSS transform string (with transform-origin: 0 0) matching localToParent. */
export function cssTransform(b) {
  if (b.rot === 0 && b.scale === 1) return '';
  const { ox, oy, cx, cy } = transformInfo(b);
  let t = '';
  if (b.rot) t += `translate(${cx}px,${cy}px) rotate(${b.rot}deg) translate(${-cx}px,${-cy}px) `;
  if (b.scale !== 1) t += `translate(${ox}px,${oy}px) scale(${b.scale}) translate(${-ox}px,${-oy}px)`;
  return t.trim();
}

export function localToParent(b, x, y) {
  const { ox, oy, cx, cy } = transformInfo(b);
  x = ox + (x - ox) * b.scale;
  y = oy + (y - oy) * b.scale;
  if (b.rot) {
    const rad = (b.rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = x - cx, dy = y - cy;
    x = cx + dx * cos - dy * sin;
    y = cy + dx * sin + dy * cos;
  }
  return [x + b.x, y + b.y];
}

export function parentToLocal(b, x, y) {
  const { ox, oy, cx, cy } = transformInfo(b);
  x -= b.x;
  y -= b.y;
  if (b.rot) {
    const rad = (-b.rot * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = x - cx, dy = y - cy;
    x = cx + dx * cos - dy * sin;
    y = cy + dx * sin + dy * cos;
  }
  return [ox + (x - ox) / b.scale, oy + (y - oy) / b.scale];
}
