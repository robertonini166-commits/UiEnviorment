// Geometry helpers for the editor: world-space polygons of nodes, hit testing,
// and converting edited boxes back into Roblox Position/Size (Scale/Offset aware).

import { localToParent, parentToLocal } from '../core/layout.js';
import { isGuiObject } from '../core/schema.js';
import { round } from '../core/types.js';

export function chainIds(store, id) {
  const out = [];
  let cur = store.index.get(id);
  while (cur) {
    out.unshift(cur.node.id);
    cur = cur.parent ? store.index.get(cur.parent.id) : null;
  }
  return out;
}

/** Polygon (4 points) of a node in world coordinates. boxes = layout map of its screen. */
export function worldPolygon(store, boxes, id) {
  const chain = chainIds(store, id);
  const screen = store.get(chain[0]);
  const b = boxes.get(id);
  if (!b || !screen?.design) return null;
  let pts = [[0, 0], [b.w, 0], [b.w, b.h], [0, b.h]];
  for (let i = chain.length - 1; i >= 1; i--) {
    const bx = boxes.get(chain[i]);
    if (!bx) return null;
    pts = pts.map(([x, y]) => localToParent(bx, x, y));
  }
  return pts.map(([x, y]) => [x + screen.design.x, y + screen.design.y]);
}

/** Converts a world point into the local (unrotated) space of a node's parent box. */
export function worldToParentLocal(store, boxes, id, wx, wy) {
  const chain = chainIds(store, id);
  const screen = store.get(chain[0]);
  let x = wx - screen.design.x, y = wy - screen.design.y;
  for (let i = 1; i < chain.length - 1; i++) [x, y] = parentToLocal(boxes.get(chain[i]), x, y);
  return [x, y];
}

/** Converts a world point into a node's own local space. */
export function worldToLocal(store, boxes, id, wx, wy) {
  const [x, y] = worldToParentLocal(store, boxes, id, wx, wy);
  return parentToLocal(boxes.get(id), x, y);
}

export function aabb(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function pointInPoly([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/** Render-order (bottom->top) list of GUI node ids for a screen, honoring Sibling ZIndex. */
export function paintOrder(screen) {
  const out = [];
  const visit = (n) => {
    const kids = n.children.filter((c) => isGuiObject(c.ClassName) || c.ClassName === 'Folder');
    const ordered = kids.map((c, i) => ({ c, i })).sort((a, b) => ((a.c.props.ZIndex ?? 1) - (b.c.props.ZIndex ?? 1)) || a.i - b.i).map((x) => x.c);
    for (const c of ordered) {
      if (c.ClassName !== 'Folder') out.push(c.id);
      visit(c);
    }
  };
  visit(screen);
  return out;
}

/**
 * Writes a desired box (relative to the parent's box, unrotated) back into Position/Size.
 * unitMode: 'keep' (preserve each axis' current unit), 'scale' or 'offset'.
 */
export function writeBox(node, parentBox, box, unitMode = 'keep', { size = true, position = true } = {}) {
  const P = node.props;
  const area = parentBox.content;
  const A = P.AnchorPoint || [0, 0];
  const sc = P.SizeConstraint;
  const baseW = sc === 'RelativeYY' ? area.h : area.w;
  const baseH = sc === 'RelativeXX' ? area.w : area.h;
  const useScale = (s, o) => (unitMode === 'scale' ? true : unitMode === 'offset' ? false : s !== 0 && Math.abs(o) < 1e-9);
  const S = [...(P.Size || [0, 0, 0, 0])];
  if (size) {
    if (useScale(S[0], S[1])) [S[0], S[1]] = [baseW ? round(box.w / baseW, 4) : 0, 0];
    else S[1] = Math.round(box.w - S[0] * baseW);
    if (useScale(S[2], S[3])) [S[2], S[3]] = [baseH ? round(box.h / baseH, 4) : 0, 0];
    else S[3] = Math.round(box.h - S[2] * baseH);
    if (unitMode === 'offset') {
      S[0] = 0; S[1] = Math.round(box.w);
      S[2] = 0; S[3] = Math.round(box.h);
    }
    P.Size = S;
  }
  if (position) {
    const Pos = [...(P.Position || [0, 0, 0, 0])];
    const px = box.x - area.x + A[0] * box.w;
    const py = box.y - area.y + A[1] * box.h;
    if (useScale(Pos[0], Pos[1])) [Pos[0], Pos[1]] = [area.w ? round(px / area.w, 4) : 0, 0];
    else Pos[1] = Math.round(px - Pos[0] * area.w);
    if (useScale(Pos[2], Pos[3])) [Pos[2], Pos[3]] = [area.h ? round(py / area.h, 4) : 0, 0];
    else Pos[3] = Math.round(py - Pos[2] * area.h);
    if (unitMode === 'offset') {
      Pos[0] = 0; Pos[1] = Math.round(px);
      Pos[2] = 0; Pos[3] = Math.round(py);
    }
    P.Position = Pos;
  }
}

/** Converts Position/Size fully to Scale (keeping the current look). */
export function toScale(node, parentBox, box) {
  writeBox(node, parentBox, box, 'scale');
}
export function toOffset(node, parentBox, box) {
  writeBox(node, parentBox, box, 'offset');
}
