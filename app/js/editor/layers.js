// Left panel: screens (like Figma pages/frames) + layer tree with drag & drop,
// rename, visibility/lock toggles and search.

import { isGuiObject, isModifier, canParent, isLayout } from '../core/schema.js';
import { DEVICES } from '../core/model.js';
import { h } from './ui.js';
import { icon, classIcon } from './icons.js';
import { nodeSummary } from './commands.js';

export class LayersPanel {
  constructor(app, host) {
    this.app = app;
    this.store = app.store;
    this.host = host;
    this.expanded = new Set();
    this.showModifiers = localStorage.getItem('rbxui.showMods') === '1';
    this.filter = '';
    this.drag = null;
    this.store.on((w) => {
      if (w.live) return;
      if (w.doc || w.selection) this.render();
      else if (w.hover) this.syncHover();
    });
  }

  render() {
    const s = this.store;
    const scrollTop = this.host.scrollTop;
    this.host.innerHTML = '';
    // screens
    const addBtn = h('button', { class: 'icon-btn', title: 'Nueva pantalla', html: icon('plus') });
    addBtn.addEventListener('click', () => this.app.cmd.addScreen());
    const screens = h('div', { class: 'screens-list' });
    for (const scr of s.doc.screens) {
      const it = h('div', { class: 'screen-item' + (scr.id === s.activeScreenId ? ' on' : '') }, h('span', { class: 'ico', html: icon('screen') }), h('span', {}, scr.Name), h('span', { class: 'dim' }, `${scr.design.width}×${scr.design.height}`));
      it.addEventListener('click', () => {
        s.activeScreenId = scr.id;
        s.select(scr.id);
        this.app.canvas.zoomToScreen(scr);
      });
      it.addEventListener('dblclick', () => this.renameInline(it.children[1], scr));
      screens.append(it);
    }
    this.host.append(h('div', { class: 'section-title' }, 'Pantallas', h('div', { class: 'actions' }, addBtn)), screens);

    // layers
    const modBtn = h('button', { class: 'icon-btn' + (this.showModifiers ? ' on' : ''), title: 'Mostrar modificadores (UICorner, UIStroke…)', html: icon('modifier') });
    modBtn.addEventListener('click', () => {
      this.showModifiers = !this.showModifiers;
      localStorage.setItem('rbxui.showMods', this.showModifiers ? '1' : '0');
      this.render();
    });
    const collapseBtn = h('button', { class: 'icon-btn', title: 'Contraer todo', html: icon('minus') });
    collapseBtn.addEventListener('click', () => {
      this.expanded.clear();
      this.render();
    });
    const search = h('input', { placeholder: 'Buscar capas…', value: this.filter });
    search.addEventListener('input', () => {
      this.filter = search.value.toLowerCase();
      this.renderTree(tree);
    });
    search.addEventListener('keydown', (e) => e.stopPropagation());
    this.host.append(h('div', { class: 'section-title' }, 'Capas', h('div', { class: 'actions' }, modBtn, collapseBtn)), h('div', { class: 'search' }, search));
    const tree = h('div', { class: 'tree' });
    this.host.append(tree);
    this.renderTree(tree);
    this.host.scrollTop = scrollTop;
  }

  syncHover() {
    const id = this.store.hoverId;
    for (const r of this.host.querySelectorAll('.row.hover-canvas')) if (r.dataset.id !== id) r.classList.remove('hover-canvas');
    if (id) this.host.querySelector(`.row[data-id="${id}"]`)?.classList.add('hover-canvas');
  }

  renderTree(tree) {
    const s = this.store;
    tree.innerHTML = '';
    const scr = s.activeScreen;
    if (!scr) return;
    // auto-expand ancestors of selection
    for (const id of s.selection) {
      let p = s.parentOf(id);
      while (p) {
        this.expanded.add(p.id);
        p = s.parentOf(p.id);
      }
    }
    const f = this.filter;
    const matches = (n) => !f || n.Name.toLowerCase().includes(f) || n.ClassName.toLowerCase().includes(f) || (n.props.Text || '').toLowerCase().includes(f);
    const anyMatch = (n) => matches(n) || n.children.some(anyMatch);
    const rows = [];
    const visit = (n, depth) => {
      if (f && !anyMatch(n)) return;
      if (!this.showModifiers && isModifier(n.ClassName)) return;
      rows.push(this.row(n, depth));
      if (!this.expanded.has(n.id) && !f) return;
      // show children in Explorer order but GUI objects in reverse z-order like Figma? keep tree order (Roblox Explorer)
      for (const c of n.children) visit(c, depth + 1);
    };
    for (const c of scr.children) visit(c, 0);
    if (!rows.length) tree.append(h('div', { class: 'empty-state' }, f ? 'Sin resultados' : 'Pantalla vacía. Usa la barra de herramientas (F = Frame, T = Texto, B = Botón) o arrastra algo del Kit.'));
    tree.append(...rows);
  }

  row(n, depth) {
    const s = this.store;
    const mod = isModifier(n.ClassName);
    const sel = s.selection.includes(n.id);
    const hasKids = n.children.length > 0 && (this.showModifiers || n.children.some((c) => !isModifier(c.ClassName)));
    const open = this.expanded.has(n.id);
    const invisible = isGuiObject(n.ClassName) && n.props.Visible === false;
    const twisty = h('span', { class: 'twisty' + (open ? ' open' : ''), html: hasKids ? icon('chevron') : '' });
    twisty.addEventListener('click', (e) => {
      e.stopPropagation();
      open ? this.expanded.delete(n.id) : this.expanded.add(n.id);
      this.render();
    });
    const summary = nodeSummary(n);
    const name = h('span', { class: 'nm', title: `${n.ClassName} — ${n.Name}` }, n.Name, summary && summary !== n.Name ? h('span', { style: { color: 'var(--faint)', marginLeft: '6px' } }, summary) : null);
    const rt = h('div', { class: 'rt' + (n.editor?.locked || n.editor?.hidden ? ' keep' : '') });
    if (!mod) {
      const lock = h('button', { title: n.editor?.locked ? 'Desbloquear' : 'Bloquear (Ctrl+Shift+L)', html: icon(n.editor?.locked ? 'lock' : 'unlock') });
      lock.addEventListener('click', (e) => {
        e.stopPropagation();
        s.edit('Bloquear', () => (n.editor = Object.assign({}, n.editor, { locked: !n.editor?.locked })));
      });
      const eye = h('button', { title: n.editor?.hidden ? 'Mostrar en el editor' : 'Ocultar en el editor (no afecta a Roblox)', html: icon(n.editor?.hidden ? 'eyeOff' : 'eye') });
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        s.edit('Ocultar', () => (n.editor = Object.assign({}, n.editor, { hidden: !n.editor?.hidden })));
      });
      rt.append(lock, eye);
    } else {
      const del = h('button', { title: 'Quitar modificador', html: icon('trash') });
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.cmd.removeNode(n.id);
      });
      rt.append(del);
    }
    const row = h('div', {
      class: `row${sel ? ' sel' : ''}${sel && s.selection[0] === n.id ? ' primary' : ''}${mod ? ' mod' : ''}${n.editor?.componentId ? ' comp' : ''}${invisible ? ' invisible' : ''}${s.hoverId === n.id ? ' hover-canvas' : ''}`,
      style: { paddingLeft: 6 + depth * 14 + 'px', '--indent': 6 + depth * 14 + 'px' }, draggable: 'true', dataset: { id: n.id },
    }, twisty, h('span', { class: 'ico', html: n.editor?.componentId ? icon('instance') : classIcon(n.ClassName) }), name, rt);
    row.addEventListener('click', (e) => {
      if (e.shiftKey && s.selection.length) {
        // range select among visible rows
        const ids = [...row.parentNode.querySelectorAll('.row')].map((r) => r.dataset.id);
        const a = ids.indexOf(s.selection[s.selection.length - 1]), b = ids.indexOf(n.id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        s.select(ids.slice(lo, hi + 1).filter((id) => !isModifier(s.get(id)?.ClassName)), { add: true });
      } else if (e.ctrlKey || e.metaKey) s.select(n.id, { toggle: true });
      else s.select(n.id);
    });
    row.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.renameInline(name, n);
    });
    row.addEventListener('pointerenter', () => {
      if (s.hoverId !== n.id) {
        s.hoverId = n.id;
        this.app.canvas.renderOverlay();
      }
    });
    row.addEventListener('pointerleave', () => {
      if (s.hoverId === n.id) {
        s.hoverId = null;
        this.app.canvas.renderOverlay();
      }
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!s.selection.includes(n.id)) s.select(n.id);
      this.app.contextMenu(e.clientX, e.clientY);
    });
    // drag & drop
    row.addEventListener('dragstart', (e) => {
      const ids = s.selection.includes(n.id) ? this.app.cmd.topLevel(s.selection) : [n.id];
      this.drag = { ids };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'rbxui-layers');
    });
    row.addEventListener('dragover', (e) => {
      if (!this.drag) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height;
      const canInside = !mod && this.drag.ids.every((id) => canParent(s.get(id).ClassName, n.ClassName) && id !== n.id);
      const pos = y < 0.28 ? 'before' : y > 0.72 ? (canInside && hasKids && open ? 'inside' : 'after') : canInside ? 'inside' : y < 0.5 ? 'before' : 'after';
      row.classList.remove('drop-before', 'drop-after', 'drop-inside');
      row.classList.add('drop-' + pos);
      this.drag.target = { id: n.id, pos };
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after', 'drop-inside'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drop-before', 'drop-after', 'drop-inside');
      if (this.drag?.target) this.moveTo(this.drag.ids, this.drag.target);
      this.drag = null;
    });
    row.addEventListener('dragend', () => (this.drag = null));
    return row;
  }

  moveTo(ids, target) {
    const s = this.store;
    const tnode = s.get(target.id);
    if (!tnode) return;
    const cmd = this.app.cmd;
    // prevent dropping into own descendants
    for (const id of ids) {
      let p = tnode;
      while (p) {
        if (p.id === id) return;
        p = s.parentOf(p.id);
      }
    }
    const newParent = target.pos === 'inside' ? tnode : s.parentOf(tnode.id);
    if (!newParent) return;
    if (!ids.every((id) => canParent(s.get(id).ClassName, newParent.ClassName))) return;
    // keep world position when reparenting GUI objects
    const worldPolys = new Map(ids.map((id) => [id, this.app.canvas.polyOf(id)]));
    const sizes = new Map(ids.map((id) => [id, cmd.boxOf(id)]));
    s.edit('Mover capa', () => {
      const nodes = ids.map((id) => s.get(id));
      const oldParents = new Map(ids.map((id) => [id, s.parentOf(id)]));
      for (const nd of nodes) {
        const p = oldParents.get(nd.id);
        p.children.splice(p.children.indexOf(nd), 1);
      }
      let idx = target.pos === 'inside' ? newParent.children.length : newParent.children.indexOf(tnode) + (target.pos === 'after' ? 1 : 0);
      newParent.children.splice(idx, 0, ...nodes);
      const inLayout = newParent.children.some((c) => isLayout(c.ClassName));
      s._index = null;
      cmd._boxCache.clear();
      for (const nd of nodes) {
        if (!isGuiObject(nd.ClassName) || oldParents.get(nd.id) === newParent || inLayout) continue;
        const poly = worldPolys.get(nd.id);
        const b = sizes.get(nd.id);
        if (!poly || !b) continue;
        const scr = s.screenOf(nd.id);
        const boxes = cmd.boxes(scr);
        const pb = boxes.get(newParent.id);
        const cx = (poly[0][0] + poly[2][0]) / 2, cy = (poly[0][1] + poly[2][1]) / 2;
        const { worldToParentLocal } = this.app.geometry;
        const [lx, ly] = newParent.ClassName === 'ScreenGui' ? [cx - scr.design.x, cy - scr.design.y] : worldToParentLocal(s, boxes, nd.id, cx, cy);
        this.app.geometry.writeBox(nd, pb, { x: lx - b.w / 2, y: ly - b.h / 2, w: b.w, h: b.h }, 'keep');
      }
    });
  }

  renameInline(nameEl, n) {
    const s = this.store;
    const inp = h('input', { class: 'rename', value: n.Name });
    nameEl.replaceWith(inp);
    inp.focus();
    inp.select();
    const done = (ok) => {
      if (ok && inp.value.trim() && inp.value !== n.Name) s.edit('Renombrar', () => (n.Name = inp.value.trim()));
      else this.render();
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
    });
    inp.addEventListener('blur', () => done(true));
  }
}

export { DEVICES };
