// DOM renderer for ScreenGui trees. Each GuiObject becomes
//   <div class="rbx-node"> <div class="rbx-own">(svg paint)</div> <div class="rbx-kids">…</div> </div>
// positioned with the boxes from layout.js. Only nodes whose paint signature changed are repainted.

import { layoutScreen, cssTransform } from './layout.js';
import { paintNode, textLayoutFor } from './paint.js';
import { isGuiObject, isText } from './schema.js';
import { ensureFontsFor } from './fonts.js';

let fontsVersion = 0;
// kit images bundled with the app (used when a document references them without embedding)
const BUILTIN = { studs: { url: new URL('../../img/kit/studs.png', import.meta.url).href, width: 128, height: 128, name: 'Studs' } };

export function assetResolver(doc) {
  return (contentId) => {
    if (!contentId) return null;
    const s = String(contentId);
    if (s.startsWith('asset:')) {
      const key = s.slice(6);
      const a = doc.assets?.[key];
      if (a) return { url: a.url || a.data, width: a.width, height: a.height, name: a.name };
      if (BUILTIN[key]) return BUILTIN[key];
      return null;
    }
    const m = s.match(/(\d{3,})/);
    if (m) {
      const a = Object.values(doc.assets || {}).find((x) => String(x.rbxId || '').replace(/\D/g, '') === m[1]);
      if (a) return { url: a.url || a.data, width: a.width, height: a.height, name: a.name };
    }
    if (/^(https?:|data:|\.\/|\/)/.test(s)) return { url: s, width: 0, height: 0 };
    return null;
  };
}

export function measureTextNode(node, maxW) {
  const box = { w: 1e5, h: 1e5, pad: { l: 0, r: 0, t: 0, b: 0 } };
  const r = textLayoutFor(node, box, maxW === Infinity ? 1e5 : maxW);
  return { w: Math.ceil(r.lay.bounds.w), h: Math.ceil(r.lay.bounds.h) };
}

export class ScreenRenderer {
  /**
   * @param {HTMLElement} host   element to render into
   * @param {object} opts { doc, mode: 'edit'|'preview', showHidden, onRendered }
   */
  constructor(host, opts) {
    this.host = host;
    this.opts = opts;
    this.els = new Map(); // id -> { el, own, kids, sig }
    this.boxes = new Map();
    this.state = new Map(); // preview: id -> {hover, pressed}
    this.root = document.createElement('div');
    this.root.className = 'rbx-screen';
    host.appendChild(this.root);
  }

  destroy() {
    this.root.remove();
    this.els.clear();
  }

  render(screen) {
    const doc = this.opts.doc;
    this.screen = screen;
    const W = screen.design.width, H = screen.design.height;
    this.root.style.width = W + 'px';
    this.root.style.height = H + 'px';
    this.root.dataset.id = screen.id;
    const boxes = layoutScreen(screen, { measureText: measureTextNode });
    this.boxes = boxes;
    const ctx = { assetUrl: assetResolver(doc), mode: this.opts.mode || 'edit' };
    const alive = new Set();
    this._renderChildren(screen, this.root, boxes, ctx, alive);
    for (const [id, rec] of this.els) {
      if (!alive.has(id)) {
        rec.el.remove();
        this.els.delete(id);
      }
    }
    // font loading -> repaint when ready
    const texts = [];
    const collect = (n) => {
      if (isText(n.ClassName)) texts.push(n);
      n.children.forEach(collect);
    };
    collect(screen);
    const key = [...new Set(texts.map((t) => JSON.stringify(t.props.FontFace) + (t.props.RichText ? t.props.Text : '')))].join('|');
    if (key !== this._lastFontKey && !this._fontWait) {
      this._fontWait = true;
      ensureFontsFor(texts).then(() => {
        this._fontWait = false;
        this._lastFontKey = key;
        fontsVersion++;
        this.render(this.screen);
        this.opts.onFontsLoaded?.();
      });
    }
    return boxes;
  }

  _renderChildren(parent, container, boxes, ctx, alive) {
    const kids = parent.children.filter((c) => isGuiObject(c.ClassName) || c.ClassName === 'Folder');
    // Sibling ZIndexBehavior: higher ZIndex on top, ties keep tree order
    const ordered = kids.map((n, i) => ({ n, i })).sort((a, b) => ((a.n.props.ZIndex ?? 1) - (b.n.props.ZIndex ?? 1)) || a.i - b.i).map((x) => x.n);
    let prev = null;
    for (const n of ordered) {
      const rec = this._renderNode(n, boxes, ctx, alive);
      if (!rec) continue;
      const want = prev ? prev.nextSibling : container.firstChild;
      if (rec.el.parentNode !== container || want !== rec.el) container.insertBefore(rec.el, want);
      prev = rec.el;
    }
  }

  _renderNode(n, boxes, ctx, alive) {
    const box = boxes.get(n.id);
    if (!box) return null;
    alive.add(n.id);
    let rec = this.els.get(n.id);
    if (!rec) {
      const el = document.createElement('div');
      el.className = 'rbx-node';
      el.dataset.id = n.id;
      const own = document.createElement('div');
      own.className = 'rbx-own';
      const kids = document.createElement('div');
      kids.className = 'rbx-kids';
      el.append(own, kids);
      rec = { el, own, kids, sig: '' };
      this.els.set(n.id, rec);
    }
    const { el, own, kids } = rec;
    const P = n.props;
    const isFolder = n.ClassName === 'Folder';
    const hiddenByEditor = n.editor?.hidden;
    const invisible = !isFolder && P.Visible === false;
    el.style.display = hiddenByEditor || (invisible && !this.opts.showHidden) ? 'none' : '';
    el.classList.toggle('rbx-invisible', invisible && !!this.opts.showHidden);
    el.style.left = box.x + 'px';
    el.style.top = box.y + 'px';
    el.style.width = box.w + 'px';
    el.style.height = box.h + 'px';
    el.style.transform = cssTransform(box);
    el.dataset.cls = n.ClassName;

    if (!isFolder) {
      const st = this.state.get(n.id);
      const sig = JSON.stringify([n.props, n.children.filter((c) => !isGuiObject(c.ClassName) && c.ClassName !== 'Folder'), box.w, box.h, box.pad, box.canvas, fontsVersion, st, ctx.mode]);
      if (sig !== rec.sig) {
        rec.sig = sig;
        const res = paintNode(n, box, Object.assign({}, ctx, { state: st }));
        own.innerHTML = res.svg;
        own.style.backgroundImage = res.conic || '';
        own.style.borderRadius = res.conic && res.radii ? res.radii.map((r) => r + 'px').join(' ') : '';
        rec.paint = res;
        // AutoButtonColor darkening in preview
        if (ctx.mode === 'preview' && (n.ClassName === 'TextButton' || n.ClassName === 'ImageButton') && P.AutoButtonColor && st) {
          own.style.filter = st.pressed ? 'brightness(0.55)' : st.hover ? 'brightness(0.75)' : '';
        } else own.style.filter = '';
      }
      // clipping
      const radii = rec.paint?.radii;
      const clip = P.ClipsDescendants || n.ClassName === 'ScrollingFrame' || n.ClassName === 'CanvasGroup';
      kids.style.overflow = clip ? 'hidden' : '';
      kids.style.borderRadius = clip && n.ClassName === 'CanvasGroup' && radii ? radii.map((r) => r + 'px').join(' ') : '';
      if (n.ClassName === 'CanvasGroup') el.style.opacity = String(1 - (P.GroupTransparency || 0));
      else el.style.opacity = '';
      if (n.ClassName === 'ScrollingFrame') {
        let canvas = kids.firstElementChild?.classList.contains('rbx-canvas') ? kids.firstElementChild : null;
        if (!canvas) {
          canvas = document.createElement('div');
          canvas.className = 'rbx-canvas';
          kids.prepend(canvas);
        }
        const cpos = this.scrollPos?.get(n.id) || [0, 0];
        canvas.style.width = box.canvas.w + 'px';
        canvas.style.height = box.canvas.h + 'px';
        canvas.style.transform = `translate(${-cpos[0]}px,${-cpos[1]}px)`;
        this._renderChildren(n, canvas, boxes, ctx, alive);
        return rec;
      }
    } else {
      own.innerHTML = '';
    }
    this._renderChildren(n, kids, boxes, ctx, alive);
    return rec;
  }
}
