// Infinite canvas: renders every screen (ScreenGui) with the Roblox renderer and handles
// selection, move, resize, rotate, snapping, creation tools, marquee and inline text editing.

import { ScreenRenderer } from '../core/renderer.js';
import { isGuiObject, isText, isLayout, canParent } from '../core/schema.js';
import { createNode, uniqueName, walk } from '../core/model.js';
import { localToParent, parentToLocal, screenSafeArea, TOPBAR_HEIGHT } from '../core/layout.js';
import { worldPolygon, worldToParentLocal, pointInPoly, paintOrder, writeBox, chainIds, aabb } from './geometry.js';
import { clamp, round } from '../core/types.js';
import { emSize, cssFamily } from '../core/fonts.js';
import { WEIGHTS } from '../core/schema.js';
import { h } from './ui.js';

const HANDLE = 8;
const CONTAINERS = new Set(['Frame', 'ScrollingFrame', 'CanvasGroup', 'ScreenGui']);
const CREATE_TOOLS = {
  frame: 'Frame', rect: 'Frame', ellipse: 'Frame', text: 'TextLabel', button: 'TextButton', image: 'ImageLabel',
  imagebutton: 'ImageButton', scroll: 'ScrollingFrame', textbox: 'TextBox', canvasgroup: 'CanvasGroup',
};

export class Canvas {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this.cmd = app.cmd;
    this.wrap = document.getElementById('canvas-wrap');
    this.canvasEl = document.getElementById('canvas');
    this.world = document.getElementById('world');
    this.overlay = document.getElementById('overlay');
    this.hint = document.getElementById('canvas-hint');
    this.frames = new Map(); // screenId -> { frame, label, host, renderer }
    this.guides = [];
    this.marquee = null;
    this.dropTarget = null;
    this.drag = null;
    this.spaceDown = false;
    this._raf = 0;
    this.bind();
    this.store.on((w) => {
      if (w.doc || w.selection || w.view || w.tool || w.hover) this.schedule();
    });
    new ResizeObserver(() => this.schedule()).observe(this.wrap);
  }

  // ---------- coordinates ----------
  get zoom() {
    return this.store.view.zoom;
  }
  toScreen(wx, wy) {
    const v = this.store.view;
    return [wx * v.zoom + v.panX, wy * v.zoom + v.panY];
  }
  toWorld(clientX, clientY) {
    const r = this.wrap.getBoundingClientRect();
    const v = this.store.view;
    return [(clientX - r.left - v.panX) / v.zoom, (clientY - r.top - v.panY) / v.zoom];
  }

  schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.render();
    });
  }

  // ---------- rendering ----------
  render() {
    const s = this.store;
    const v = s.view;
    this.world.style.transform = `translate(${v.panX}px,${v.panY}px) scale(${v.zoom})`;
    document.body.classList.toggle('tool-create', !!CREATE_TOOLS[s.tool]);
    document.body.classList.toggle('outline-mode', !!v.outline);
    const alive = new Set();
    const roots = s.editingComponentId ? [] : s.doc.screens;
    for (const scr of roots) {
      alive.add(scr.id);
      let f = this.frames.get(scr.id);
      if (!f) {
        const frame = h('div', { class: 'screen-frame' });
        const bg = h('div', { class: 'screen-bg' });
        const host = h('div', { class: 'screen-host' });
        const label = h('div', { class: 'screen-label' });
        frame.append(bg, host, label);
        this.world.append(frame);
        const renderer = new ScreenRenderer(host, { doc: s.doc, mode: 'edit', showHidden: v.showHidden, onFontsLoaded: () => this.schedule() });
        f = { frame, label, host, bg, renderer };
        this.frames.set(scr.id, f);
        label.addEventListener('pointerdown', (e) => this.onScreenLabelDown(e, scr.id));
      }
      f.renderer.opts.doc = s.doc;
      f.renderer.opts.showHidden = v.showHidden;
      const d = scr.design;
      f.frame.style.left = d.x + 'px';
      f.frame.style.top = d.y + 'px';
      f.frame.style.width = d.width + 'px';
      f.frame.style.height = d.height + 'px';
      f.bg.style.background = d.background || '#3A6EA5';
      if (d.backgroundImage) {
        f.bg.style.backgroundImage = `url(${d.backgroundImage})`;
        f.bg.style.backgroundSize = 'cover';
        f.bg.style.backgroundPosition = 'center';
      } else f.bg.style.backgroundImage = '';
      if (!f.core) {
        f.core = h('div', { class: 'core-ui' });
        f.frame.append(f.core);
      }
      const coreKey = [v.showCoreUI, d.width, d.height, JSON.stringify(d.safe), scr.props.IgnoreGuiInset, scr.props.ScreenInsets, JSON.stringify(d.guides || []), JSON.stringify(d.grid || null)].join('|');
      if (f.coreKey !== coreKey) {
        f.coreKey = coreKey;
        f.core.innerHTML = coreUiSvg(scr, v.showCoreUI);
      }
      f.label.textContent = `${scr.Name}  ·  ${d.width}×${d.height}${d.componentsPage ? '  (no se exporta)' : ''}`;
      f.label.style.transform = `scale(${1 / v.zoom})`;
      f.label.classList.toggle('active', scr.id === s.activeScreenId);
      f.renderer.render(scr);
    }
    for (const [id, f] of this.frames) {
      if (!alive.has(id)) {
        f.renderer.destroy();
        f.frame.remove();
        this.frames.delete(id);
      }
    }
    this.renderOverlay();
    this.renderRulers();
  }

  renderRulers() {
    const v = this.store.view;
    const host = document.getElementById('rulers');
    if (!host) return;
    if (!v.showRulers) {
      host.style.display = 'none';
      return;
    }
    host.style.display = '';
    const r = this.wrap.getBoundingClientRect();
    if (!this.rulerH) {
      this.rulerH = h('canvas', { class: 'ruler h' });
      this.rulerV = h('canvas', { class: 'ruler v' });
      this.rulerCorner = h('div', { class: 'ruler-corner' });
      host.append(this.rulerH, this.rulerV, this.rulerCorner);
      const startGuide = (axis) => (e) => {
        e.preventDefault();
        const scr = this.store.activeScreen;
        if (!scr) return;
        this.store.begin('Guía');
        this.store.live(() => {
          scr.design.guides = [...(scr.design.guides || []), { axis, pos: 0 }];
        });
        this.drag = { kind: 'guide', screenId: scr.id, index: scr.design.guides.length - 1, axis };
        this.canvasEl.setPointerCapture?.(e.pointerId);
      };
      this.rulerH.addEventListener('pointerdown', startGuide('h'));
      this.rulerV.addEventListener('pointerdown', startGuide('v'));
      this.rulerH.addEventListener('pointermove', (e) => this.drag?.kind === 'guide' && this.onMove(e));
      this.rulerV.addEventListener('pointermove', (e) => this.drag?.kind === 'guide' && this.onMove(e));
      window.addEventListener('pointerup', (e) => this.drag?.kind === 'guide' && this.onUp(e));
      window.addEventListener('pointermove', (e) => this.drag?.kind === 'guide' && e.target !== this.canvasEl && this.onMove(e));
    }
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(r.width), H = Math.round(r.height), T = 20;
    const scr = this.store.activeScreen;
    const ox = scr ? scr.design.x : 0, oy = scr ? scr.design.y : 0;
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const step = steps.find((st) => st * v.zoom >= 60) || 10000;
    const sel = this.cmd.selectionWorldBounds();
    const draw = (cv, horiz) => {
      const len = horiz ? W : H;
      cv.width = len * dpr;
      cv.height = T * dpr;
      cv.style.width = (horiz ? len - T : T) + 'px';
      if (horiz) {
        cv.style.width = len - T + 'px';
        cv.style.height = T + 'px';
        cv.width = (len - T) * dpr;
      } else {
        cv.width = T * dpr;
        cv.height = (len - T) * dpr;
        cv.style.height = len - T + 'px';
      }
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      g.fillStyle = '#2c2c2c';
      g.fillRect(0, 0, horiz ? len : T, horiz ? T : len);
      g.fillStyle = '#8a8a8a';
      g.strokeStyle = '#555';
      g.font = '9px Inter, system-ui, sans-serif';
      const pan = horiz ? v.panX : v.panY;
      const origin = horiz ? ox : oy;
      // selection band
      if (sel) {
        const a = (horiz ? sel.x : sel.y) * v.zoom + pan - T, b = ((horiz ? sel.x + sel.w : sel.y + sel.h)) * v.zoom + pan - T;
        g.fillStyle = 'rgba(13,153,255,.25)';
        if (horiz) g.fillRect(a, 0, b - a, T);
        else g.fillRect(0, a, T, b - a);
        g.fillStyle = '#8a8a8a';
      }
      const worldStart = (T - pan) / v.zoom, worldEnd = (len - pan) / v.zoom;
      const first = Math.floor((worldStart - origin) / step) * step;
      g.beginPath();
      for (let wv = first; wv + origin <= worldEnd; wv += step / 5) {
        const px = (wv + origin) * v.zoom + pan - T;
        const major = Math.abs(wv / step - Math.round(wv / step)) < 1e-6;
        const tick = major ? T : 5;
        if (horiz) {
          g.moveTo(px + 0.5, T);
          g.lineTo(px + 0.5, T - tick);
        } else {
          g.moveTo(T, px + 0.5);
          g.lineTo(T - tick, px + 0.5);
        }
        if (major) {
          if (horiz) g.fillText(String(Math.round(wv)), px + 3, 9);
          else {
            g.save();
            g.translate(9, px - 3);
            g.rotate(-Math.PI / 2);
            g.fillText(String(Math.round(wv)), 0, 0);
            g.restore();
          }
        }
      }
      g.stroke();
    };
    draw(this.rulerH, true);
    draw(this.rulerV, false);
    // pixel grid
    const pg = this.pixelGrid || (this.pixelGrid = h('div', { class: 'pixel-grid' }));
    if (!pg.isConnected) this.wrap.insertBefore(pg, this.overlay);
    const on = v.pixelGrid !== false && v.zoom >= 6;
    pg.style.display = on ? '' : 'none';
    if (on) {
      pg.style.backgroundSize = `${v.zoom}px ${v.zoom}px`;
      pg.style.backgroundPosition = `${v.panX}px ${v.panY}px`;
    }
  }

  boxesOf(screen) {
    return this.frames.get(screen.id)?.renderer.boxes || this.cmd.boxes(screen);
  }

  polyOf(id) {
    const s = this.store;
    const scr = s.screenOf(id);
    if (!scr) return null;
    if (scr.id === id) {
      const d = scr.design;
      return [[d.x, d.y], [d.x + d.width, d.y], [d.x + d.width, d.y + d.height], [d.x, d.y + d.height]];
    }
    return worldPolygon(s, this.boxesOf(scr), id);
  }

  renderOverlay() {
    const s = this.store;
    const out = [];
    const sp = (pts) => pts.map((p) => this.toScreen(p[0], p[1]).map((v) => round(v, 1)).join(',')).join(' ');
    // layout guides (padding/gaps) for selected container
    // hover
    if (s.hoverId && !s.selection.includes(s.hoverId) && !this.drag) {
      const p = this.polyOf(s.hoverId);
      if (p) out.push(`<polygon points="${sp(p)}" fill="none" stroke="#0d99ff" stroke-width="1.5"/>`);
    }
    // drop target
    if (this.dropTarget) {
      const p = this.polyOf(this.dropTarget);
      if (p) out.push(`<polygon points="${sp(p)}" fill="rgba(13,153,255,.06)" stroke="#0d99ff" stroke-width="2" stroke-dasharray="6 4"/>`);
    }
    // selection
    const sel = s.selection.filter((id) => s.get(id));
    const polys = sel.map((id) => [id, this.polyOf(id)]).filter((x) => x[1]);
    for (const [id, p] of polys) {
      const comp = s.get(id)?.editor?.componentId;
      out.push(`<polygon points="${sp(p)}" fill="none" stroke="${comp ? '#9747ff' : '#0d99ff'}" stroke-width="1.5"/>`);
    }
    if (polys.length && !this.drag?.textEdit) {
      let frame;
      const single = polys.length === 1 ? polys[0][1] : null;
      if (single) frame = single;
      else {
        const bb = aabb(polys.flatMap((x) => x[1]));
        frame = [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]];
        out.push(`<polygon points="${sp(frame)}" fill="none" stroke="#0d99ff" stroke-width="1"/>`);
      }
      const isScreen = polys.length === 1 && s.doc.screens.some((x) => x.id === polys[0][0]);
      const locked = sel.some((id) => s.get(id)?.editor?.locked);
      if (!locked) {
        const fb = aabb(frame);
        const small = Math.min(fb.w, fb.h) * this.zoom < 36;
        for (const hd of this.handlePoints(frame)) {
          if (small && hd.k.length === 1) continue; // Figma hides edge handles on small objects
          const [x, y] = this.toScreen(hd.p[0], hd.p[1]);
          out.push(`<rect x="${round(x - HANDLE / 2, 1)}" y="${round(y - HANDLE / 2, 1)}" width="${HANDLE}" height="${HANDLE}" fill="#fff" stroke="#0d99ff" stroke-width="1.2"/>`);
        }
      }
      // size badge
      const bb = aabb(frame);
      const [bx, by] = this.toScreen(bb.x + bb.w / 2, bb.y + bb.h);
      let label = '';
      if (single && !isScreen) {
        const b = this.cmd.boxOf(polys[0][0]);
        if (b) label = `${round(b.w, 1)} × ${round(b.h, 1)}`;
      } else if (isScreen) {
        const d = s.get(polys[0][0]).design;
        label = `${d.width} × ${d.height}`;
      } else label = `${round(bb.w, 1)} × ${round(bb.h, 1)}`;
      if (label) {
        const w = label.length * 6.4 + 12;
        out.push(`<g transform="translate(${round(bx - w / 2, 1)},${round(by + 8, 1)})"><rect width="${w}" height="18" rx="3" fill="#0d99ff"/><text x="${w / 2}" y="12.5" fill="#fff" font-size="11" text-anchor="middle" font-family="Inter,system-ui,sans-serif">${label}</text></g>`);
      }
      // layout visualization: padding + list gaps
      if (single && !isScreen && s.view.showLayoutGuides) out.push(...this.layoutGuides(polys[0][0], sp));
    }
    // Alt: measure distances between selection and hovered object (Figma red lines)
    if (this.altDown && !this.drag && sel.length && s.hoverId && !sel.includes(s.hoverId)) out.push(...this.measureLines(sel, s.hoverId));
    // snap guides
    for (const g of this.guides) {
      const [x1, y1] = this.toScreen(g[0], g[1]);
      const [x2, y2] = this.toScreen(g[2], g[3]);
      out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ff3b8a" stroke-width="1"/>`);
      if (g[4]) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const t = String(g[4]);
        const w = t.length * 6.4 + 8;
        out.push(`<g transform="translate(${mx - w / 2},${my - 9})"><rect width="${w}" height="16" rx="3" fill="#ff3b8a"/><text x="${w / 2}" y="11.5" fill="#fff" font-size="10.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif">${t}</text></g>`);
      }
    }
    // marquee / draw rect
    if (this.marquee) {
      const [x1, y1] = this.toScreen(this.marquee.x0, this.marquee.y0);
      const [x2, y2] = this.toScreen(this.marquee.x1, this.marquee.y1);
      out.push(`<rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" fill="rgba(13,153,255,.08)" stroke="#0d99ff" stroke-width="1"/>`);
    }
    this.overlay.innerHTML = out.join('');
  }

  layoutGuides(id, sp) {
    const s = this.store;
    const n = s.get(id);
    const out = [];
    if (!n) return out;
    const scr = s.screenOf(id);
    const boxes = this.boxesOf(scr);
    const b = boxes.get(id);
    const pad = n.children.find((c) => c.ClassName === 'UIPadding');
    const layout = n.children.find((c) => isLayout(c.ClassName));
    if (!b || (!pad && !layout)) return out;
    const toW = (x, y) => this.localToWorld(id, x, y, boxes);
    if (pad && b.pad) {
      const { l, r, t, b: bb } = b.pad;
      const rects = [[0, 0, b.w, t], [0, b.h - bb, b.w, bb], [0, t, l, b.h - t - bb], [b.w - r, t, r, b.h - t - bb]];
      for (const [x, y, w, hh] of rects) {
        if (w <= 0 || hh <= 0) continue;
        out.push(`<polygon points="${sp([toW(x, y), toW(x + w, y), toW(x + w, y + hh), toW(x, y + hh)])}" fill="rgba(255,140,0,.13)" stroke="none"/>`);
      }
    }
    if (layout?.ClassName === 'UIListLayout') {
      const kids = n.children.filter((c) => isGuiObject(c.ClassName) && c.props.Visible !== false).map((c) => boxes.get(c.id)).filter(Boolean);
      const horiz = layout.props.FillDirection === 'Horizontal';
      kids.sort((a, c) => (horiz ? a.x - c.x : a.y - c.y));
      for (let i = 0; i < kids.length - 1; i++) {
        const a = kids[i], c = kids[i + 1];
        if (horiz) {
          const x0 = a.x + a.w, x1 = c.x;
          if (x1 - x0 > 0.5 && Math.abs(a.y - c.y) < a.h) out.push(`<polygon points="${sp([toW(x0, Math.min(a.y, c.y)), toW(x1, Math.min(a.y, c.y)), toW(x1, Math.max(a.y + a.h, c.y + c.h)), toW(x0, Math.max(a.y + a.h, c.y + c.h))])}" fill="rgba(255,59,138,.14)"/>`);
        } else {
          const y0 = a.y + a.h, y1 = c.y;
          if (y1 - y0 > 0.5 && Math.abs(a.x - c.x) < a.w) out.push(`<polygon points="${sp([toW(Math.min(a.x, c.x), y0), toW(Math.max(a.x + a.w, c.x + c.w), y0), toW(Math.max(a.x + a.w, c.x + c.w), y1), toW(Math.min(a.x, c.x), y1)])}" fill="rgba(255,59,138,.14)"/>`);
        }
      }
    }
    return out;
  }

  measureLines(sel, otherId) {
    const A = aabb(sel.map((id) => this.polyOf(id)).filter(Boolean).flat());
    const op = this.polyOf(otherId);
    if (!op) return [];
    const B = aabb(op);
    const out = [];
    const line = (x1, y1, x2, y2, v) => {
      const [a, b] = this.toScreen(x1, y1), [c, d] = this.toScreen(x2, y2);
      out.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#f24822" stroke-width="1"/>`);
      const t = String(Math.round(v));
      const w = t.length * 6.4 + 8, mx = (a + c) / 2, my = (b + d) / 2;
      out.push(`<g transform="translate(${mx - w / 2},${my - 8})"><rect width="${w}" height="16" rx="3" fill="#f24822"/><text x="${w / 2}" y="11.5" fill="#fff" font-size="10.5" text-anchor="middle" font-family="Inter,system-ui,sans-serif">${t}</text></g>`);
    };
    const inside = A.x >= B.x && A.y >= B.y && A.x + A.w <= B.x + B.w && A.y + A.h <= B.y + B.h;
    const cy = A.y + A.h / 2, cx = A.x + A.w / 2;
    if (inside) {
      line(B.x, cy, A.x, cy, A.x - B.x);
      line(A.x + A.w, cy, B.x + B.w, cy, B.x + B.w - A.x - A.w);
      line(cx, B.y, cx, A.y, A.y - B.y);
      line(cx, A.y + A.h, cx, B.y + B.h, B.y + B.h - A.y - A.h);
    } else {
      if (B.x >= A.x + A.w) line(A.x + A.w, cy, B.x, cy, B.x - A.x - A.w);
      else if (B.x + B.w <= A.x) line(B.x + B.w, cy, A.x, cy, A.x - B.x - B.w);
      if (B.y >= A.y + A.h) line(cx, A.y + A.h, cx, B.y, B.y - A.y - A.h);
      else if (B.y + B.h <= A.y) line(cx, B.y + B.h, cx, A.y, A.y - B.y - B.h);
    }
    const [bx1, by1] = this.toScreen(B.x, B.y), [bx2, by2] = this.toScreen(B.x + B.w, B.y + B.h);
    out.push(`<rect x="${bx1}" y="${by1}" width="${bx2 - bx1}" height="${by2 - by1}" fill="none" stroke="#f24822" stroke-dasharray="3 3"/>`);
    return out;
  }

  /** Node-local point -> world. */
  localToWorld(id, x, y, boxes) {
    const s = this.store;
    const chain = chainIds(s, id);
    const scr = s.get(chain[0]);
    boxes = boxes || this.boxesOf(scr);
    let p = [x, y];
    for (let i = chain.length - 1; i >= 1; i--) p = localToParent(boxes.get(chain[i]), p[0], p[1]);
    return [p[0] + scr.design.x, p[1] + scr.design.y];
  }
  /** Point in the local space of `id`'s box content coordinates (i.e. what its children use) -> world. */
  parentLocalToWorld(parentId, x, y) {
    const s = this.store;
    const scr = s.screenOf(parentId);
    if (!scr) return [x, y];
    if (scr.id === parentId) return [x + scr.design.x, y + scr.design.y];
    return this.localToWorld(parentId, x, y);
  }

  handlePoints(poly) {
    const [a, b, c, d] = poly;
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    return [
      { k: 'nw', p: a }, { k: 'ne', p: b }, { k: 'se', p: c }, { k: 'sw', p: d },
      { k: 'n', p: mid(a, b) }, { k: 'e', p: mid(b, c) }, { k: 's', p: mid(c, d) }, { k: 'w', p: mid(d, a) },
    ];
  }

  // ---------- hit testing ----------
  screenAt(wx, wy) {
    const scrs = this.store.doc.screens;
    for (let i = scrs.length - 1; i >= 0; i--) {
      const d = scrs[i].design;
      if (wx >= d.x && wy >= d.y && wx <= d.x + d.width && wy <= d.y + d.height) return scrs[i];
    }
    return null;
  }

  /** Topmost node path under a world point (skips locked, hidden, and clipped content). */
  hitPath(wx, wy, { includeLocked = false, filter } = {}) {
    const s = this.store;
    const scr = this.screenAt(wx, wy);
    if (!scr) return null;
    const boxes = this.boxesOf(scr);
    const order = paintOrder(scr);
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      const chain = chainIds(s, id);
      const nodes = chain.map((c) => s.get(c));
      if (nodes.some((n) => n.editor?.hidden || (n.props?.Visible === false && !s.view.showHidden && isGuiObject(n.ClassName)))) continue;
      if (!includeLocked && nodes.some((n) => n.editor?.locked)) continue;
      if (filter && !filter(s.get(id))) continue;
      const poly = worldPolygon(s, boxes, id);
      if (!poly || !pointInPoly([wx, wy], poly)) continue;
      // clipping ancestors
      let clipped = false;
      for (let k = 1; k < chain.length - 1; k++) {
        const an = nodes[k];
        if (an.props?.ClipsDescendants || an.ClassName === 'ScrollingFrame' || an.ClassName === 'CanvasGroup') {
          const ap = worldPolygon(s, boxes, an.id);
          if (ap && !pointInPoly([wx, wy], ap)) {
            clipped = true;
            break;
          }
        }
      }
      if (clipped) continue;
      return chain;
    }
    return [scr.id];
  }

  /** Applies Figma-like selection scoping to a hit path. */
  pickFromPath(path, deep) {
    if (!path || path.length < 2) return null;
    const s = this.store;
    const guiPath = path.filter((id) => s.get(id)?.ClassName !== 'Folder');
    if (deep) return guiPath[guiPath.length - 1];
    const selected = new Set(s.selection);
    const scopes = new Set(s.selection.map((id) => s.parentOf(id)?.id).filter(Boolean));
    for (const id of s.selection) scopes.add(id); // allow clicking into children of selected containers after dblclick
    // if hit is (inside) an already-selected node, keep the deepest selected one
    for (let i = guiPath.length - 1; i >= 1; i--) if (selected.has(guiPath[i])) return guiPath[i];
    for (let i = 1; i < guiPath.length; i++) {
      const parentId = s.parentOf(guiPath[i])?.id;
      if (scopes.has(parentId) && !selected.has(parentId)) return guiPath[i];
    }
    return guiPath[1];
  }

  containerAt(wx, wy, exclude = new Set()) {
    const s = this.store;
    const path = this.hitPath(wx, wy, { filter: (n) => CONTAINERS.has(n.ClassName) && !exclude.has(n.id) });
    if (!path) return null;
    for (let i = path.length - 1; i >= 0; i--) {
      const n = s.get(path[i]);
      if (CONTAINERS.has(n.ClassName) && !exclude.has(n.id) && !path.slice(0, i + 1).some((x) => exclude.has(x))) return n;
    }
    return null;
  }

  // ---------- events ----------
  bind() {
    const c = this.canvasEl;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('dragstart', (e) => e.preventDefault());
    c.addEventListener('dblclick', (e) => this.onDbl(e));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const [wx, wy] = this.toWorld(e.clientX, e.clientY);
      const path = this.hitPath(wx, wy);
      const id = this.pickFromPath(path, e.ctrlKey || e.metaKey);
      if (id && !this.store.selection.includes(id)) this.store.select(id);
      else if (!id && path?.[0]) this.store.select(path[0]);
      this.app.contextMenu?.(e.clientX, e.clientY);
    });
    c.addEventListener('pointerleave', () => {
      if (this.store.hoverId) {
        this.store.hoverId = null;
        this.store.emit({ hover: true });
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Alt' && !this.altDown) {
        this.altDown = true;
        this.renderOverlay();
      }
      if (e.code === 'Space' && !isTyping(e)) {
        if (!this.spaceDown) document.body.classList.add('space-pan');
        this.spaceDown = true;
        e.preventDefault();
      }
    });
    window.addEventListener('blur', () => {
      this.altDown = false;
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') {
        this.altDown = false;
        this.renderOverlay();
      }
      if (e.code === 'Space') {
        this.spaceDown = false;
        document.body.classList.remove('space-pan');
      }
    });
    // drop images/files onto canvas
    this.wrap.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    this.wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      const [wx, wy] = this.toWorld(e.clientX, e.clientY);
      this.app.onCanvasDrop?.(e, wx, wy);
    });
  }

  onWheel(e) {
    e.preventDefault();
    const v = this.store.view;
    if (e.ctrlKey || e.metaKey) {
      const r = this.wrap.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
      this.zoomAt(clamp(v.zoom * factor, 0.02, 64), mx, my);
    } else {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      this.store.setView({ panX: v.panX - dx, panY: v.panY - dy });
    }
  }

  zoomAt(z, mx, my) {
    const v = this.store.view;
    const wx = (mx - v.panX) / v.zoom, wy = (my - v.panY) / v.zoom;
    this.store.setView({ zoom: z, panX: mx - wx * z, panY: my - wy * z });
  }

  zoomBy(f) {
    const r = this.wrap.getBoundingClientRect();
    this.zoomAt(clamp(this.store.view.zoom * f, 0.02, 64), r.width / 2, r.height / 2);
  }

  zoomToRect(bb, pad = 60) {
    if (!bb) return;
    const r = this.wrap.getBoundingClientRect();
    const z = clamp(Math.min((r.width - pad * 2) / Math.max(bb.w, 1), (r.height - pad * 2) / Math.max(bb.h, 1)), 0.02, 8);
    this.store.setView({ zoom: z, panX: r.width / 2 - (bb.x + bb.w / 2) * z, panY: r.height / 2 - (bb.y + bb.h / 2) * z });
  }
  zoomToFit() {
    const scrs = this.store.doc.screens;
    if (!scrs.length) return;
    const pts = scrs.flatMap((s) => [[s.design.x, s.design.y], [s.design.x + s.design.width, s.design.y + s.design.height]]);
    this.zoomToRect(aabb(pts));
  }
  zoomToScreen(scr) {
    this.zoomToRect({ x: scr.design.x, y: scr.design.y, w: scr.design.width, h: scr.design.height });
  }
  zoomToSelection() {
    const bb = this.cmd.selectionWorldBounds();
    if (bb) this.zoomToRect(bb, 120);
  }

  onScreenLabelDown(e, screenId) {
    e.stopPropagation();
    if (e.button !== 0) return;
    const s = this.store;
    s.activeScreenId = screenId;
    s.select(screenId);
    const scr = s.get(screenId);
    const [wx, wy] = this.toWorld(e.clientX, e.clientY);
    const x0 = scr.design.x, y0 = scr.design.y;
    this.canvasEl.setPointerCapture(e.pointerId);
    this.drag = { kind: 'screen', id: screenId, wx, wy, x0, y0, moved: false };
    s.begin('Mover pantalla');
  }

  onDown(e) {
    const s = this.store;
    this.canvasEl.focus?.();
    const [wx, wy] = this.toWorld(e.clientX, e.clientY);
    if (this.drag?.textEdit) this.finishTextEdit();
    if (e.button === 1 || (e.button === 0 && (this.spaceDown || s.tool === 'hand'))) {
      e.preventDefault();
      this.canvasEl.setPointerCapture(e.pointerId);
      this.drag = { kind: 'pan', x: e.clientX, y: e.clientY, px: s.view.panX, py: s.view.panY };
      document.body.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault(); // no native text selection / drag (would cancel the pointer)
    if (document.activeElement && document.activeElement !== document.body && !this.wrap.contains(document.activeElement)) document.activeElement.blur();
    this.canvasEl.setPointerCapture(e.pointerId);

    if (CREATE_TOOLS[s.tool]) {
      this.drag = { kind: 'create', tool: s.tool, wx, wy };
      this.marquee = { x0: wx, y0: wy, x1: wx, y1: wy };
      return;
    }

    // grab an existing guide
    const gscr = this.screenAt(wx, wy) || s.activeScreen;
    if (gscr?.design.guides?.length && s.view.showRulers) {
      const tolG = 4 / this.zoom;
      const gi = gscr.design.guides.findIndex((g) => (g.axis === 'h' ? Math.abs(wy - gscr.design.y - g.pos) : Math.abs(wx - gscr.design.x - g.pos)) <= tolG);
      if (gi >= 0 && !s.selection.length) {
        s.begin('Mover guía');
        this.drag = { kind: 'guide', screenId: gscr.id, index: gi, axis: gscr.design.guides[gi].axis };
        return;
      }
    }
    // handles of current selection
    const sel = s.selection.filter((id) => s.get(id));
    if (sel.length) {
      const polys = sel.map((id) => this.polyOf(id)).filter(Boolean);
      const frame = polys.length === 1 ? polys[0] : (() => {
        const bb = aabb(polys.flat());
        return [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]];
      })();
      const tol = (HANDLE / 2 + 3) / this.zoom;
      const locked = sel.some((id) => s.get(id)?.editor?.locked);
      if (!locked) {
        const fbb = aabb(frame);
        const smallSel = Math.min(fbb.w, fbb.h) * this.zoom < 36;
        for (const hd of this.handlePoints(frame)) {
          if (smallSel && hd.k.length === 1) continue;
          if (Math.abs(hd.p[0] - wx) <= tol && Math.abs(hd.p[1] - wy) <= tol) {
            if (e.altKey && e.shiftKey) break;
            return this.startResize(hd.k, wx, wy, e);
          }
        }
        // rotation zone: just outside corners
        if (sel.length === 1 && !s.doc.screens.some((x) => x.id === sel[0])) {
          const rtol = 18 / this.zoom;
          for (const hd of this.handlePoints(frame).slice(0, 4)) {
            const d = Math.hypot(hd.p[0] - wx, hd.p[1] - wy);
            if (d > tol && d < rtol && !pointInPoly([wx, wy], frame)) return this.startRotate(wx, wy);
          }
        }
      }
    }

    const deep = e.ctrlKey || e.metaKey;
    const path = this.hitPath(wx, wy);
    const id = this.pickFromPath(path, deep);
    if (!id) {
      // empty canvas / screen background -> marquee
      if (!e.shiftKey) s.select([]);
      if (path?.[0]) s.activeScreenId = path[0];
      this.drag = { kind: 'marquee', wx, wy, add: e.shiftKey, base: [...s.selection] };
      this.marquee = { x0: wx, y0: wy, x1: wx, y1: wy };
      return;
    }
    if (e.shiftKey) {
      s.select(id, { toggle: true });
      if (!s.selection.includes(id)) return;
    } else if (!s.selection.includes(id)) s.select(id);
    this.startMove(wx, wy, e);
  }

  startMove(wx, wy, e) {
    const s = this.store;
    let ids = this.cmd.topLevel(s.selection).filter((id) => {
      const n = s.get(id);
      return n && isGuiObject(n.ClassName) && !n.editor?.locked;
    });
    if (!ids.length) return;
    s.begin('Mover');
    if (e.altKey) {
      // alt-drag duplicates (Figma)
      const clones = [];
      s.live(() => {
        for (const id of ids) {
          const n = s.get(id), p = s.parentOf(id);
          const c = JSON.parse(JSON.stringify(n));
          walk(c, (x) => {
            x.id = x.id + '_' + Math.random().toString(36).slice(2, 7);
          });
          if (n.editor?.isComponent) this.app.components?.linkCloneToMaster(c, n);
          c.Name = uniqueName(p, n.Name);
          p.children.splice(p.children.indexOf(n) + 1, 0, c);
          clones.push(c.id);
        }
      });
      ids = clones;
      s.selection = clones;
    }
    const items = ids.map((id) => {
      const scr = s.screenOf(id);
      const boxes = this.cmd.boxes(scr);
      const parent = s.parentOf(id);
      const pb = boxes.get(parent.id);
      return { id, box: { ...boxes.get(id) }, pb: pb && { ...pb, content: { ...pb.content } }, parentId: parent.id, start: worldToParentLocal(s, boxes, id, wx, wy), inLayout: parent.children.some((c) => isLayout(c.ClassName)), screen: scr };
    });
    this.drag = { kind: 'move', items, wx, wy, moved: false };
  }

  startResize(handle, wx, wy, e) {
    const s = this.store;
    const ids = this.cmd.topLevel(s.selection);
    if (ids.length === 1 && s.doc.screens.some((x) => x.id === ids[0])) {
      const scr = s.get(ids[0]);
      s.begin('Tamaño de pantalla');
      this.drag = { kind: 'resizeScreen', handle, id: scr.id, d0: { ...scr.design }, wx, wy };
      return;
    }
    const items = ids.filter((id) => isGuiObject(s.get(id)?.ClassName)).map((id) => {
      const scr = s.screenOf(id);
      const boxes = this.cmd.boxes(scr);
      const parent = s.parentOf(id);
      return { id, box: { ...boxes.get(id) }, pb: { ...boxes.get(parent.id) }, parentId: parent.id, screen: scr };
    });
    if (!items.length) return;
    s.begin('Redimensionar');
    const bb = items.length > 1 ? aabb(items.map((it) => this.polyOf(it.id)).flat()) : null;
    this.drag = { kind: 'resize', handle, items, wx, wy, bb };
  }

  startRotate(wx, wy) {
    const s = this.store;
    const id = s.selection[0];
    const poly = this.polyOf(id);
    const c = [(poly[0][0] + poly[2][0]) / 2, (poly[0][1] + poly[2][1]) / 2];
    s.begin('Rotar');
    this.drag = { kind: 'rotate', id, c, a0: Math.atan2(wy - c[1], wx - c[0]), r0: s.get(id).props.Rotation || 0 };
  }

  onMove(e) {
    const s = this.store;
    const [wx, wy] = this.toWorld(e.clientX, e.clientY);
    const d = this.drag;
    if (!d) {
      // hover
      if (CREATE_TOOLS[s.tool]) return;
      const id = this.pickFromPath(this.hitPath(wx, wy), e.ctrlKey || e.metaKey);
      if (id !== s.hoverId) {
        s.hoverId = id;
        s.emit({ hover: true });
      }
      this.updateCursor(wx, wy);
      return;
    }
    if (d.kind === 'pan') {
      s.setView({ panX: d.px + e.clientX - d.x, panY: d.py + e.clientY - d.y });
      return;
    }
    if (d.kind === 'guide') {
      const scr = s.get(d.screenId);
      s.live(() => {
        const gd = scr.design.guides[d.index];
        if (gd) gd.pos = Math.round(d.axis === 'h' ? wy - scr.design.y : wx - scr.design.x);
      });
      return;
    }
    if (d.kind === 'marquee' || d.kind === 'create') {
      this.marquee.x1 = wx;
      this.marquee.y1 = wy;
      if (d.kind === 'create' && e.shiftKey) {
        const w = wx - d.wx, hh = wy - d.wy, m = Math.max(Math.abs(w), Math.abs(hh));
        this.marquee.x1 = d.wx + Math.sign(w || 1) * m;
        this.marquee.y1 = d.wy + Math.sign(hh || 1) * m;
      }
      if (d.kind === 'marquee') this.updateMarquee(d);
      this.renderOverlay();
      return;
    }
    if (d.kind === 'screen') {
      const dx = wx - d.wx, dy = wy - d.wy;
      if (!d.moved && Math.hypot(dx, dy) * this.zoom < 3) return;
      d.moved = true;
      s.live(() => {
        const scr = s.get(d.id);
        scr.design.x = Math.round(d.x0 + dx);
        scr.design.y = Math.round(d.y0 + dy);
      });
      return;
    }
    if (d.kind === 'resizeScreen') {
      const scr = s.get(d.id);
      s.live(() => {
        const k = d.handle;
        let { x, y, width, height } = d.d0;
        const dx = wx - d.wx, dy = wy - d.wy;
        if (k.includes('e')) width = Math.max(100, Math.round(d.d0.width + dx));
        if (k.includes('s')) height = Math.max(100, Math.round(d.d0.height + dy));
        if (k.includes('w')) {
          width = Math.max(100, Math.round(d.d0.width - dx));
          x = d.d0.x + d.d0.width - width;
        }
        if (k.includes('n')) {
          height = Math.max(100, Math.round(d.d0.height - dy));
          y = d.d0.y + d.d0.height - height;
        }
        Object.assign(scr.design, { x, y, width, height, device: 'custom' });
      });
      return;
    }
    if (d.kind === 'move') return this.dragMove(d, wx, wy, e);
    if (d.kind === 'resize') return this.dragResize(d, wx, wy, e);
    if (d.kind === 'rotate') {
      let a = d.r0 + ((Math.atan2(wy - d.c[1], wx - d.c[0]) - d.a0) * 180) / Math.PI;
      a = e.shiftKey ? Math.round(a / 15) * 15 : Math.round(a);
      a = ((a % 360) + 360) % 360;
      if (a > 180) a -= 360;
      s.live(() => {
        s.get(d.id).props.Rotation = a;
      });
    }
  }

  updateCursor(wx, wy) {
    const s = this.store;
    let cur = '';
    const sel = s.selection;
    if (sel.length && s.tool === 'select') {
      const polys = sel.map((id) => this.polyOf(id)).filter(Boolean);
      if (polys.length) {
        const frame = polys.length === 1 ? polys[0] : (() => {
          const bb = aabb(polys.flat());
          return [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]];
        })();
        const tol = (HANDLE / 2 + 3) / this.zoom;
        for (const hd of this.handlePoints(frame)) {
          if (Math.abs(hd.p[0] - wx) <= tol && Math.abs(hd.p[1] - wy) <= tol) {
            cur = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' }[hd.k];
          }
        }
        if (!cur && sel.length === 1) {
          const rtol = 18 / this.zoom;
          for (const hd of this.handlePoints(frame).slice(0, 4)) {
            const dd = Math.hypot(hd.p[0] - wx, hd.p[1] - wy);
            if (dd > tol && dd < rtol && !pointInPoly([wx, wy], frame)) cur = 'alias';
          }
        }
      }
    }
    this.canvasEl.style.cursor = cur;
  }

  updateMarquee(d) {
    const s = this.store;
    const m = this.marquee;
    const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
    if (x1 - x0 < 2 && y1 - y0 < 2) return;
    // scope: children of the parent of the first selected node at drag start, else top-level of screens
    const scopeParent = d.base.length ? s.parentOf(d.base[0]) : null;
    const hits = [];
    const consider = scopeParent ? [scopeParent] : s.doc.screens;
    for (const p of consider) {
      const kids = [];
      const collect = (n) => {
        for (const c of n.children) {
          if (c.ClassName === 'Folder') collect(c);
          else if (isGuiObject(c.ClassName)) kids.push(c);
        }
      };
      collect(p);
      for (const c of kids) {
        if (c.editor?.locked || c.editor?.hidden) continue;
        const poly = this.polyOf(c.id);
        if (!poly) continue;
        const bb = aabb(poly);
        if (bb.x < x1 && bb.x + bb.w > x0 && bb.y < y1 && bb.y + bb.h > y0) hits.push(c.id);
      }
    }
    s.selection = d.add ? [...new Set([...d.base, ...hits])] : hits;
    s.emit({ selection: true });
  }

  // snapping of a moving/resizing box against parent + siblings (parent-local space)
  snap(item, box, edgesX, edgesY) {
    const s = this.store;
    this.guides = [];
    if (!s.view.snap) return [0, 0];
    const parent = s.get(item.parentId);
    const boxes = this.cmd.boxes(item.screen);
    const pb = boxes.get(item.parentId);
    if (!pb) return [0, 0];
    const moving = new Set(this.drag.items.map((i) => i.id));
    const candX = [pb.content.x, pb.content.x + pb.content.w / 2, pb.content.x + pb.content.w];
    const candY = [pb.content.y, pb.content.y + pb.content.h / 2, pb.content.y + pb.content.h];
    const sibs = parent.children.filter((c) => isGuiObject(c.ClassName) && !moving.has(c.id) && c.props.Visible !== false).map((c) => boxes.get(c.id)).filter((b) => b && !b.rot);
    for (const b of sibs) {
      candX.push(b.x, b.x + b.w / 2, b.x + b.w);
      candY.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    // ruler guides of the screen (converted into parent-local space; exact for unrotated parents)
    const scrG = item.screen;
    if (scrG?.design.guides?.length && s.view.showRulers) {
      const o = this.parentLocalToWorld(item.parentId, 0, 0);
      for (const g of scrG.design.guides) {
        if (g.axis === 'v') candX.push(scrG.design.x + g.pos - o[0]);
        else candY.push(scrG.design.y + g.pos - o[1]);
      }
    }
    const tol = 6 / this.zoom;
    let bestX = null, bestY = null;
    for (const ex of edgesX) for (const cx of candX) {
      const dd = cx - ex;
      if (Math.abs(dd) <= tol && (!bestX || Math.abs(dd) < Math.abs(bestX.d))) bestX = { d: dd, v: cx };
    }
    for (const ey of edgesY) for (const cy of candY) {
      const dd = cy - ey;
      if (Math.abs(dd) <= tol && (!bestY || Math.abs(dd) < Math.abs(bestY.d))) bestY = { d: dd, v: cy };
    }
    const dx = bestX ? bestX.d : 0, dy = bestY ? bestY.d : 0;
    const toW = (x, y) => this.parentLocalToWorld(item.parentId, x, y);
    if (bestX) {
      const ys = [box.y + dy, box.y + box.h + dy, pb.content.y, pb.content.y + pb.content.h];
      const matched = sibs.filter((b) => [b.x, b.x + b.w / 2, b.x + b.w].some((v) => Math.abs(v - bestX.v) < 0.5));
      for (const b of matched) ys.push(b.y, b.y + b.h);
      const a = toW(bestX.v, Math.min(...(matched.length ? [box.y + dy, ...matched.map((b) => b.y)] : [box.y + dy])));
      const c = toW(bestX.v, Math.max(...(matched.length ? [box.y + box.h + dy, ...matched.map((b) => b.y + b.h)] : [box.y + box.h + dy])));
      this.guides.push([a[0], a[1], c[0], c[1]]);
    }
    if (bestY) {
      const matched = sibs.filter((b) => [b.y, b.y + b.h / 2, b.y + b.h].some((v) => Math.abs(v - bestY.v) < 0.5));
      const a = toW(Math.min(box.x + dx, ...matched.map((b) => b.x)), bestY.v);
      const c = toW(Math.max(box.x + box.w + dx, ...matched.map((b) => b.x + b.w)), bestY.v);
      this.guides.push([a[0], a[1], c[0], c[1]]);
    }
    // distance to parent edges (Figma-like red measurements) when single item
    if (this.drag.items.length === 1 && this.drag.alt) {
      const bx = box.x + dx, by = box.y + dy;
      const L = bx - pb.content.x, T = by - pb.content.y;
      const R = pb.content.x + pb.content.w - (bx + box.w), B = pb.content.y + pb.content.h - (by + box.h);
      const cy = by + box.h / 2, cx = bx + box.w / 2;
      const push = (x1, y1, x2, y2, v) => {
        const a = toW(x1, y1), c = toW(x2, y2);
        this.guides.push([a[0], a[1], c[0], c[1], Math.round(v)]);
      };
      push(pb.content.x, cy, bx, cy, L);
      push(bx + box.w, cy, pb.content.x + pb.content.w, cy, R);
      push(cx, pb.content.y, cx, by, T);
      push(cx, by + box.h, cx, pb.content.y + pb.content.h, B);
    }
    return [dx, dy];
  }

  dragMove(d, wx, wy, e) {
    const s = this.store;
    const dist = Math.hypot(wx - d.wx, wy - d.wy) * this.zoom;
    if (!d.moved && dist < 3) return;
    d.moved = true;
    d.alt = e.altKey;
    const first = d.items[0];
    const boxes = this.cmd.boxes(first.screen);
    const cur = worldToParentLocal(s, boxes, first.id, wx, wy);
    let dx = cur[0] - first.start[0], dy = cur[1] - first.start[1];
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    // reorder inside list/grid layouts
    if (first.inLayout && d.items.length === 1 && !e.ctrlKey) {
      const parent = s.get(first.parentId);
      const sibs = parent.children.filter((c) => isGuiObject(c.ClassName) && c.props.Visible !== false);
      const layout = parent.children.find((c) => isLayout(c.ClassName));
      const horiz = layout.ClassName === 'UIListLayout' ? layout.props.FillDirection === 'Horizontal' : true;
      const px = cur[0], py = cur[1];
      const ordered = sibs.map((c) => ({ c, b: boxes.get(c.id) })).filter((x) => x.b).sort((a, b) => (a.c.props.LayoutOrder || 0) - (b.c.props.LayoutOrder || 0));
      const others = ordered.filter((x) => x.c.id !== first.id);
      let idx = others.length;
      for (let i = 0; i < others.length; i++) {
        const b = others[i].b;
        const before = layout.ClassName === 'UIGridLayout' ? (py < b.y + b.h && (px < b.x + b.w / 2 || py < b.y)) : horiz ? px < b.x + b.w / 2 : py < b.y + b.h / 2;
        if (before) {
          idx = i;
          break;
        }
      }
      s.live(() => {
        const moving = s.get(first.id);
        const list = others.map((x) => x.c);
        list.splice(idx, 0, moving);
        list.forEach((c, i) => (c.props.LayoutOrder = i));
      });
      this.dropTarget = null;
      return;
    }
    // snapping on the first item
    const b0 = first.box;
    const nb = { ...b0, x: b0.x + dx, y: b0.y + dy };
    if (!b0.rot) {
      const [sx, sy] = e.ctrlKey ? [0, 0] : this.snap(first, nb, [nb.x, nb.x + nb.w / 2, nb.x + nb.w], [nb.y, nb.y + nb.h / 2, nb.y + nb.h]);
      dx += sx;
      dy += sy;
    }
    // integer pixel positions
    dx = Math.round(b0.x + dx) - b0.x;
    dy = Math.round(b0.y + dy) - b0.y;
    s.live(() => {
      for (const it of d.items) {
        const n = s.get(it.id);
        if (!n || it.inLayout) continue;
        writeBox(n, it.pb, { ...it.box, x: it.box.x + dx, y: it.box.y + dy }, s.view.unitMode, { size: false });
      }
    });
    // potential reparent target
    const exclude = new Set(d.items.map((i) => i.id));
    const target = e.ctrlKey ? null : this.containerAt(wx, wy, exclude);
    this.dropTarget = target && target.id !== first.parentId && d.items.every((i) => i.parentId === first.parentId) ? target.id : null;
  }

  dragResize(d, wx, wy, e) {
    const s = this.store;
    const k = d.handle;
    if (d.items.length === 1) {
      const it = d.items[0];
      const b0 = it.box;
      const boxes = this.cmd.boxes(it.screen);
      const pp = worldToParentLocal(s, boxes, it.id, wx, wy);
      const [lx, ly] = parentToLocal(b0, pp[0], pp[1]);
      const sc = b0.scale || 1;
      let x0 = 0, y0 = 0, x1 = b0.w, y1 = b0.h;
      if (k.includes('w')) x0 = lx;
      if (k.includes('e')) x1 = lx;
      if (k.includes('n')) y0 = ly;
      if (k.includes('s')) y1 = ly;
      if (e.shiftKey && k.length === 2) {
        const ratio = b0.w / Math.max(b0.h, 1e-6);
        const w = Math.abs(x1 - x0), hh = Math.abs(y1 - y0);
        if (w / ratio > hh) {
          const nh = w / ratio;
          if (k.includes('n')) y0 = y1 - nh;
          else y1 = y0 + nh;
        } else {
          const nw = hh * ratio;
          if (k.includes('w')) x0 = x1 - nw;
          else x1 = x0 + nw;
        }
      }
      if (e.altKey) {
        if (k.includes('w')) x1 = b0.w - x0;
        if (k.includes('e')) x0 = b0.w - x1;
        if (k.includes('n')) y1 = b0.h - y0;
        if (k.includes('s')) y0 = b0.h - y1;
      }
      let w = Math.max(1, Math.round((x1 - x0) * sc) / sc), hh = Math.max(1, Math.round((y1 - y0) * sc) / sc);
      if (x1 < x0) x0 = x1;
      if (y1 < y0) y0 = y1;
      // snapping for unrotated boxes
      this.guides = [];
      let nb;
      if (!b0.rot && sc === 1) {
        nb = { x: b0.x + x0, y: b0.y + y0, w, h: hh };
        if (!e.ctrlKey) {
          const ex = k.includes('e') ? [nb.x + nb.w] : k.includes('w') ? [nb.x] : [];
          const ey = k.includes('s') ? [nb.y + nb.h] : k.includes('n') ? [nb.y] : [];
          const [sx, sy] = this.snap(it, nb, ex, ey);
          if (k.includes('e')) nb.w += sx;
          if (k.includes('w')) {
            nb.x += sx;
            nb.w -= sx;
          }
          if (k.includes('s')) nb.h += sy;
          if (k.includes('n')) {
            nb.y += sy;
            nb.h -= sy;
          }
        }
        nb.x = Math.round(nb.x);
        nb.y = Math.round(nb.y);
        nb.w = Math.max(1, Math.round(nb.w));
        nb.h = Math.max(1, Math.round(nb.h));
      } else {
        // keep the opposite side fixed in parent space for rotated/scaled boxes
        const cxL = x0 + w / 2, cyL = y0 + hh / 2;
        const [cxP, cyP] = localToParent(b0, cxL, cyL);
        const A = b0.anchor || [0, 0];
        // box such that its center (after transforms around anchor/center) lands on cxP,cyP
        const ox = A[0] * w, oy = A[1] * hh;
        const scx = ox + (w / 2 - ox) * sc, scy = oy + (hh / 2 - oy) * sc;
        nb = { x: cxP - scx, y: cyP - scy, w, h: hh };
      }
      s.live(() => {
        const n = s.get(it.id);
        writeBox(n, it.pb, nb, s.view.unitMode);
        if (isText(n.ClassName) && n.props.AutomaticSize && n.props.AutomaticSize !== 'None') n.props.AutomaticSize = 'None';
      });
      return;
    }
    // multi-selection: proportional scaling inside bounding box (world space, same parent assumed unrotated)
    const bb = d.bb;
    let x0 = bb.x, y0 = bb.y, x1 = bb.x + bb.w, y1 = bb.y + bb.h;
    if (k.includes('w')) x0 = Math.min(wx, x1 - 1);
    if (k.includes('e')) x1 = Math.max(wx, x0 + 1);
    if (k.includes('n')) y0 = Math.min(wy, y1 - 1);
    if (k.includes('s')) y1 = Math.max(wy, y0 + 1);
    const fx = (x1 - x0) / bb.w, fy = (y1 - y0) / bb.h;
    s.live(() => {
      for (const it of d.items) {
        const n = s.get(it.id);
        const poly = worldPolygon(s, this.cmd.boxes(it.screen), it.id);
        void poly;
        const b = it.box;
        // parent-local transform approximated by world scale factors
        const pw = this.parentLocalToWorld(it.parentId, b.x, b.y);
        const nx = x0 + (pw[0] - bb.x) * fx, ny = y0 + (pw[1] - bb.y) * fy;
        const back = worldToParentLocal(s, this.cmd.boxes(it.screen), it.id, nx, ny);
        writeBox(n, it.pb, { x: Math.round(back[0]), y: Math.round(back[1]), w: Math.max(1, Math.round(b.w * fx)), h: Math.max(1, Math.round(b.h * fy)) }, s.view.unitMode);
      }
    });
  }

  onUp(e) {
    const s = this.store;
    const d = this.drag;
    document.body.classList.remove('panning');
    if (!d) return;
    const [wx, wy] = this.toWorld(e.clientX, e.clientY);
    this.drag = null;
    this.guides = [];
    if (d.kind === 'pan') return;
    if (d.kind === 'guide') {
      const scr = s.get(d.screenId);
      const r = this.wrap.getBoundingClientRect();
      // dropped back on the ruler (or outside the screen) -> remove
      const gd = scr.design.guides[d.index];
      const outside = gd && (gd.pos < 0 || gd.pos > (d.axis === 'h' ? scr.design.height : scr.design.width));
      if (e.clientX - r.left < 20 || e.clientY - r.top < 20 || outside) s.live(() => scr.design.guides.splice(d.index, 1));
      s.commit();
      return;
    }
    if (d.kind === 'marquee') {
      this.marquee = null;
      this.renderOverlay();
      return;
    }
    if (d.kind === 'create') {
      const m = this.marquee;
      this.marquee = null;
      this.createFromTool(d.tool, m, e);
      return;
    }
    if (d.kind === 'move' && this.dropTarget) {
      const target = s.get(this.dropTarget);
      this.dropTarget = null;
      this.reparent(d.items, target);
      s.commit();
      return;
    }
    this.dropTarget = null;
    if (d.kind === 'move' && !d.moved) {
      s.cancel();
      // click without drag on an already-selected item inside a multi-selection -> select just it
      const path = this.hitPath(wx, wy);
      const id = this.pickFromPath(path, e.ctrlKey || e.metaKey);
      if (id && !e.shiftKey && s.selection.length > 1) s.select(id);
      this.renderOverlay();
      return;
    }
    s.commit();
  }

  reparent(items, target) {
    const s = this.store;
    s.live(() => {
      const scr = s.screenOf(target.id);
      const boxes = this.cmd.boxes(scr);
      const tb = target.ClassName === 'ScreenGui' ? boxes.get(target.id) : boxes.get(target.id);
      for (const it of items) {
        const n = s.get(it.id);
        if (!canParent(n.ClassName, target.ClassName)) continue;
        const poly = this.polyOf(it.id);
        if (!poly) continue;
        const oldParent = s.parentOf(it.id);
        // world top-left (unrotated) -> target local
        const bb = aabb(poly);
        const b = this.cmd.boxOf(it.id);
        const cw = [bb.x + bb.w / 2, bb.y + bb.h / 2];
        oldParent.children.splice(oldParent.children.indexOf(n), 1);
        target.children.push(n);
        this.cmd._boxCache.clear();
        s._index = null;
        const tl = target.ClassName === 'ScreenGui' ? [cw[0] - scr.design.x, cw[1] - scr.design.y] : worldToParentLocal(s, this.cmd.boxes(scr), n.id, cw[0], cw[1]);
        writeBox(n, tb, { x: tl[0] - b.w / 2, y: tl[1] - b.h / 2, w: b.w, h: b.h }, 'keep');
      }
    });
  }

  createFromTool(tool, m, e) {
    const s = this.store;
    const cls = CREATE_TOOLS[tool];
    const x0 = Math.min(m.x0, m.x1), y0 = Math.min(m.y0, m.y1);
    let w = Math.abs(m.x1 - m.x0), hh = Math.abs(m.y1 - m.y0);
    const clickOnly = w * this.zoom < 4 && hh * this.zoom < 4;
    const container = this.containerAt(m.x0, m.y0) || this.store.activeScreen;
    if (!container) return;
    const scr = s.screenOf(container.id);
    s.activeScreenId = scr.id;
    const boxes = this.cmd.boxes(scr);
    const cb = boxes.get(container.id);
    const defaults = { Frame: [200, 120], TextLabel: [200, 50], TextButton: [180, 56], ImageLabel: [100, 100], ImageButton: [100, 100], ScrollingFrame: [240, 200], TextBox: [220, 44], CanvasGroup: [200, 120] };
    if (clickOnly) [w, hh] = defaults[cls] || [100, 100];
    // container-local top-left
    let tl;
    if (container.ClassName === 'ScreenGui') tl = [x0 - scr.design.x, y0 - scr.design.y];
    else {
      const p = [x0, y0];
      const chain = chainIds(s, container.id);
      let x = p[0] - scr.design.x, y = p[1] - scr.design.y;
      for (let i = 1; i < chain.length; i++) [x, y] = parentToLocal(boxes.get(chain[i]), x, y);
      tl = [x, y];
    }
    if (clickOnly) {
      tl[0] -= w / 2;
      tl[1] -= hh / 2;
    }
    const props = {};
    if (tool === 'ellipse') props.BackgroundColor3 = '#D9D9D9';
    if (tool === 'rect') props.BackgroundColor3 = '#D9D9D9';
    if (tool === 'frame') props.BackgroundColor3 = '#FFFFFF';
    if (cls === 'TextLabel' && !clickOnly) props.TextWrapped = true;
    const node = this.cmd.insert(cls, { parent: container, props, box: { x: Math.round(tl[0]), y: Math.round(tl[1]), w: Math.round(w), h: Math.round(hh) }, name: tool === 'ellipse' ? 'Circle' : tool === 'rect' ? 'Rectangle' : undefined });
    if (node && tool === 'ellipse') {
      s.edit('Elipse', () => {
        const c = createNode('UICorner', { CornerRadius: [0.5, 0] });
        c.Name = 'UICorner';
        node.children.unshift(c);
      });
    }
    if (!e.shiftKey || true) s.setTool('select');
    if (node && isText(cls)) setTimeout(() => this.startTextEdit(node.id), 30);
    if (node && (cls === 'ImageLabel' || cls === 'ImageButton')) this.app.pickImageFor?.(node.id);
  }

  onDbl(e) {
    const s = this.store;
    const [wx, wy] = this.toWorld(e.clientX, e.clientY);
    const path = this.hitPath(wx, wy);
    if (!path) return;
    const sel = s.selectedNodes();
    if (sel.length === 1 && isText(sel[0].ClassName) && path.includes(sel[0].id)) {
      this.startTextEdit(sel[0].id);
      return;
    }
    // drill in: select child under pointer of the selected node
    if (sel.length === 1) {
      const i = path.indexOf(sel[0].id);
      if (i >= 0 && i < path.length - 1) {
        let next = path[i + 1];
        if (s.get(next)?.ClassName === 'Folder' && path[i + 2]) next = path[i + 2];
        s.select(next);
        if (isText(s.get(next).ClassName) && e.detail > 2) this.startTextEdit(next);
        return;
      }
    }
    if (path.length === 1) {
      const scr = s.get(path[0]);
      if (scr) this.zoomToScreen(scr);
    }
  }

  // ---------- inline text editing ----------
  startTextEdit(id) {
    const s = this.store;
    const n = s.get(id);
    if (!n || !isText(n.ClassName) || n.editor?.locked) return;
    this.finishTextEdit();
    const poly = this.polyOf(id);
    if (!poly) return;
    const bb = aabb(poly);
    const [x, y] = this.toScreen(bb.x, bb.y);
    const P = n.props;
    const size = (P.TextScaled ? this.cmd.boxOf(id)?.h * 0.6 || P.TextSize : P.TextSize) || 14;
    const ta = h('textarea', { class: 'inline-text', spellcheck: 'false' });
    ta.value = P.Text || '';
    Object.assign(ta.style, {
      position: 'absolute', left: x + 'px', top: y + 'px', width: Math.max(40, bb.w * this.zoom) + 'px', height: Math.max(24, bb.h * this.zoom) + 'px',
      background: 'rgba(20,20,20,.85)', color: '#fff', border: '2px solid #0d99ff', borderRadius: '3px', outline: 'none', resize: 'none', zIndex: 5,
      font: `${WEIGHTS[P.FontFace?.weight] || 400} ${Math.max(10, emSize(P.FontFace?.family || 'Montserrat', size) * this.zoom)}px ${cssFamily(P.FontFace?.family || 'Montserrat')}`,
      textAlign: (P.TextXAlignment || 'Center').toLowerCase(), padding: '2px 4px', lineHeight: '1.15',
    });
    this.wrap.append(ta);
    s.begin('Editar texto');
    this.drag = { kind: 'text', textEdit: true, id, ta };
    ta.focus();
    ta.select();
    ta.addEventListener('input', () => s.live(() => (s.get(id).props.Text = ta.value)));
    ta.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey || !ev.shiftKey && !P.TextWrapped && !P.RichText))) {
        ev.preventDefault();
        this.finishTextEdit();
      }
    });
    ta.addEventListener('blur', () => this.finishTextEdit());
  }

  finishTextEdit() {
    const d = this.drag;
    if (!d?.textEdit) return;
    this.drag = null;
    d.ta.remove();
    this.store.commit();
  }

  showHint(msg, ms = 1800) {
    this.hint.textContent = msg;
    this.hint.classList.add('show');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => this.hint.classList.remove('show'), ms);
  }
}

/** Non-exported overlay: Roblox top bar buttons, safe-area hint, mobile controls, guides, layout grid. */
function coreUiSvg(scr, show) {
  const d = scr.design;
  const W = d.width, H = d.height;
  const out = [];
  const grid = d.grid;
  if (grid?.columns > 0) {
    const m = grid.margin ?? 24, gut = grid.gutter ?? 16, n = grid.columns;
    const cw = (W - 2 * m - gut * (n - 1)) / n;
    for (let i = 0; i < n; i++) out.push(`<rect x="${m + i * (cw + gut)}" y="0" width="${cw}" height="${H}" fill="rgba(255,60,60,.08)"/>`);
  }
  for (const g of d.guides || []) {
    if (g.axis === 'h') out.push(`<line x1="0" x2="${W}" y1="${g.pos}" y2="${g.pos}" stroke="#ff3b8a" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
    else out.push(`<line y1="0" y2="${H}" x1="${g.pos}" x2="${g.pos}" stroke="#ff3b8a" stroke-width="1" vector-effect="non-scaling-stroke"/>`);
  }
  if (show) {
    const safe = screenSafeArea(scr, W, H);
    const dev = d.safe || { l: 0, r: 0, t: 0, b: 0 };
    // device cutouts (notch)
    if (dev.l) out.push(`<rect x="0" y="0" width="${dev.l}" height="${H}" fill="rgba(0,0,0,.35)"/><rect x="${dev.l / 2 - 6}" y="${H / 2 - 60}" width="12" height="120" rx="6" fill="#000"/>`);
    if (dev.r) out.push(`<rect x="${W - dev.r}" y="0" width="${dev.r}" height="${H}" fill="rgba(0,0,0,.2)"/>`);
    if (dev.b) out.push(`<rect x="${W / 2 - 70}" y="${H - dev.b / 2 - 3}" width="140" height="5" rx="2.5" fill="rgba(255,255,255,.6)"/>`);
    // top bar buttons (Roblox 2024 top bar: 44px buttons in a 58px band)
    const bx = dev.l + 12;
    const btn = (x, icon) => `<g opacity=".9"><rect x="${x}" y="7" width="44" height="44" rx="22" fill="rgba(18,18,21,.72)"/>${icon(x + 22, 29)}</g>`;
    const logo = (cx, cy) => `<rect x="${cx - 9}" y="${cy - 9}" width="18" height="18" rx="3" fill="none" stroke="#fff" stroke-width="2.4" transform="rotate(15 ${cx} ${cy})"/><rect x="${cx - 2.5}" y="${cy - 2.5}" width="5" height="5" fill="#fff" transform="rotate(15 ${cx} ${cy})"/>`;
    const chat = (cx, cy) => `<path d="M${cx - 9} ${cy - 7}h18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9l-5 4v-4h-4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" fill="none" stroke="#fff" stroke-width="2"/>`;
    const dots = (cx, cy) => `<circle cx="${cx - 6}" cy="${cy}" r="2" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="2" fill="#fff"/><circle cx="${cx + 6}" cy="${cy}" r="2" fill="#fff"/>`;
    out.push(btn(bx, logo), btn(bx + 56, chat), btn(W - dev.r - 56, dots));
    if (safe.mode === 'CoreUISafeInsets') out.push(`<line x1="0" x2="${W}" y1="${TOPBAR_HEIGHT}" y2="${TOPBAR_HEIGHT}" stroke="rgba(255,255,255,.35)" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/><text x="${W - dev.r - 70}" y="${TOPBAR_HEIGHT - 6}" font-size="10" fill="rgba(255,255,255,.55)" text-anchor="end" font-family="Inter,system-ui,sans-serif">zona segura (ScreenInsets)</text>`);
    // mobile controls
    if (d.device === 'phone' || d.device === 'phoneSmall' || d.device === 'tablet') {
      out.push(`<circle cx="${dev.l + 120}" cy="${H - dev.b - 110}" r="62" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.35)" stroke-width="2"/><circle cx="${dev.l + 120}" cy="${H - dev.b - 110}" r="26" fill="rgba(255,255,255,.3)"/>`);
      out.push(`<circle cx="${W - dev.r - 95}" cy="${H - dev.b - 90}" r="42" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.4)" stroke-width="2"/><path d="M${W - dev.r - 107} ${H - dev.b - 84}l12-12 12 12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`);
    }
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0;pointer-events:none;overflow:visible">${out.join('')}</svg>`;
}

export function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export { CREATE_TOOLS };
