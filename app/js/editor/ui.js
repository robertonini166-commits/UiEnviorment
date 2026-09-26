// Tiny DOM helpers + reusable widgets (number scrubbers, color fields, selects, popovers, menus, dialogs, toasts).

import { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, clamp, round } from '../core/types.js';
import { icon } from './icons.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const iconEl = (name, cls = '') => h('span', { class: 'ic ' + cls, html: icon(name) });

// ---------- expression evaluation for numeric inputs ("100/2", "+=10") ----------
export function evalNum(str, cur) {
  let s = String(str).trim().replace(',', '.');
  if (!s) return null;
  const rel = s.match(/^([+\-*/])=\s*(.+)$/);
  if (rel && cur != null) s = `${cur}${rel[1]}(${rel[2]})`;
  if (!/^[\d\s.+\-*/()%e]+$/i.test(s)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function(`"use strict";return (${s})`)();
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Numeric input with drag-to-scrub label.
 * opts: { label, value, step, min, max, decimals, onChange(v, final), mixed, title, width }
 */
export function numInput(opts) {
  const dec = opts.decimals ?? 3;
  const inp = h('input', { type: 'text', spellcheck: 'false', value: opts.mixed ? 'Mixto' : fmt(opts.value, dec), title: opts.title || '' });
  const pre = h('span', { class: 'pre', title: 'Arrastra para ajustar' }, opts.label ?? '');
  const wrap = h('div', { class: 'num' + (opts.mixed ? ' mixed' : '') }, pre, inp);
  if (opts.width) wrap.style.flex = `0 0 ${opts.width}px`;
  let cur = opts.value;
  const clampV = (v) => clamp(v, opts.min ?? -Infinity, opts.max ?? Infinity);
  const commit = (final = true) => {
    const v = evalNum(inp.value, cur);
    if (v == null) {
      inp.value = opts.mixed ? 'Mixto' : fmt(cur, dec);
      return;
    }
    cur = clampV(round(v, dec));
    inp.value = fmt(cur, dec);
    opts.onChange?.(cur, final);
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit();
      inp.select();
    } else if (e.key === 'Escape') {
      inp.value = fmt(cur, dec);
      inp.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const st = (opts.step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      cur = clampV(round((Number(cur) || 0) + st, dec));
      inp.value = fmt(cur, dec);
      opts.onChange?.(cur, true);
    }
    e.stopPropagation();
  });
  inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
  inp.addEventListener('blur', () => commit());
  pre.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const x0 = e.clientX, v0 = Number(cur) || 0;
    pre.setPointerCapture(e.pointerId);
    let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - x0;
      if (Math.abs(dx) > 1) moved = true;
      const st = (opts.step ?? 1) * (ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1);
      cur = clampV(round(v0 + Math.round(dx / 2) * st, dec));
      inp.value = fmt(cur, dec);
      opts.onChange?.(cur, false);
    };
    const up = () => {
      pre.removeEventListener('pointermove', move);
      pre.removeEventListener('pointerup', up);
      if (moved) opts.onChange?.(cur, true);
      else inp.focus();
    };
    pre.addEventListener('pointermove', move);
    pre.addEventListener('pointerup', up);
  });
  wrap.setValue = (v) => {
    cur = v;
    if (document.activeElement !== inp) inp.value = fmt(v, dec);
  };
  return wrap;
}

export function fmt(v, dec = 3) {
  if (v == null || Number.isNaN(v)) return '';
  const r = round(Number(v), dec);
  return Object.is(r, -0) ? '0' : String(r);
}

export function textInput(value, onChange, opts = {}) {
  const el = h(opts.multiline ? 'textarea' : 'input', { class: 'txt', spellcheck: 'false', placeholder: opts.placeholder || '', title: opts.title || '' });
  el.value = value ?? '';
  let last = el.value;
  const fire = () => {
    if (el.value !== last) {
      last = el.value;
      onChange(el.value);
    }
  };
  el.addEventListener('change', fire);
  if (opts.live) el.addEventListener('input', () => onChange(el.value, false));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (!opts.multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      fire();
      el.blur();
    }
    e.stopPropagation();
  });
  return el;
}

export function select(options, value, onChange, opts = {}) {
  const el = h('select', { class: 'sel', title: opts.title || '' });
  for (const o of options) {
    const [v, label] = Array.isArray(o) ? o : [o, o];
    const op = h('option', { value: v }, label);
    if (v === value) op.selected = true;
    el.append(op);
  }
  if (opts.mixed) {
    const op = h('option', { value: '', disabled: true, selected: true }, 'Mixto');
    el.prepend(op);
  }
  el.addEventListener('change', () => onChange(el.value));
  el.addEventListener('keydown', (e) => e.stopPropagation());
  return el;
}

export function checkbox(label, value, onChange, title = '') {
  const inp = h('input', { type: 'checkbox' });
  inp.checked = !!value;
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label', { class: 'check', title }, inp, label);
}

export function seg(options, value, onChange) {
  const el = h('div', { class: 'seg' });
  for (const o of options) {
    const [v, label, tip] = o;
    const b = h('button', { class: v === value ? 'on' : '', title: tip || '', html: label.startsWith('<svg') ? label : null }, label.startsWith('<svg') ? null : label);
    b.addEventListener('click', () => onChange(v));
    el.append(b);
  }
  return el;
}

export function field(label, ...controls) {
  return h('div', { class: 'field' }, label != null ? h('label', { title: label }, label) : null, ...controls);
}

// ---------- popovers ----------
const layer = () => document.getElementById('popover-layer');
let openPops = [];

export function closePopovers(keepFn) {
  openPops = openPops.filter((p) => {
    if (keepFn && keepFn(p)) return true;
    p.el.remove();
    p.onClose?.();
    return false;
  });
}

export function popover(content, anchor, opts = {}) {
  if (!opts.stack) closePopovers();
  const el = h('div', { class: 'popover ' + (opts.class || '') }, content);
  layer().append(el);
  const place = () => {
    const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, top: anchor.y, right: anchor.x, bottom: anchor.y, width: 0, height: 0 };
    const pw = el.offsetWidth, ph = el.offsetHeight;
    let x = opts.side === 'right' ? r.right + 4 : opts.side === 'left' ? r.left - pw - 6 : r.left;
    let y = opts.side === 'right' || opts.side === 'left' ? r.top : r.bottom + 4;
    x = clamp(x, 6, innerWidth - pw - 6);
    if (y + ph > innerHeight - 6) y = Math.max(6, (opts.side ? r.bottom : r.top - 4) - ph);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  };
  place();
  const rec = { el, onClose: opts.onClose, anchor };
  openPops.push(rec);
  setTimeout(() => {
    const off = (e) => {
      if (!el.isConnected) return document.removeEventListener('pointerdown', off, true);
      if (el.contains(e.target) || (anchor instanceof Element && anchor.contains(e.target))) return;
      if (openPops.some((p) => p !== rec && p.el.contains(e.target) && openPops.indexOf(p) > openPops.indexOf(rec))) return;
      document.removeEventListener('pointerdown', off, true);
      el.remove();
      openPops = openPops.filter((p) => p !== rec);
      rec.onClose?.();
    };
    document.addEventListener('pointerdown', off, true);
  });
  el.reposition = place;
  el.close = () => {
    el.remove();
    openPops = openPops.filter((p) => p !== rec);
    rec.onClose?.();
  };
  return el;
}

/**
 * Menu: items = [{ label, shortcut, action, disabled, submenu: items, sep: true, header }]
 */
export function menu(items, anchor, opts = {}) {
  const box = h('div', { class: 'menu' });
  let sub = null;
  for (const it of items) {
    if (!it) continue;
    if (it.sep) {
      box.append(h('div', { class: 'sep' }));
      continue;
    }
    if (it.header) {
      box.append(h('div', { class: 'hdr' }, it.header));
      continue;
    }
    const mi = h('div', { class: 'mi' + (it.disabled ? ' disabled' : '') }, it.icon ? iconEl(it.icon) : null, h('span', {}, it.label), it.submenu ? h('span', { class: 'arrow' }, '›') : it.shortcut ? h('span', { class: 'sc' }, it.shortcut) : null);
    mi.addEventListener('pointerenter', () => {
      if (sub) {
        sub.close();
        sub = null;
      }
      box.querySelectorAll('.mi.hot').forEach((m) => m.classList.remove('hot'));
      if (it.submenu) {
        mi.classList.add('hot');
        sub = menu(it.submenu, mi, { side: 'right', stack: true, parentClose: () => pop.close() });
      }
    });
    mi.addEventListener('click', (e) => {
      if (it.submenu) return;
      e.stopPropagation();
      closePopovers();
      it.action?.();
    });
    box.append(mi);
  }
  const pop = popover(box, anchor, Object.assign({ class: 'menu-pop' }, opts));
  return pop;
}

// ---------- color picker ----------
export function colorPicker({ color, alpha = null, swatches = [], onChange }) {
  let [r, g, b] = hexToRgb(color);
  let [hh, ss, vv] = rgbToHsv(r, g, b);
  let a = alpha;
  const sv = h('div', { class: 'sv' });
  const svKnob = h('div', { class: 'knob' });
  sv.append(svKnob);
  const hue = h('div', { class: 'hue' }, h('div', { class: 'knob' }));
  const alp = a != null ? h('div', { class: 'alp' }, h('div', { class: 'knob' })) : null;
  const hex = h('input', { class: 'txt', style: { width: '80px' }, spellcheck: 'false' });
  const rgbIn = ['R', 'G', 'B'].map((l) => numInput({ label: l, value: 0, step: 1, min: 0, max: 255, decimals: 0, onChange: () => {} }));
  const update = (fire = true, final = false) => {
    [r, g, b] = hsvToRgb(hh, ss, vv).map(Math.round);
    const hx = rgbToHex(r, g, b);
    sv.style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${hh},100%,50%))`;
    svKnob.style.left = ss * 100 + '%';
    svKnob.style.top = (1 - vv) * 100 + '%';
    svKnob.style.background = hx;
    hue.firstChild.style.left = (hh / 360) * 100 + '%';
    if (alp) {
      alp.style.background = `linear-gradient(90deg, ${hx}, transparent), repeating-conic-gradient(#777 0 25%, #555 0 50%) 0 0/8px 8px`;
      alp.firstChild.style.left = (1 - a) * 100 + '%';
    }
    if (document.activeElement !== hex) hex.value = hx;
    [r, g, b].forEach((v, i) => rgbIn[i].setValue(v));
    if (fire) onChange(hx, a, final);
  };
  const drag = (el, fn) => {
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const rc = el.getBoundingClientRect();
      const go = (ev) => fn(clamp((ev.clientX - rc.left) / rc.width, 0, 1), clamp((ev.clientY - rc.top) / rc.height, 0, 1));
      go(e);
      update(true, false);
      const mv = (ev) => {
        go(ev);
        update(true, false);
      };
      const up = () => {
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        update(true, true);
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
    });
  };
  drag(sv, (x, y) => {
    ss = x;
    vv = 1 - y;
  });
  drag(hue, (x) => {
    hh = Math.min(359.9, x * 360);
  });
  if (alp) drag(alp, (x) => {
    a = round(1 - x, 3);
  });
  hex.addEventListener('change', () => {
    const v = hex.value.trim().replace(/^#?/, '#');
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) {
      [r, g, b] = hexToRgb(v);
      [hh, ss, vv] = rgbToHsv(r, g, b);
      update(true, true);
    }
  });
  hex.addEventListener('keydown', (e) => e.stopPropagation());
  rgbIn.forEach((inp, i) => {
    inp.querySelector('input').addEventListener('change', () => {
      const vals = rgbIn.map((x) => +x.querySelector('input').value || 0);
      [hh, ss, vv] = rgbToHsv(...vals);
      update(true, true);
    });
  });
  const eyedrop = 'EyeDropper' in window ? h('button', { class: 'icon-btn', title: 'Cuentagotas', html: icon('target') }) : null;
  eyedrop?.addEventListener('click', async () => {
    try {
      const res = await new window.EyeDropper().open();
      [r, g, b] = hexToRgb(res.sRGBHex);
      [hh, ss, vv] = rgbToHsv(r, g, b);
      update(true, true);
    } catch { /* cancelled */ }
  });
  const sw = h('div', { class: 'swatches' }, swatches.map((c) => {
    const bt = h('button', { style: { background: c }, title: c });
    bt.addEventListener('click', () => {
      [r, g, b] = hexToRgb(c);
      [hh, ss, vv] = rgbToHsv(r, g, b);
      update(true, true);
    });
    return bt;
  }));
  const el = h('div', { class: 'cp' }, sv, hue, alp, h('div', { class: 'row2' }, hex, eyedrop), h('div', { class: 'row2' }, ...rgbIn), sw);
  update(false);
  return el;
}

/**
 * Color field (swatch + hex + optional transparency 0..1 in Roblox semantics).
 * onChange(hex, transparency, final)
 */
export function colorField({ color, transparency, onChange, swatches, mixed }) {
  const sw = h('span', { class: 'swatch' }, h('i', { style: { background: color, opacity: transparency != null ? 1 - transparency : 1 } }));
  const hex = h('input', { class: 'hex', spellcheck: 'false', value: mixed ? 'Mixto' : color.replace('#', '') });
  const wrap = h('div', { class: 'color-field' }, sw, hex);
  let tr = transparency;
  let alphaInput = null;
  if (transparency != null) {
    alphaInput = numInput({ label: 'T', value: transparency, step: 0.05, min: 0, max: 1, decimals: 3, title: 'Transparencia (0 = opaco, 1 = invisible)', onChange: (v, final) => {
      tr = v;
      sw.firstChild.style.opacity = 1 - v;
      onChange(color, v, final);
    } });
    alphaInput.classList.add('alpha');
    wrap.append(alphaInput);
  }
  hex.addEventListener('keydown', (e) => e.stopPropagation());
  hex.addEventListener('change', () => {
    const v = '#' + hex.value.trim().replace(/^#/, '');
    if (/^#[0-9a-f]{6}$/i.test(v) || /^#[0-9a-f]{3}$/i.test(v)) {
      color = rgbToHex(...hexToRgb(v));
      sw.firstChild.style.background = color;
      onChange(color, tr, true);
    } else hex.value = color.replace('#', '');
  });
  sw.addEventListener('click', () => {
    popover(colorPicker({ color, alpha: tr != null ? 1 - tr : null, swatches: swatches || [], onChange: (c, a, final) => {
      color = c;
      sw.firstChild.style.background = c;
      hex.value = c.replace('#', '');
      if (a != null) {
        tr = round(1 - a, 3);
        sw.firstChild.style.opacity = a;
        alphaInput?.setValue(tr);
      }
      onChange(c, tr, final);
    } }), sw, { side: 'left' });
  });
  return wrap;
}

// ---------- dialogs & toasts ----------
export function dialog(title, body, buttons = [{ label: 'Cerrar' }], opts = {}) {
  const back = h('div', { class: 'dialog-back' });
  const close = () => {
    back.remove();
    opts.onClose?.();
  };
  const foot = h('footer', {}, buttons.map((b) => {
    const bt = h('button', { class: 'btn ' + (b.primary ? 'primary' : '') }, b.label);
    bt.addEventListener('click', async () => {
      const r = b.action ? await b.action() : undefined;
      if (r !== false) close();
    });
    return bt;
  }));
  const xb = h('button', { class: 'icon-btn', html: icon('x'), title: 'Cerrar' });
  xb.addEventListener('click', close);
  const dlg = h('div', { class: 'dialog', style: opts.width ? { width: opts.width } : null }, h('header', {}, title, xb), h('div', { class: 'body' }, body), foot);
  back.append(dlg);
  back.addEventListener('pointerdown', (e) => {
    if (e.target === back) close();
  });
  back.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    e.stopPropagation();
  });
  document.body.append(back);
  back.close = close;
  return back;
}

let toastTimer = null;
export function toast(msg, kind = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 2600);
}

export function download(filename, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
