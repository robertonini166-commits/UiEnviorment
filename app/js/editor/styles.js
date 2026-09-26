// Linked styles (Figma "color styles" / "text styles").
// doc.styles = { colors: [{id,name,value}], texts: [{id,name,FontFace,TextSize,LineHeight,TextColor3}] }
// node.editor.links = { BackgroundColor3: styleId, TextColor3: styleId, Color: styleId, text: textStyleId }
// Changing a style updates every linked property; editing a linked property by hand unlinks it.

import { walk } from '../core/model.js';
import { isText, isGuiObject } from '../core/schema.js';
import { newId, deepEqual, deepClone } from '../core/types.js';
import { h, menu, popover, colorPicker, textInput, toast } from './ui.js';
import { icon } from './icons.js';
import { cssFamily, ensureFont } from '../core/fonts.js';
import { WEIGHTS } from '../core/schema.js';

const TEXT_KEYS = ['FontFace', 'TextSize', 'LineHeight', 'TextColor3'];

export class Styles {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this._busy = false;
    this.store.on((w) => {
      if (w.live || !w.doc || this._busy) return;
      this.propagate();
    });
  }

  get styles() {
    const d = this.store.doc;
    d.styles = d.styles || { colors: [], texts: [] };
    d.styles.colors = d.styles.colors || [];
    d.styles.texts = d.styles.texts || [];
    return d.styles;
  }

  color(id) {
    return this.styles.colors.find((c) => c.id === id);
  }
  text(id) {
    return this.styles.texts.find((c) => c.id === id);
  }

  /** Re-applies styles to linked properties (silent, part of the same undo step). */
  propagate() {
    let changed = false;
    this._busy = true;
    try {
      for (const scr of this.store.doc.screens) walk(scr, (n) => {
        const links = n.editor?.links;
        if (!links) return;
        for (const [prop, sid] of Object.entries(links)) {
          if (prop === 'text') {
            const ts = this.text(sid);
            if (!ts) {
              delete links.text;
              continue;
            }
            for (const k of TEXT_KEYS) if (ts[k] !== undefined && !deepEqual(n.props[k], ts[k])) {
              n.props[k] = deepClone(ts[k]);
              changed = true;
            }
            continue;
          }
          const cs = this.color(sid);
          if (!cs) {
            delete links[prop];
            continue;
          }
          if (prop in n.props && n.props[prop] !== cs.value) {
            n.props[prop] = cs.value;
            changed = true;
          }
        }
      });
      if (changed) {
        this.store._index = null;
        this.store.emit({ doc: true, stylesSynced: true });
      }
    } finally {
      this._busy = false;
    }
  }

  /** Called by Commands.setProp: a manual edit of a linked property breaks the link. */
  onManualEdit(n, prop) {
    const links = n.editor?.links;
    if (!links) return;
    if (links[prop]) {
      const cs = this.color(links[prop]);
      if (!cs || cs.value !== n.props[prop]) delete links[prop];
    }
    if (links.text && TEXT_KEYS.includes(prop)) {
      const ts = this.text(links.text);
      if (!ts || !deepEqual(ts[prop], n.props[prop])) delete links.text;
    }
  }

  applyColor(sid, prop, nodes) {
    const cs = this.color(sid);
    if (!cs) return;
    this.store.edit(`Estilo ${cs.name}`, () => {
      for (const n of nodes) {
        const target = n.ClassName === 'UIStroke' ? 'Color' : prop;
        if (!(target in n.props)) continue;
        n.props[target] = cs.value;
        n.editor = Object.assign({}, n.editor, { links: Object.assign({}, n.editor?.links, { [target]: sid }) });
      }
    });
  }

  applyText(sid, nodes) {
    const ts = this.text(sid);
    if (!ts) return;
    this.store.edit(`Estilo de texto ${ts.name}`, () => {
      for (const n of nodes.filter((x) => isText(x.ClassName))) {
        for (const k of TEXT_KEYS) if (ts[k] !== undefined) n.props[k] = deepClone(ts[k]);
        n.editor = Object.assign({}, n.editor, { links: Object.assign({}, n.editor?.links, { text: sid }) });
      }
    });
  }

  addColorFromSelection() {
    const n = this.store.selectedNodes()[0];
    const value = n ? (isText(n.ClassName) && n.props.BackgroundTransparency >= 1 ? n.props.TextColor3 : n.props.BackgroundColor3 || n.props.Color) : '#FF7A00';
    const name = prompt('Nombre del estilo de color', 'Color ' + (this.styles.colors.length + 1));
    if (!name) return;
    const id = newId('s');
    this.store.edit('Nuevo estilo de color', () => this.styles.colors.push({ id, name, value: value || '#FFFFFF' }));
  }

  addTextFromSelection() {
    const n = this.store.selectedNodes().find((x) => isText(x.ClassName));
    if (!n) return toast('Selecciona un texto para crear el estilo');
    const name = prompt('Nombre del estilo de texto', 'Título');
    if (!name) return;
    const id = newId('t');
    this.store.edit('Nuevo estilo de texto', () => {
      this.styles.texts.push({ id, name, ...Object.fromEntries(TEXT_KEYS.map((k) => [k, deepClone(n.props[k])])) });
      n.editor = Object.assign({}, n.editor, { links: Object.assign({}, n.editor?.links, { text: id }) });
    });
  }

  usage(sid) {
    let c = 0;
    for (const scr of this.store.doc.screens) walk(scr, (n) => {
      if (n.editor?.links && Object.values(n.editor.links).includes(sid)) c++;
    });
    return c;
  }

  renderPanel(host) {
    host.innerHTML = '';
    const st = this.styles;
    const addC = h('button', { class: 'icon-btn', title: 'Nuevo estilo de color (desde la selección)', html: icon('plus') });
    addC.addEventListener('click', () => this.addColorFromSelection());
    host.append(h('div', { class: 'section-title' }, `Estilos de color (${st.colors.length})`, h('div', { class: 'actions' }, addC)));
    if (!st.colors.length) host.append(h('div', { class: 'hint', style: { padding: '0 12px 8px' } }, 'Guarda los colores de tu juego como estilos: al cambiar uno, cambian todos los objetos enlazados.'));
    for (const c of st.colors) {
      const sw = h('span', { class: 'swatch', style: { marginLeft: 0 } }, h('i', { style: { background: c.value } }));
      const row = h('div', { class: 'row', style: { paddingLeft: '12px' } }, sw, h('span', { class: 'nm' }, c.name, h('span', { style: { color: 'var(--faint)', marginLeft: '6px' } }, `${c.value} · ${this.usage(c.id)}`)));
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        popover(colorPicker({ color: c.value, swatches: this.store.doc.swatches, onChange: (v, a, final) => {
          if (final) this.store.edit('Editar estilo', () => (c.value = v));
        } }), sw, { side: 'right' });
      });
      row.addEventListener('click', () => {
        const nodes = this.store.selectedNodes();
        if (!nodes.length) return toast('Selecciona objetos para aplicar el estilo');
        menu([
          { label: 'Aplicar como fondo (BackgroundColor3)', action: () => this.applyColor(c.id, 'BackgroundColor3', nodes) },
          { label: 'Aplicar como color de texto', action: () => this.applyColor(c.id, 'TextColor3', nodes) },
          { label: 'Aplicar a sus contornos (UIStroke)', action: () => this.applyColor(c.id, 'Color', nodes.flatMap((n) => n.children.filter((x) => x.ClassName === 'UIStroke'))) },
          { label: 'Aplicar como tinte de imagen', action: () => this.applyColor(c.id, 'ImageColor3', nodes) },
          { sep: true },
          { label: 'Renombrar', action: () => {
            const nm = prompt('Nombre', c.name);
            if (nm) this.store.edit('Renombrar estilo', () => (c.name = nm));
          } },
          { label: 'Eliminar estilo', action: () => this.store.edit('Eliminar estilo', () => st.colors.splice(st.colors.indexOf(c), 1)) },
        ], row);
      });
      host.append(row);
    }
    const addT = h('button', { class: 'icon-btn', title: 'Nuevo estilo de texto (desde la selección)', html: icon('plus') });
    addT.addEventListener('click', () => this.addTextFromSelection());
    host.append(h('div', { class: 'section-title' }, `Estilos de texto (${st.texts.length})`, h('div', { class: 'actions' }, addT)));
    for (const t of st.texts) {
      ensureFont(t.FontFace?.family, t.FontFace?.weight, t.FontFace?.style);
      const row = h('div', { class: 'row', style: { paddingLeft: '12px', height: '32px' } }, h('span', { class: 'nm', style: { fontFamily: cssFamily(t.FontFace?.family), fontWeight: WEIGHTS[t.FontFace?.weight] || 400, fontSize: '14px' } }, t.name), h('span', { class: 'hint' }, `${t.TextSize}px · ${this.usage(t.id)}`));
      row.addEventListener('click', () => {
        const nodes = this.store.selectedNodes().filter((n) => isText(n.ClassName));
        menu([
          { label: nodes.length ? `Aplicar a ${nodes.length} texto(s)` : 'Selecciona textos para aplicar', disabled: !nodes.length, action: () => this.applyText(t.id, nodes) },
          { label: 'Actualizar desde la selección', disabled: !nodes.length, action: () => this.store.edit('Actualizar estilo', () => {
            for (const k of TEXT_KEYS) t[k] = deepClone(nodes[0].props[k]);
          }) },
          { label: 'Renombrar', action: () => {
            const nm = prompt('Nombre', t.name);
            if (nm) this.store.edit('Renombrar estilo', () => (t.name = nm));
          } },
          { label: 'Eliminar estilo', action: () => this.store.edit('Eliminar estilo', () => st.texts.splice(st.texts.indexOf(t), 1)) },
        ], row);
      });
      host.append(row);
    }
    void textInput;
    void isGuiObject;
  }
}
