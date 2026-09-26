// Prototype tab (interactions) + in-browser Play mode that mimics the exported Roblox runtime.

import { isGuiObject, isButton } from '../core/schema.js';
import { walk } from '../core/model.js';
import { ScreenRenderer } from '../core/renderer.js';
import { deepClone } from '../core/types.js';
import { h, select, checkbox, numInput } from './ui.js';
import { icon } from './icons.js';
import { chainIds } from './geometry.js';

const ACTIONS = [['toggle', 'Abrir/cerrar (toggle)'], ['open', 'Abrir'], ['close', 'Cerrar'], ['closeParent', 'Cerrar su ventana'], ['navigate', 'Ir a otra pantalla']];
const TRIGGERS = [['click', 'Al hacer clic'], ['hover', 'Al pasar el ratón'], ['key', 'Al pulsar una tecla'], ['delay', 'Tras X segundos']];
const KEYS = ['E', 'F', 'G', 'Q', 'R', 'T', 'B', 'M', 'I', 'P', 'Tab', 'One', 'Two', 'Three', 'Four', 'Five', 'Escape', 'Return', 'Space', 'LeftShift', 'ButtonX', 'ButtonY', 'ButtonB'];
const ANIMS = [['pop', 'Pop (escala)'], ['fade', 'Fundido'], ['slideUp', 'Deslizar desde abajo'], ['slideDown', 'Deslizar desde arriba'], ['slideLeft', 'Deslizar desde la derecha'], ['slideRight', 'Deslizar desde la izquierda'], ['none', 'Sin animación']];

export class Prototype {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this.host = h('div');
    this.store.on((w) => {
      if (w.live) return;
      if ((w.doc || w.selection) && this.app.rightTab === 'prototype') this.render();
    });
  }

  render() {
    const s = this.store;
    this.host.innerHTML = '';
    const nodes = s.selectedNodes().filter((n) => isGuiObject(n.ClassName));
    const scr = s.activeScreen;
    const wrap = h('div');
    if (nodes.length === 1) {
      const n = nodes[0];
      const body = h('div');
      const list = n.interactions || [];
      list.forEach((it, i) => body.append(this.interactionCard(n, it, i)));
      if (!list.length) body.append(h('div', { class: 'hint' }, isButton(n.ClassName) ? 'Este botón no hace nada todavía.' : 'Solo los botones (TextButton/ImageButton) responden a clics. Para hover sirve cualquier objeto.'));
      const add = h('button', { class: 'btn small', style: { marginTop: '6px' } }, '+ Añadir interacción');
      add.addEventListener('click', () => this.store.edit('Añadir interacción', () => {
        n.interactions = [...(n.interactions || []), { trigger: 'click', action: 'toggle', target: this.guessTarget(n), animation: 'pop', duration: 0.22, blur: false, exclusive: true }];
      }));
      body.append(add);
      wrap.append(section('Interacciones', body, n.Name));
      if (isButton(n.ClassName)) {
        const fx = n.buttonFx;
        const fxBody = h('div', {}, checkbox('Animar al pasar / pulsar (UIScale)', !!fx, (v) => this.store.edit('Efecto botón', () => {
          if (v) n.buttonFx = { hover: 1.06, press: 0.9 };
          else delete n.buttonFx;
        })));
        if (fx) fxBody.append(h('div', { class: 'grid2', style: { marginTop: '6px' } },
          numInput({ label: 'Hover', value: fx.hover, step: 0.01, decimals: 3, onChange: (v, f) => f && this.store.edit('Efecto', () => (n.buttonFx.hover = v)) }),
          numInput({ label: 'Pulsar', value: fx.press, step: 0.01, decimals: 3, onChange: (v, f) => f && this.store.edit('Efecto', () => (n.buttonFx.press = v)) })));
        fxBody.append(h('div', { class: 'hint', style: { marginTop: '6px' } }, 'Para que escale desde el centro usa AnchorPoint 0.5, 0.5.'));
        wrap.append(section('Efecto de botón', fxBody));
      }
      wrap.append(section('Estado inicial', h('div', {}, checkbox('Visible al empezar', n.props.Visible !== false, (v) => this.app.cmd.setProp([n.id], 'Visible', v)), h('div', { class: 'hint' }, 'Las ventanas normalmente empiezan ocultas (Visible = false) y un botón las abre.'))));
    } else {
      wrap.append(section('Prototipo', h('div', { class: 'hint' }, 'Selecciona un botón para decir qué hace al pulsarlo (abrir/cerrar ventanas con animación). Se exporta como un LocalScript real para Roblox.')));
    }
    // overview
    const all = [];
    if (scr) walk(scr, (n) => {
      for (const it of n.interactions || []) all.push([n, it]);
    });
    const ov = h('div');
    for (const [n, it] of all) {
      const t = it.target ? s.get(it.target) : null;
      const row = h('div', { class: 'row', style: { paddingLeft: '8px' } }, h('span', { class: 'ico', html: icon('link') }), h('span', { class: 'nm' }, `${n.Name} → ${it.action === 'closeParent' ? 'cerrar ventana' : `${it.action} ${t?.Name || '?'}`}`));
      row.addEventListener('click', () => s.select(n.id));
      ov.append(row);
    }
    if (!all.length) ov.append(h('div', { class: 'hint' }, 'Sin interacciones en esta pantalla.'));
    const play = h('button', { class: 'btn primary', style: { marginTop: '8px', width: '100%' } }, '▶ Probar (F5)');
    play.addEventListener('click', () => this.play());
    ov.append(play);
    wrap.append(section('En esta pantalla', ov));
    this.host.append(wrap);
  }

  guessTarget(btn) {
    const s = this.store;
    const scr = s.screenOf(btn.id);
    const name = btn.Name.replace(/Button$/i, '').toLowerCase();
    let best = null;
    walk(scr, (n) => {
      if (n.ClassName === 'Frame' || n.ClassName === 'CanvasGroup') {
        const nn = n.Name.toLowerCase();
        if (name && nn.includes(name) && nn !== btn.Name.toLowerCase()) best = best || n.id;
      }
    });
    if (!best) walk(scr, (n) => {
      if (!best && (n.ClassName === 'Frame' || n.ClassName === 'CanvasGroup') && n.props.Visible === false) best = n.id;
    });
    return best;
  }

  interactionCard(n, it, i) {
    const s = this.store;
    const scr = s.screenOf(n.id);
    const upd = (patch) => s.edit('Interacción', () => Object.assign(n.interactions[i], patch));
    const targets = [];
    walk(scr, (x, p, depth) => {
      if (x !== scr && isGuiObject(x.ClassName) && x.id !== n.id && !isButton(x.ClassName) && x.ClassName !== 'TextLabel' && x.ClassName !== 'ImageLabel') targets.push([x.id, '  '.repeat(Math.max(0, depth - 1)) + x.Name]);
    });
    const rm = h('button', { class: 'icon-btn', title: 'Quitar', html: icon('minus') });
    rm.addEventListener('click', () => s.edit('Quitar interacción', () => n.interactions.splice(i, 1)));
    const card = h('div', { class: 'mod-card' }, h('div', { class: 'mod-hd' }, h('span', { class: 'nm' }, `Interacción ${i + 1}`), rm),
      h('div', { class: 'grid2' },
        select(TRIGGERS, it.trigger, (v) => upd({ trigger: v })),
        select(ACTIONS, it.action, (v) => upd({ action: v }))));
    if (it.trigger === 'key') card.append(h('div', { class: 'field', style: { marginTop: '6px' } }, h('label', {}, 'Tecla'), select(KEYS.map((k) => [k, k]), it.key || 'E', (v) => upd({ key: v }))));
    if (it.trigger === 'delay') card.append(h('div', { class: 'field', style: { marginTop: '6px' } }, h('label', {}, 'Segundos'), numInput({ value: it.delay ?? 3, step: 0.5, decimals: 2, min: 0, onChange: (v, f) => f && upd({ delay: v }) })));
    if (it.action === 'navigate') {
      const screens = s.doc.screens.filter((x) => !x.design?.componentsPage && x.id !== scr.id);
      card.append(h('div', { class: 'field', style: { marginTop: '6px' } }, h('label', {}, 'Pantalla'), select([['', '— elige —'], ...screens.map((x) => [x.Name, x.Name])], it.screen || '', (v) => upd({ screen: v || null }))));
      card.append(h('div', { class: 'hint' }, 'Desactiva este ScreenGui y activa el otro (Enabled). Exporta ambas pantallas.'));
      return card;
    }
    if (it.action !== 'closeParent') {
      const pick = h('button', { class: 'icon-btn', title: 'Elegir en el lienzo', html: icon('target') });
      pick.addEventListener('click', () => this.pickTarget((id) => upd({ target: id })));
      card.append(h('div', { class: 'field', style: { marginTop: '6px' } }, h('label', {}, 'Destino'), select([['', '— elige —'], ...targets], it.target || '', (v) => upd({ target: v || null })), pick));
    }
    card.append(h('div', { class: 'grid2' }, select(ANIMS, it.animation || 'pop', (v) => upd({ animation: v })),
      numInput({ label: 's', value: it.duration ?? 0.22, step: 0.05, decimals: 2, min: 0, max: 3, title: 'Duración (segundos)', onChange: (v, f) => f && upd({ duration: v }) })));
    card.append(h('div', { class: 'grid2', style: { marginTop: '6px' } }, checkbox('Desenfocar fondo', !!it.blur, (v) => upd({ blur: v }), 'Añade BlurEffect en Lighting mientras la ventana está abierta'), checkbox('Cierra las demás', it.exclusive !== false, (v) => upd({ exclusive: v }))));
    return card;
  }

  pickTarget(cb) {
    const c = this.app.canvas;
    c.showHint('Haz clic en el objeto destino (Esc para cancelar)', 4000);
    const handler = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const [wx, wy] = c.toWorld(e.clientX, e.clientY);
      const id = c.pickFromPath(c.hitPath(wx, wy), true);
      c.canvasEl.removeEventListener('pointerdown', handler, true);
      if (id) {
        // prefer the nearest Frame ancestor ("window")
        let n = this.store.get(id);
        while (n && !['Frame', 'CanvasGroup', 'ScrollingFrame'].includes(n.ClassName)) n = this.store.parentOf(n.id);
        cb((n || this.store.get(id)).id);
      }
    };
    c.canvasEl.addEventListener('pointerdown', handler, true);
  }

  // ---------- play mode ----------
  play() {
    const s = this.store;
    const scr = s.activeScreen;
    if (!scr || scr.design.componentsPage) return;
    const doc = { ...s.doc, screens: [deepClone(scr)] };
    const screen = doc.screens[0];
    const back = h('div', { class: 'preview-back' });
    const title = h('span', { style: { fontWeight: 600 } }, `▶ ${scr.Name}`);
    const devSel = select([['fit', 'Ajustar a la ventana'], ['1', '100%']], 'fit', () => layout());
    const close = h('button', { class: 'btn' }, 'Salir (Esc)');
    const reset = h('button', { class: 'btn ghost' }, 'Reiniciar');
    const stage = h('div', { class: 'preview-stage' });
    back.append(h('header', {}, title, h('span', { class: 'hint' }, 'Así se comportará en Roblox (animaciones del LocalScript exportado).'), h('span', { style: { flex: 1 } }), devSel, reset, close), stage);
    document.body.append(back);
    const host = h('div');
    stage.append(host);
    const r = new ScreenRenderer(host, { doc, mode: 'preview', onFontsLoaded: () => r.render(screen) });
    const ids = new Map();
    walk(screen, (n) => ids.set(n.id, n));
    const layout = () => {
      const W = stage.clientWidth, H = stage.clientHeight;
      const k = devSel.value === 'fit' ? Math.min(W / screen.design.width, H / screen.design.height) : 1;
      r.root.style.transform = `scale(${k})`;
      r.root.style.left = (W - screen.design.width * k) / 2 + 'px';
      r.root.style.top = (H - screen.design.height * k) / 2 + 'px';
      r.root.style.background = screen.design.background || '#3A6EA5';
      if (screen.design.backgroundImage) r.root.style.backgroundImage = `url(${screen.design.backgroundImage})`;
      r.root.style.backgroundSize = 'cover';
    };
    r.render(screen);
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(stage);
    const busy = new Set();
    const opened = new Set();
    const el = (id) => r.els.get(id)?.el;
    const anim = (id, kind, show, t) => new Promise((res) => {
      const e = el(id);
      const n = ids.get(id);
      if (!e || !n) return res();
      const box = r.boxes.get(id);
      const ms = Math.max(1, t * 1000);
      const ox = (box?.anchor?.[0] ?? 0) * box.w, oy = (box?.anchor?.[1] ?? 0) * box.h;
      let frames;
      if (kind === 'pop') {
        const sc = (v) => ({ translate: `${ox * (1 - v)}px ${oy * (1 - v)}px`, scale: `${v}` });
        frames = show ? [sc(0.6), sc(1.04), sc(1)] : [sc(1), sc(0.6)];
      } else if (kind === 'fade') frames = show ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
      else if (kind.startsWith('slide')) {
        const pb = r.boxes.get(this.parentId(screen, id)) || { w: screen.design.width, h: screen.design.height };
        const d = { slideUp: [0, 0.35 * pb.h], slideDown: [0, -0.35 * pb.h], slideLeft: [0.35 * pb.w, 0], slideRight: [-0.35 * pb.w, 0] }[kind] || [0, 0];
        frames = show ? [{ translate: `${d[0]}px ${d[1]}px` }, { translate: '0px 0px' }] : [{ translate: '0px 0px' }, { translate: `${d[0]}px ${d[1]}px` }];
      } else return res();
      const a = e.animate(frames, { duration: ms, easing: show ? 'cubic-bezier(.34,1.56,.64,1)' : 'ease-in', fill: 'forwards' });
      a.onfinish = () => {
        a.cancel();
        res();
      };
    });
    const setVisible = (id, v) => {
      const n = ids.get(id);
      if (n) n.props.Visible = v;
      r.render(screen);
    };
    const blurLayer = h('div', { style: { position: 'absolute', inset: 0, backdropFilter: 'blur(0px)', pointerEvents: 'none', transition: 'backdrop-filter .2s' } });
    let blurCount = 0;
    const setBlur = (on) => {
      blurCount = Math.max(0, blurCount + (on ? 1 : -1));
      blurLayer.style.backdropFilter = blurCount ? 'blur(6px)' : 'blur(0px)';
    };
    const show = async (id, a) => {
      const n = ids.get(id);
      if (!n || busy.has(id) || n.props.Visible !== false) return;
      busy.add(id);
      if (a.blur) {
        if (!blurLayer.isConnected) r.root.prepend(blurLayer);
        setBlur(true);
      }
      setVisible(id, true);
      opened.add(id);
      n._blur = !!a.blur;
      await anim(id, a.animation || 'pop', true, a.duration ?? 0.22);
      busy.delete(id);
    };
    const hide = async (id, a) => {
      const n = ids.get(id);
      if (!n || busy.has(id) || n.props.Visible === false) return;
      busy.add(id);
      opened.delete(id);
      if (n._blur) setBlur(false);
      await anim(id, a.animation || 'pop', false, (a.duration ?? 0.22) * 0.8);
      setVisible(id, false);
      busy.delete(id);
    };
    const run = (src, a) => {
      if (a.action === 'navigate') {
        const target = this.store.doc.screens.find((x) => x.Name === a.screen);
        if (target) {
          exit();
          this.store.activeScreenId = target.id;
          this.play();
        }
        return;
      }
      if (a.action === 'closeParent') {
        let p = this.parentNode(screen, src.id);
        while (p && p !== screen) {
          if (opened.has(p.id) || this.parentNode(screen, p.id) === screen) return hide(p.id, a);
          p = this.parentNode(screen, p.id);
        }
        return;
      }
      const t = a.target && ids.get(a.target);
      if (!t) return;
      if (a.action === 'open' || (a.action === 'toggle' && t.props.Visible === false)) {
        if (a.exclusive !== false) for (const o of [...opened]) if (o !== t.id) hide(o, a);
        show(t.id, a);
      } else hide(t.id, a);
    };
    const nodeAt = (e) => {
      const hit = document.elementsFromPoint(e.clientX, e.clientY);
      for (const x of hit) {
        const ne = x.closest?.('.rbx-node');
        if (!ne || !r.root.contains(ne)) continue;
        let n = ids.get(ne.dataset.id);
        // bubble to nearest interactive ancestor
        while (n) {
          if (isButton(n.ClassName) || n.interactions?.length) return n;
          n = this.parentNode(screen, n.id);
        }
      }
      return null;
    };
    let hoverN = null;
    const fxScale = (n, v) => {
      const e = el(n.id), box = r.boxes.get(n.id);
      if (!e || !box) return;
      const ox = (box.anchor?.[0] ?? 0) * box.w, oy = (box.anchor?.[1] ?? 0) * box.h;
      e.style.transition = 'scale .12s ease-out, translate .12s ease-out';
      e.style.scale = String(v);
      e.style.translate = `${ox * (1 - v)}px ${oy * (1 - v)}px`;
    };
    stage.addEventListener('pointermove', (e) => {
      const n = nodeAt(e);
      if (n === hoverN) return;
      if (hoverN) {
        if (hoverN.buttonFx) fxScale(hoverN, 1);
        r.state.delete(hoverN.id);
      }
      hoverN = n;
      if (n) {
        if (n.buttonFx) fxScale(n, n.buttonFx.hover);
        r.state.set(n.id, { hover: true });
        for (const a of n.interactions || []) if (a.trigger === 'hover') run(n, a);
      }
      r.render(screen);
      stage.style.cursor = n && isButton(n.ClassName) ? 'pointer' : '';
    });
    stage.addEventListener('pointerdown', (e) => {
      const n = nodeAt(e);
      if (!n) return;
      if (n.buttonFx) fxScale(n, n.buttonFx.press);
      r.state.set(n.id, { hover: true, pressed: true });
      r.render(screen);
    });
    stage.addEventListener('pointerup', (e) => {
      const n = nodeAt(e);
      if (!n) return;
      if (n.buttonFx) fxScale(n, n.buttonFx.hover);
      r.state.set(n.id, { hover: true });
      r.render(screen);
      if (isButton(n.ClassName)) for (const a of n.interactions || []) if (a.trigger !== 'hover') run(n, a);
    });
    const timers = [];
    const exit = () => {
      ro.disconnect();
      back.remove();
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', key, true);
    };
    const keyName = (e) => (e.key.length === 1 ? e.key.toUpperCase() : { Enter: 'Return', ' ': 'Space', Shift: 'LeftShift' }[e.key] || e.key);
    const digit = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five' };
    const key = (e) => {
      const kn = digit[e.key] || keyName(e);
      let handled = false;
      walk(screen, (n) => {
        for (const a of n.interactions || []) if (a.trigger === 'key' && (a.key || 'E') === kn) {
          run(n, a);
          handled = true;
        }
      });
      if (e.key === 'Escape' && !handled) {
        e.stopPropagation();
        exit();
      }
    };
    walk(screen, (n) => {
      for (const a of n.interactions || []) if (a.trigger === 'delay') timers.push(setTimeout(() => run(n, a), (a.delay ?? 3) * 1000));
    });
    window.addEventListener('keydown', key, true);
    close.addEventListener('click', exit);
    reset.addEventListener('click', () => {
      exit();
      this.play();
    });
  }

  parentNode(screen, id) {
    let found = null;
    walk(screen, (n, p) => {
      if (n.id === id) {
        found = p;
        return false;
      }
    });
    return found;
  }
  parentId(screen, id) {
    return this.parentNode(screen, id)?.id;
  }
}

function section(title, body, sub) {
  return h('div', { class: 'insp-section' }, h('div', { class: 'hd' }, h('span', { class: 't' }, title, sub ? h('small', {}, sub) : null)), h('div', { class: 'bd' }, body));
}

export { chainIds };
