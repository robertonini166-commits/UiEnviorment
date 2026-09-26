// Editor commands: every user action that changes the document lives here, so the
// toolbar, menus, shortcuts and context menu share the same behavior.

import { createNode, createScreen, cloneWithNewIds, uniqueName, walk, normalizeDocument, compactNode, DEVICES } from '../core/model.js';
import { isGuiObject, isLayout, canParent, isText, isImage, getProps, defaultsFor, isModifier, isContainerLike } from '../core/schema.js';
import { layoutScreen } from '../core/layout.js';
import { measureTextNode } from '../core/renderer.js';
import { deepClone, round } from '../core/types.js';
import { writeBox, worldPolygon, aabb } from './geometry.js';
import { toast, copyText } from './ui.js';

export class Commands {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this.clipboard = null;
    this._boxCache = new Map();
    this.store.on(() => this._boxCache.clear());
  }

  boxes(screen) {
    if (!screen) return new Map();
    let b = this._boxCache.get(screen.id);
    if (!b) {
      b = layoutScreen(screen, { measureText: measureTextNode });
      this._boxCache.set(screen.id, b);
    }
    return b;
  }
  boxOf(id) {
    const scr = this.store.screenOf(id);
    return scr ? this.boxes(scr).get(id) : null;
  }
  /** Parent box to use for Position/Size math (nearest GUI ancestor / folder area). */
  parentBoxOf(id) {
    const p = this.store.parentOf(id);
    return p ? this.boxOf(p.id) : null;
  }

  // ---------- insertion ----------
  /** Container that should receive new objects (selected container, or parent of selection, or active screen). */
  insertionParent(cls) {
    const s = this.store;
    const sel = s.selectedNodes();
    if (sel.length === 1) {
      const n = sel[0];
      if (canParent(cls, n.ClassName) && (n.ClassName !== 'TextLabel' && n.ClassName !== 'TextButton' && n.ClassName !== 'ImageLabel' && n.ClassName !== 'ImageButton' && n.ClassName !== 'TextBox' || isModifier(cls))) return n;
      const p = s.parentOf(n.id);
      if (p && canParent(cls, p.ClassName)) return p;
    }
    return s.activeScreen;
  }

  insert(cls, { parent, props = {}, box, select = true, name, children = [] } = {}) {
    const s = this.store;
    parent = parent || this.insertionParent(cls);
    if (!canParent(cls, parent.ClassName)) {
      toast(`${cls} no puede ir dentro de ${parent.ClassName}`, 'err');
      return null;
    }
    let node;
    s.edit(`Insertar ${cls}`, () => {
      node = createNode(cls, props, children);
      node.Name = uniqueName(parent, name || NAMES[cls] || cls);
      if (isGuiObject(cls) && box) {
        const pb = this.boxOf(parent.id) || this.boxes(s.screenOf(parent.id) || parent).get(parent.id);
        if (pb) writeBox(node, pb, box, s.view.unitMode === 'scale' ? 'scale' : 'offset');
      } else if (isGuiObject(cls) && !props.Position) {
        // center in parent
        const pb = this.boxOf(parent.id);
        if (pb) {
          const [w, h] = [node.props.Size[1] || 100, node.props.Size[3] || 100];
          node.props.Position = [0, Math.round(pb.content.w / 2 - w / 2), 0, Math.round(pb.content.h / 2 - h / 2)];
        }
      }
      if (isModifier(cls) && parent.children.some((c) => c.ClassName === cls) && ['UICorner', 'UIGradient', 'UIPadding', 'UIScale', 'UIAspectRatioConstraint', 'UISizeConstraint', 'UITextSizeConstraint', 'UIFlexItem'].includes(cls)) {
        throw new Error(`${parent.Name} ya tiene un ${cls}`);
      }
      if (isLayout(cls) && parent.children.some((c) => isLayout(c.ClassName))) throw new Error(`${parent.Name} ya tiene un layout`);
      // modifiers go first in the child list (Roblox Explorer convention)
      if (isModifier(cls)) parent.children.splice(parent.children.filter((c) => isModifier(c.ClassName)).length, 0, node);
      else parent.children.push(node);
    });
    if (select && node && !isModifier(cls)) s.select(node.id);
    return node;
  }

  insertTree(tree, parent, { select = true, at } = {}) {
    const s = this.store;
    parent = parent || this.insertionParent(tree.ClassName);
    const { doc } = normalizeDocument({ screens: [{ ClassName: 'ScreenGui', Name: 'tmp', children: [tree] }] });
    const node = doc.screens[0].children[0];
    if (!node) return null;
    s.edit('Insertar', () => {
      node.Name = uniqueName(parent, node.Name);
      if (at && isGuiObject(node.ClassName)) {
        const pb = this.boxOf(parent.id);
        if (pb) {
          const b = layoutScreen({ ...doc.screens[0], design: { width: pb.content.w, height: pb.content.h } }).get(node.id);
          const x = at[0] - b.w / 2, y = at[1] - b.h / 2;
          node.props.AnchorPoint = node.props.AnchorPoint || [0, 0];
          writeBox(node, pb, { x, y, w: b.w, h: b.h }, 'keep', { size: false });
        }
      }
      parent.children.push(node);
    });
    if (select) s.select(node.id);
    return node;
  }

  addScreen(device = 'studio') {
    const s = this.store;
    let scr;
    s.edit('Nueva pantalla', (doc) => {
      const last = doc.screens[doc.screens.length - 1];
      const x = last ? last.design.x + last.design.width + 200 : 0;
      scr = createScreen(uniqueName({ children: doc.screens }, 'Screen'), device, x, last ? last.design.y : 0);
      doc.screens.push(scr);
    });
    s.activeScreenId = scr.id;
    s.select([]);
    this.app.canvas?.zoomToScreen(scr);
    return scr;
  }

  // ---------- delete / duplicate / clipboard ----------
  deletable(ids) {
    return ids.filter((id) => {
      const n = this.store.get(id);
      return n && !(n.editor?.locked);
    });
  }

  deleteSelection() {
    const s = this.store;
    const ids = this.topLevel(s.selection);
    if (!ids.length) return;
    const screens = ids.filter((id) => s.doc.screens.some((x) => x.id === id));
    s.edit('Eliminar', (doc) => {
      for (const id of ids) {
        if (screens.includes(id)) {
          if (doc.screens.length > 1) doc.screens.splice(doc.screens.findIndex((x) => x.id === id), 1);
          continue;
        }
        const p = s.parentOf(id);
        if (p) p.children.splice(p.children.findIndex((c) => c.id === id), 1);
      }
    });
    s.select([]);
  }

  /** Removes ids whose ancestor is also in the list. */
  topLevel(ids) {
    const set = new Set(ids);
    return ids.filter((id) => {
      let p = this.store.parentOf(id);
      while (p) {
        if (set.has(p.id)) return false;
        p = this.store.parentOf(p.id);
      }
      return true;
    });
  }

  duplicate() {
    const s = this.store;
    const ids = this.topLevel(s.selection);
    if (!ids.length) return;
    const newIds = [];
    s.edit('Duplicar', (doc) => {
      for (const id of ids) {
        const n = s.get(id);
        if (doc.screens.includes(n)) {
          const c = cloneWithNewIds(n);
          c.Name = uniqueName({ children: doc.screens }, n.Name);
          c.design.x = n.design.x + n.design.width + 200;
          doc.screens.push(c);
          newIds.push(c.id);
          continue;
        }
        const p = s.parentOf(id);
        const c = cloneWithNewIds(n);
        c.Name = uniqueName(p, n.Name);
        const inLayout = p.children.some((x) => isLayout(x.ClassName));
        if (isGuiObject(c.ClassName) && !inLayout && c.props.Position) {
          c.props.Position = [...c.props.Position];
          c.props.Position[1] += 10;
          c.props.Position[3] += 10;
        }
        if (inLayout && isGuiObject(c.ClassName)) c.props.LayoutOrder = (n.props.LayoutOrder || 0) + 1;
        p.children.splice(p.children.indexOf(n) + 1, 0, c);
        newIds.push(c.id);
      }
    });
    s.select(newIds);
  }

  copy(cut = false) {
    const s = this.store;
    const ids = this.topLevel(s.selection).filter((id) => !s.doc.screens.some((x) => x.id === id));
    if (!ids.length) return;
    const nodes = ids.map((id) => deepClone(s.get(id)));
    this.clipboard = nodes;
    const payload = { rbxui: 1, nodes: nodes.map(compactNode) };
    copyText(JSON.stringify(payload, null, 1));
    if (cut) this.deleteSelection();
    toast(cut ? 'Cortado' : `Copiado (${nodes.length})`);
  }

  /** Paste nodes (internal clipboard or RbxUI JSON text from the system clipboard). */
  paste(text) {
    const s = this.store;
    let nodes = null;
    if (text) {
      try {
        const j = JSON.parse(text);
        if (j.nodes) nodes = j.nodes;
        else if (Array.isArray(j)) nodes = j;
        else if (j.ClassName) nodes = [j];
        else if (j.screens) {
          const { doc } = normalizeDocument(j);
          s.edit('Pegar pantallas', (d) => {
            let x = Math.max(...d.screens.map((sc) => sc.design.x + sc.design.width)) + 200;
            for (const sc of doc.screens) {
              sc.design.x = x;
              x += sc.design.width + 200;
              d.screens.push(sc);
            }
            Object.assign(d.assets, doc.assets);
          });
          toast(`Pegadas ${doc.screens.length} pantallas`);
          return;
        }
      } catch {
        nodes = null;
      }
    }
    if (!nodes && this.clipboard) nodes = deepClone(this.clipboard);
    if (!nodes || !nodes.length) return;
    const first = s.selectedNodes()[0];
    let parent = first && isContainerLike(first.ClassName) && first.ClassName !== 'TextLabel' ? first : first ? s.parentOf(first.id) : s.activeScreen;
    if (!parent) parent = s.activeScreen;
    const { doc } = normalizeDocument({ screens: [{ ClassName: 'ScreenGui', Name: 'tmp', children: nodes }] });
    const fresh = doc.screens[0].children;
    if (!fresh.length) return;
    s.edit('Pegar', () => {
      for (const n of fresh) {
        if (!canParent(n.ClassName, parent.ClassName)) continue;
        n.Name = uniqueName(parent, n.Name);
        parent.children.push(n);
      }
    });
    s.select(fresh.filter((n) => isGuiObject(n.ClassName)).map((n) => n.id));
  }

  // ---------- grouping ----------
  sameParent(ids) {
    const ps = new Set(ids.map((id) => this.store.parentOf(id)?.id));
    return ps.size === 1 ? this.store.parentOf(ids[0]) : null;
  }

  /** Wraps selection into a transparent Frame (or Folder) keeping the look. */
  group(kind = 'Frame') {
    const s = this.store;
    const ids = this.topLevel(s.selection).filter((id) => isGuiObject(s.get(id)?.ClassName) || s.get(id)?.ClassName === 'Folder');
    if (!ids.length) return;
    const parent = this.sameParent(ids);
    if (!parent) return toast('Selecciona objetos del mismo padre para agrupar', 'err');
    const pb = this.boxOf(parent.id);
    const boxes = ids.map((id) => this.boxOf(id));
    const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
    let g;
    s.edit('Agrupar', () => {
      g = kind === 'Folder' ? createNode('Folder') : createNode('Frame', { BackgroundTransparency: 1 });
      g.Name = uniqueName(parent, kind === 'Folder' ? 'Folder' : 'Group');
      const idx = Math.min(...ids.map((id) => parent.children.findIndex((c) => c.id === id)));
      const nodes = ids.map((id) => s.get(id));
      if (kind !== 'Folder') {
        g.props.ZIndex = Math.max(...nodes.map((n) => n.props.ZIndex ?? 1));
        writeBox(g, pb, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 'offset');
      }
      for (const n of nodes) parent.children.splice(parent.children.indexOf(n), 1);
      parent.children.splice(Math.min(idx, parent.children.length), 0, g);
      g.children.push(...nodes);
      if (kind !== 'Folder') {
        const gb = { content: { x: 0, y: 0, w: x1 - x0, h: y1 - y0 } };
        nodes.forEach((n, i) => {
          const b = boxes[i];
          writeBox(n, gb, { x: b.x - x0, y: b.y - y0, w: b.w, h: b.h }, 'keep');
        });
      }
    });
    s.select(g.id);
  }

  ungroup() {
    const s = this.store;
    const targets = s.selectedNodes().filter((n) => (n.ClassName === 'Frame' || n.ClassName === 'Folder') && s.parentOf(n.id));
    if (!targets.length) return;
    const newSel = [];
    s.edit('Desagrupar', () => {
      for (const g of targets) {
        const parent = s.parentOf(g.id);
        const pb = this.boxOf(parent.id);
        const gb = this.boxOf(g.id);
        const idx = parent.children.indexOf(g);
        const kids = g.children.filter((c) => isGuiObject(c.ClassName) || c.ClassName === 'Folder');
        const moved = [];
        for (const k of kids) {
          const kb = this.boxOf(k.id);
          if (g.ClassName === 'Frame' && kb && gb && isGuiObject(k.ClassName)) {
            writeBox(k, pb, { x: gb.x + kb.x, y: gb.y + kb.y, w: kb.w, h: kb.h }, 'keep');
          }
          moved.push(k);
          newSel.push(k.id);
        }
        parent.children.splice(idx, 1, ...moved);
      }
    });
    s.select(newSel);
  }

  // ---------- alignment ----------
  align(mode) {
    const s = this.store;
    const ids = this.topLevel(s.selection).filter((id) => isGuiObject(s.get(id)?.ClassName));
    if (!ids.length) return;
    const parent = this.sameParent(ids);
    if (!parent) return toast('Alinear requiere objetos del mismo padre', 'err');
    const pb = this.boxOf(parent.id);
    const boxes = ids.map((id) => ({ ...this.boxOf(id) }));
    let ref;
    if (ids.length === 1) ref = { x: pb.content.x, y: pb.content.y, w: pb.content.w, h: pb.content.h };
    else {
      const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
      ref = { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x + b.w)) - x0, h: Math.max(...boxes.map((b) => b.y + b.h)) - y0 };
    }
    s.edit('Alinear', () => {
      ids.forEach((id, i) => {
        const b = boxes[i];
        if (mode === 'left') b.x = ref.x;
        if (mode === 'right') b.x = ref.x + ref.w - b.w;
        if (mode === 'centerH') b.x = ref.x + (ref.w - b.w) / 2;
        if (mode === 'top') b.y = ref.y;
        if (mode === 'bottom') b.y = ref.y + ref.h - b.h;
        if (mode === 'centerV') b.y = ref.y + (ref.h - b.h) / 2;
        const n = s.get(id);
        // single object aligned to parent: use scale anchors so it stays aligned on every screen size
        if (ids.length === 1) {
          const A = [...(n.props.AnchorPoint || [0, 0])];
          const P = [...n.props.Position];
          if (mode === 'left') [A[0], P[0], P[1]] = [0, 0, 0];
          if (mode === 'centerH') [A[0], P[0], P[1]] = [0.5, 0.5, 0];
          if (mode === 'right') [A[0], P[0], P[1]] = [1, 1, 0];
          if (mode === 'top') [A[1], P[2], P[3]] = [0, 0, 0];
          if (mode === 'centerV') [A[1], P[2], P[3]] = [0.5, 0.5, 0];
          if (mode === 'bottom') [A[1], P[2], P[3]] = [1, 1, 0];
          n.props.AnchorPoint = A;
          n.props.Position = P;
        } else writeBox(n, pb, b, 'keep', { size: false });
      });
    });
  }

  distribute(axis) {
    const s = this.store;
    const ids = this.topLevel(s.selection).filter((id) => isGuiObject(s.get(id)?.ClassName));
    if (ids.length < 3) return toast('Selecciona 3 o más objetos para distribuir');
    const parent = this.sameParent(ids);
    if (!parent) return;
    const pb = this.boxOf(parent.id);
    const items = ids.map((id) => ({ id, b: { ...this.boxOf(id) } }));
    const k = axis === 'h' ? 'x' : 'y', d = axis === 'h' ? 'w' : 'h';
    items.sort((a, b) => a.b[k] - b.b[k]);
    const start = items[0].b[k], end = Math.max(...items.map((i) => i.b[k] + i.b[d]));
    const total = items.reduce((a, i) => a + i.b[d], 0);
    const gap = (end - start - total) / (items.length - 1);
    let pos = start;
    s.edit('Distribuir', () => {
      for (const it of items) {
        it.b[k] = pos;
        pos += it.b[d] + gap;
        writeBox(s.get(it.id), pb, it.b, 'keep', { size: false });
      }
    });
  }

  // ---------- ordering ----------
  reorder(dir) {
    const s = this.store;
    const ids = this.topLevel(s.selection);
    s.edit('Orden', () => {
      for (const id of ids) {
        const p = s.parentOf(id);
        if (!p) continue;
        const n = s.get(id);
        const sibs = p.children.filter((c) => isGuiObject(c.ClassName) || c.ClassName === 'Folder');
        const zs = sibs.map((c) => c.props.ZIndex ?? 1);
        const i = p.children.indexOf(n);
        if (dir === 'front') {
          p.children.splice(i, 1);
          p.children.push(n);
          if (isGuiObject(n.ClassName)) n.props.ZIndex = Math.max(...zs);
        } else if (dir === 'back') {
          p.children.splice(i, 1);
          p.children.splice(p.children.filter((c) => isModifier(c.ClassName)).length, 0, n);
          if (isGuiObject(n.ClassName)) n.props.ZIndex = Math.min(...zs);
        } else {
          const si = sibs.indexOf(n);
          const other = sibs[si + (dir === 'forward' ? 1 : -1)];
          if (!other) continue;
          const oi = p.children.indexOf(other);
          p.children.splice(i, 1);
          p.children.splice(oi, 0, n);
          if (isGuiObject(n.ClassName) && isGuiObject(other.ClassName)) n.props.ZIndex = other.props.ZIndex ?? 1;
        }
      }
    });
  }

  // ---------- flags ----------
  toggleEditor(flag) {
    const s = this.store;
    const nodes = s.selectedNodes();
    if (!nodes.length) return;
    const val = !nodes[0].editor?.[flag];
    s.edit(flag === 'locked' ? 'Bloquear' : 'Ocultar', () => {
      for (const n of nodes) n.editor = Object.assign({}, n.editor, { [flag]: val });
    });
  }

  setProp(ids, prop, value, { live = false, label } = {}) {
    const s = this.store;
    const fn = () => {
      for (const id of ids) {
        const n = s.get(id);
        if (!n) continue;
        if (prop === 'Name') n.Name = value;
        else if (getProps(n.ClassName)[prop]) {
          n.props[prop] = typeof value === 'function' ? value(n.props[prop], n) : value;
          if (n.ClassName === 'UICorner' && prop === 'CornerRadius') {
            for (const k of ['TopLeftRadius', 'TopRightRadius', 'BottomRightRadius', 'BottomLeftRadius']) n.props[k] = [...n.props.CornerRadius];
          }
        }
      }
    };
    if (live) {
      s.begin(label || `Cambiar ${prop}`);
      s.live(fn);
    } else if (s._txn) {
      s.live(fn);
      s.commit();
    } else s.edit(label || `Cambiar ${prop}`, fn);
  }

  // ---------- modifiers ----------
  addModifier(cls, targets) {
    const s = this.store;
    targets = targets || s.selectedNodes();
    const ok = targets.filter((n) => canParent(cls, n.ClassName) && !(n.children.some((c) => c.ClassName === cls) && cls !== 'UIStroke' && cls !== 'UIShadow') && !(isLayout(cls) && n.children.some((c) => isLayout(c.ClassName))));
    if (!ok.length) return toast(`No se puede añadir ${cls} aquí`, 'err');
    const made = [];
    s.edit(`Añadir ${cls}`, () => {
      for (const n of ok) {
        const m = createNode(cls);
        m.Name = cls;
        if (cls === 'UIStroke' && !isText(n.ClassName)) m.props.ApplyStrokeMode = 'Border';
        if (cls === 'UIStroke' && isText(n.ClassName) && n.children.some((c) => c.ClassName === 'UIStroke')) m.props.ApplyStrokeMode = 'Border';
        if (cls === 'UIGradient') {
          const base = n.props.BackgroundColor3 || '#FFFFFF';
          m.props.Color = [[0, '#FFFFFF'], [1, '#B4B4B4']];
          if (base !== '#FFFFFF' && !isText(n.ClassName)) {
            m.props.Color = [[0, '#FFFFFF'], [1, '#FFFFFF']];
          }
        }
        n.children.splice(n.children.filter((c) => isModifier(c.ClassName)).length, 0, m);
        made.push(m);
      }
    });
    return made;
  }

  removeNode(id) {
    const s = this.store;
    s.edit('Quitar', () => {
      const p = s.parentOf(id);
      if (p) p.children.splice(p.children.findIndex((c) => c.id === id), 1);
    });
    s.select(s.selection.filter((x) => x !== id));
  }

  /** Figma-like "Add auto layout": wraps selection in a Frame with UIListLayout (or adds one to a container). */
  autoLayout() {
    const s = this.store;
    const sel = s.selectedNodes();
    if (sel.length === 1 && ['Frame', 'ScrollingFrame', 'CanvasGroup'].includes(sel[0].ClassName) && !sel[0].children.some((c) => isLayout(c.ClassName))) {
      const n = sel[0];
      const kids = n.children.filter((c) => isGuiObject(c.ClassName));
      const vertical = kids.length < 2 || (() => {
        const bs = kids.map((k) => this.boxOf(k.id));
        const spanX = Math.max(...bs.map((b) => b.x + b.w)) - Math.min(...bs.map((b) => b.x));
        const spanY = Math.max(...bs.map((b) => b.y + b.h)) - Math.min(...bs.map((b) => b.y));
        return spanY >= spanX;
      })();
      // order children by position so the layout keeps the visual order
      const bs = new Map(kids.map((k) => [k.id, this.boxOf(k.id)]));
      s.edit('Auto layout', () => {
        [...kids].sort((a, b) => (vertical ? bs.get(a.id).y - bs.get(b.id).y : bs.get(a.id).x - bs.get(b.id).x)).forEach((k, i) => (k.props.LayoutOrder = i));
        const l = createNode('UIListLayout', { FillDirection: vertical ? 'Vertical' : 'Horizontal', Padding: [0, 10], SortOrder: 'LayoutOrder' });
        l.Name = 'UIListLayout';
        n.children.unshift(l);
        if (!n.children.some((c) => c.ClassName === 'UIPadding')) {
          const p = createNode('UIPadding', {});
          p.Name = 'UIPadding';
          n.children.unshift(p);
        }
      });
      return;
    }
    if (!sel.length) return;
    this.group('Frame');
    const g = s.selectedNodes()[0];
    if (!g) return;
    const kids = g.children.filter((c) => isGuiObject(c.ClassName));
    const bs = new Map(kids.map((k) => [k.id, this.boxOf(k.id)]));
    const spanX = Math.max(...kids.map((k) => bs.get(k.id).x + bs.get(k.id).w)) - Math.min(...kids.map((k) => bs.get(k.id).x));
    const spanY = Math.max(...kids.map((k) => bs.get(k.id).y + bs.get(k.id).h)) - Math.min(...kids.map((k) => bs.get(k.id).y));
    const vertical = spanY >= spanX;
    s.edit('Auto layout', () => {
      [...kids].sort((a, b) => (vertical ? bs.get(a.id).y - bs.get(b.id).y : bs.get(a.id).x - bs.get(b.id).x)).forEach((k, i) => (k.props.LayoutOrder = i));
      const l = createNode('UIListLayout', { FillDirection: vertical ? 'Vertical' : 'Horizontal', Padding: [0, 10], SortOrder: 'LayoutOrder' });
      l.Name = 'UIListLayout';
      g.children.unshift(l);
      g.props.AutomaticSize = 'XY';
      g.props.Size = [0, 0, 0, 0];
      g.Name = uniqueName(s.parentOf(g.id), 'AutoLayout');
    });
  }

  // ---------- units ----------
  convertUnits(mode, recursive = false) {
    const s = this.store;
    const nodes = s.selectedNodes().filter((n) => isGuiObject(n.ClassName));
    if (!nodes.length) return;
    s.edit(mode === 'scale' ? 'Convertir a Scale' : 'Convertir a Offset', () => {
      const conv = (n) => {
        const pb = this.parentBoxOf(n.id);
        const b = this.boxOf(n.id);
        const inLayout = s.parentOf(n.id)?.children.some((c) => isLayout(c.ClassName));
        if (pb && b && isGuiObject(n.ClassName)) writeBox(n, pb, b, mode, { position: !inLayout });
        if (recursive) for (const c of n.children) if (isGuiObject(c.ClassName)) conv(c);
      };
      nodes.forEach(conv);
    });
  }

  nudge(dx, dy) {
    const s = this.store;
    const ids = this.topLevel(s.selection).filter((id) => isGuiObject(s.get(id)?.ClassName) && !s.get(id).editor?.locked);
    if (!ids.length) return;
    s.edit('Mover', () => {
      for (const id of ids) {
        const n = s.get(id);
        const pb = this.parentBoxOf(id);
        const b = this.boxOf(id);
        if (!pb || !b) continue;
        writeBox(n, pb, { ...b, x: b.x + dx, y: b.y + dy }, s.view.unitMode, { size: false });
      }
    });
  }

  /** Change class keeping compatible properties and children. */
  changeClass(newCls) {
    const s = this.store;
    const nodes = s.selectedNodes().filter((n) => isGuiObject(n.ClassName));
    const newIds = [];
    s.edit(`Convertir a ${newCls}`, () => {
      for (const n of nodes) {
        const p = s.parentOf(n.id);
        const m = createNode(newCls);
        m.Name = n.Name;
        const defs = getProps(newCls);
        const base = defaultsFor(newCls);
        for (const [k, v] of Object.entries(n.props)) if (defs[k]) m.props[k] = deepClone(v);
        if (isText(newCls) && !isText(n.ClassName)) {
          for (const k of ['Text', 'FontFace', 'TextSize', 'TextColor3']) m.props[k] = base[k];
        }
        m.children = n.children.filter((c) => canParent(c.ClassName, newCls));
        m.interactions = n.interactions;
        m.editor = n.editor;
        p.children.splice(p.children.indexOf(n), 1, m);
        newIds.push(m.id);
      }
    });
    s.select(newIds);
  }

  selectAll() {
    const s = this.store;
    const first = s.selectedNodes()[0];
    const parent = first ? s.parentOf(first.id) : s.activeScreen;
    if (!parent) return;
    s.select(parent.children.filter((c) => isGuiObject(c.ClassName) || c.ClassName === 'Folder').map((c) => c.id));
  }

  selectParent() {
    const s = this.store;
    const first = s.selectedNodes()[0];
    if (!first) return;
    const p = s.parentOf(first.id);
    if (p && p.ClassName !== 'ScreenGui') s.select(p.id);
    else s.select([]);
  }

  selectChildren() {
    const s = this.store;
    const first = s.selectedNodes()[0];
    if (!first) return;
    const kids = first.children.filter((c) => isGuiObject(c.ClassName) || c.ClassName === 'Folder');
    if (kids.length) s.select(kids.map((k) => k.id));
  }

  setDevice(screen, device) {
    const d = DEVICES[device];
    if (!d) return;
    this.store.edit('Dispositivo', () => {
      screen.design.device = device;
      screen.design.width = d.width;
      screen.design.height = d.height;
    });
  }

  selectionWorldBounds() {
    const s = this.store;
    const polys = s.selection.map((id) => {
      const scr = s.screenOf(id);
      if (!scr) return null;
      if (scr.id === id) return [[scr.design.x, scr.design.y], [scr.design.x + scr.design.width, scr.design.y + scr.design.height]];
      return worldPolygon(s, this.boxes(scr), id);
    }).filter(Boolean);
    if (!polys.length) return null;
    return aabb(polys.flat());
  }
}

export const NAMES = {
  Frame: 'Frame', TextLabel: 'TextLabel', TextButton: 'TextButton', TextBox: 'TextBox', ImageLabel: 'ImageLabel', ImageButton: 'ImageButton',
  ScrollingFrame: 'ScrollingFrame', CanvasGroup: 'CanvasGroup', Folder: 'Folder', ViewportFrame: 'ViewportFrame', VideoFrame: 'VideoFrame',
};

export function nodeSummary(n) {
  if (isText(n.ClassName)) return (n.props.Text || n.props.PlaceholderText || '').slice(0, 30);
  if (isImage(n.ClassName)) return n.props.Image ? 'imagen' : '';
  return '';
}

export { round, walk };
