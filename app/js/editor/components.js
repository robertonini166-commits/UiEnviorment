// Components (Figma-like main components + instances).
// Masters live on a special "Componentes" screen (never exported). Instances are normal
// Roblox instance trees tagged with editor.componentId / editor.masterId. When a master
// changes, every instance is rebuilt from it, keeping per-instance overrides (any property
// that differed from the previous master version is considered an override).

import { cloneWithNewIds, walk, createScreen, uniqueName } from '../core/model.js';
import { isGuiObject } from '../core/schema.js';
import { deepClone, deepEqual, newId } from '../core/types.js';
import { h, toast } from './ui.js';
import { icon } from './icons.js';

const ROOT_PLACEMENT = ['Position', 'AnchorPoint', 'LayoutOrder', 'ZIndex', 'Visible', 'Rotation'];

export class Components {
  constructor(app) {
    this.app = app;
    this.store = app.store;
    this._syncing = false;
    this.store.on((w) => {
      if (w.live || !w.doc || this._syncing || w.undo || w.redo) return;
      this.sync();
    });
  }

  get doc() {
    return this.store.doc;
  }

  page(create = false) {
    let p = this.doc.screens.find((s) => s.design?.componentsPage);
    if (!p && create) {
      const last = this.doc.screens[this.doc.screens.length - 1];
      p = createScreen('Componentes', 'studio', 0, (last ? Math.max(...this.doc.screens.map((s) => s.design.y + s.design.height)) : 0) + 300);
      p.design.componentsPage = true;
      p.design.background = '#2A2A2E';
      this.doc.screens.push(p);
    }
    return p;
  }

  masterOf(cid) {
    const c = this.doc.components?.[cid];
    return c ? this.store.get(c.masterId) : null;
  }

  createFromSelection() {
    const s = this.store;
    const sel = s.selectedNodes().filter((n) => isGuiObject(n.ClassName));
    if (sel.length !== 1) return toast('Selecciona un único objeto para crear un componente');
    const n = sel[0];
    if (n.editor?.componentId) return toast('Ya es un componente o una instancia');
    const cid = newId('c');
    s.edit('Crear componente', (doc) => {
      doc.components = doc.components || {};
      const page = this.page(true);
      const master = cloneWithNewIds(n);
      // place master on the components page
      const used = page.children.filter((c) => isGuiObject(c.ClassName));
      const b = this.app.cmd.boxOf(n.id) || { w: 200, h: 100 };
      const y = used.reduce((acc, c) => Math.max(acc, (c.props.Position?.[3] || 0) + (this.app.cmd.boxOf(c.id)?.h || 100)), 0) + 40;
      master.props.AnchorPoint = [0, 0];
      master.props.Position = [0, 40, 0, y];
      master.props.Visible = true;
      master.editor = Object.assign({}, master.editor, { componentId: cid, isComponent: true });
      page.children.push(master);
      if (y + b.h + 40 > page.design.height) page.design.height = Math.ceil(y + b.h + 80);
      // link instance
      const pairs = [];
      const pairUp = (a, m) => {
        pairs.push([a, m]);
        a.children.forEach((c, i) => m.children[i] && pairUp(c, m.children[i]));
      };
      pairUp(n, master);
      for (const [a, m] of pairs) a.editor = Object.assign({}, a.editor, { masterId: m.id });
      n.editor.componentId = cid;
      doc.components[cid] = { id: cid, name: n.Name, masterId: master.id, snapshot: deepClone(master) };
    });
    toast(`Componente "${n.Name}" creado (maestro en la pantalla Componentes)`);
  }

  /** A clone of a master becomes an instance linked to it (Figma: duplicating a main component). */
  linkCloneToMaster(clone, master) {
    const pairUp = (a, m) => {
      a.editor = Object.assign({}, a.editor, { masterId: m.id });
      delete a.editor.isComponent;
      delete a.editor.componentId;
      a.children.forEach((c, i) => m.children[i] && pairUp(c, m.children[i]));
    };
    pairUp(clone, master);
    clone.editor.componentId = master.editor.componentId;
    return clone;
  }

  instances(cid) {
    const out = [];
    for (const scr of this.doc.screens) walk(scr, (n) => {
      if (n.editor?.componentId === cid && !n.editor.isComponent) out.push(n);
    });
    return out;
  }

  insertInstance(cid, parent) {
    const s = this.store;
    const master = this.masterOf(cid);
    if (!master) return;
    parent = parent || this.app.cmd.insertionParent(master.ClassName);
    if (parent.id === this.page()?.id) parent = s.doc.screens.find((x) => !x.design?.componentsPage) || parent;
    let inst;
    s.edit('Insertar instancia', () => {
      inst = cloneWithNewIds(master);
      const pairs = [];
      const pairUp = (a, m) => {
        pairs.push([a, m]);
        a.children.forEach((c, i) => pairUp(c, m.children[i]));
      };
      pairUp(inst, master);
      for (const [a, m] of pairs) a.editor = Object.assign({}, a.editor, { masterId: m.id, isComponent: undefined, componentId: undefined });
      inst.editor.componentId = cid;
      inst.Name = uniqueName(parent, master.Name.split('/').pop().replace(/\s+/g, '') || 'Instance');
      inst.props.AnchorPoint = [0.5, 0.5];
      inst.props.Position = [0.5, 0, 0.5, 0];
      parent.children.push(inst);
    });
    s.select(inst.id);
  }

  /** Rebuild every instance whose master changed since the last snapshot. */
  sync() {
    const comps = this.doc.components || {};
    const dirty = [];
    for (const c of Object.values(comps)) {
      const master = this.store.get(c.masterId);
      if (!master) continue;
      if (!deepEqual(stripIds(master), stripIds(c.snapshot))) dirty.push([c, master]);
    }
    if (!dirty.length) return;
    this._syncing = true;
    try {
      for (const [c, master] of dirty) {
        for (const inst of this.instances(c.id)) this.rebuild(inst, master, c.snapshot);
        c.snapshot = deepClone(master);
        c.name = master.Name;
      }
      this.store._index = null;
      this.store.emit({ doc: true, componentsSynced: true });
    } finally {
      this._syncing = false;
    }
  }

  rebuild(inst, master, prevMaster, reset = false) {
    const byMaster = new Map();
    walk(inst, (n) => {
      if (n.editor?.masterId) byMaster.set(n.editor.masterId, n);
    });
    const prevById = new Map();
    if (prevMaster) walk(prevMaster, (n) => prevById.set(n.id, n));
    const build = (m, isRoot) => {
      const old = byMaster.get(m.id);
      const prev = prevById.get(m.id);
      const node = { id: old?.id || newId(), ClassName: m.ClassName, Name: m.Name, props: deepClone(m.props), children: [], editor: { masterId: m.id } };
      if (old && !reset) {
        for (const [k, v] of Object.entries(old.props)) {
          const overridden = isRoot && ROOT_PLACEMENT.includes(k) || !prev || !deepEqual(v, prev.props[k]);
          if (overridden && k in node.props) node.props[k] = deepClone(v);
        }
        if (prev && old.Name !== prev.Name) node.Name = old.Name;
        if (old.interactions) node.interactions = old.interactions;
        if (old.buttonFx) node.buttonFx = old.buttonFx;
      } else if (old && isRoot) {
        for (const k of ROOT_PLACEMENT) if (k in old.props) node.props[k] = deepClone(old.props[k]);
        node.Name = old.Name;
      }
      for (const c of m.children) node.children.push(build(c, false));
      // keep children the user added only to this instance
      if (old) for (const c of old.children) if (!c.editor?.masterId) node.children.push(c);
      return node;
    };
    const fresh = build(master, true);
    fresh.editor.componentId = inst.editor.componentId;
    fresh.editor.locked = inst.editor.locked;
    fresh.Name = inst.Name;
    inst.props = fresh.props;
    inst.children = fresh.children;
    inst.editor = fresh.editor;
  }

  /** Figma "swap instance": rebuild this instance from another component, keeping placement. */
  swap(id, cid) {
    const inst = this.store.get(id);
    const master = this.masterOf(cid);
    if (!inst || !master) return;
    this.store.edit('Intercambiar instancia', () => {
      const keep = {};
      for (const k of ROOT_PLACEMENT) if (k in inst.props) keep[k] = deepClone(inst.props[k]);
      const size = deepClone(inst.props.Size);
      inst.editor.componentId = cid;
      this.rebuild(inst, master, null, true);
      Object.assign(inst.props, keep);
      // keep the instance size only when both variants had the same size (variants of one set)
      if (this.setOf(cid) && size) inst.props.Size = size;
    });
  }

  /** "Set" of a component = text before the last "/" in its name (Button/Primary → Button). */
  setOf(cid) {
    const n = this.doc.components?.[cid]?.name || '';
    return n.includes('/') ? n.slice(0, n.lastIndexOf('/')) : null;
  }

  variantsOf(cid) {
    const set = this.setOf(cid);
    return Object.values(this.doc.components || {}).filter((c) => this.store.get(c.masterId) && (set ? this.setOf(c.id) === set : true));
  }

  resetInstance(id) {
    const inst = this.store.get(id);
    const master = this.masterOf(inst?.editor?.componentId);
    if (!master) return;
    this.store.edit('Restablecer instancia', () => this.rebuild(inst, master, null, true));
  }

  detach(id) {
    const inst = this.store.get(id);
    if (!inst) return;
    this.store.edit('Desvincular', () => walk(inst, (n) => {
      if (n.editor) {
        delete n.editor.componentId;
        delete n.editor.masterId;
      }
    }));
  }

  editComponent(cid) {
    const m = this.masterOf(cid);
    if (!m) return toast('El maestro de este componente ya no existe', 'err');
    this.store.select(m.id);
    this.app.canvas.zoomToSelection();
  }

  renderPanel(host) {
    host.innerHTML = '';
    const comps = Object.values(this.doc.components || {}).filter((c) => this.store.get(c.masterId));
    host.append(h('div', { class: 'section-title' }, `Componentes (${comps.length})`));
    if (!comps.length) {
      host.append(h('div', { class: 'hint', style: { padding: '0 12px 12px' } }, 'Selecciona algo y pulsa Ctrl+Alt+K para convertirlo en componente reutilizable. Al editar el maestro se actualizan todas sus copias. Nombra los maestros "Botón/Primario", "Botón/Secundario"… para agruparlos como variantes.'));
      return;
    }
    for (const c of comps) {
      const n = this.instances(c.id).length;
      const ins = h('button', { class: 'icon-btn', title: 'Insertar instancia', html: icon('plus') });
      ins.addEventListener('click', (e) => {
        e.stopPropagation();
        this.insertInstance(c.id);
      });
      const row = h('div', { class: 'row comp', style: { paddingLeft: '12px' } }, h('span', { class: 'ico', html: icon('component') }), h('span', { class: 'nm' }, c.name, h('span', { style: { color: 'var(--faint)', marginLeft: '6px' } }, `${n} uso(s)`)), h('div', { class: 'rt keep' }, ins));
      row.addEventListener('click', () => this.editComponent(c.id));
      host.append(row);
    }
  }
}

function stripIds(n) {
  if (!n) return null;
  return { c: n.ClassName, n: n.Name, p: n.props, k: n.children.map(stripIds) };
}
