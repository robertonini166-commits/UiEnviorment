// "Código" tab: live Luau / JSON of the selection (Figma Dev Mode equivalent).

import { exportLuau } from '../export/luau.js';
import { compactNode } from '../core/model.js';
import { isModifier } from '../core/schema.js';
import { h, copyText, toast, seg } from './ui.js';

export class CodePanel {
  constructor(app, host) {
    this.app = app;
    this.store = app.store;
    this.host = host;
    this.mode = 'luau';
    this.store.on((w) => {
      if (w.live) return;
      if ((w.doc || w.selection) && this.app.rightTab === 'code') this.render();
    });
  }

  target() {
    const s = this.store;
    const sel = this.app.cmd.topLevel(s.selection).map((id) => s.get(id)).filter(Boolean);
    if (sel.length) return sel;
    return s.activeScreen ? [s.activeScreen] : [];
  }

  render() {
    this.host.innerHTML = '';
    const nodes = this.target();
    const tabs = seg([['luau', 'Luau'], ['json', 'JSON']], this.mode, (v) => {
      this.mode = v;
      this.render();
    });
    let code = '';
    if (this.mode === 'luau') {
      code = nodes.length === 1 && nodes[0].ClassName === 'ScreenGui' ? exportLuau(this.store.doc, { screens: nodes, target: 'module' }).code : this.snippet(nodes);
    } else code = JSON.stringify(nodes.length === 1 ? compactNode(nodes[0]) : nodes.map(compactNode), null, 1);
    const pre = h('pre', { class: 'code' }, code);
    const copy = h('button', { class: 'btn small' }, 'Copiar');
    copy.addEventListener('click', async () => {
      await copyText(code);
      toast('Copiado');
    });
    this.host.append(h('div', { class: 'insp-section' }, h('div', { class: 'hd' }, h('span', { class: 't' }, 'Código', h('small', {}, nodes.map((n) => n.Name).join(', '))), copy), tabs, h('div', { style: { height: '8px' } }), pre,
      h('div', { class: 'hint', style: { marginTop: '6px' } }, this.mode === 'luau' ? 'Código Luau que crea exactamente estas instancias. Úsalo en un script o en la Command Bar.' : 'JSON compacto (solo lo que difiere de los valores por defecto). Es el formato que Claude puede leer/escribir.')));
  }

  /** Luau snippet building selected nodes under a `parent` argument. */
  snippet(nodes) {
    return exportLuau(this.store.doc, { target: 'snippet', nodes }).code;
  }

  async copySelectionLuau() {
    const code = this.snippet(this.target());
    await copyText(code);
    toast('Luau copiado');
  }
}
