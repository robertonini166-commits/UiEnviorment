// Editor state + undo/redo. All document mutations go through `edit()` so they are
// recorded in history and observers (canvas, layers, inspector) refresh.

import { createDocument, indexDoc, findNode, walk, allRoots } from '../core/model.js';
import { deepClone } from '../core/types.js';

const HISTORY_LIMIT = 200;

export class Store {
  constructor(doc = createDocument()) {
    this.doc = doc;
    this.selection = []; // node ids (ordered)
    this.activeScreenId = doc.screens[0]?.id || null;
    this.tool = 'select';
    this.view = { zoom: 0.6, panX: 60, panY: 60, showHidden: true, showLayoutGuides: true, unitMode: 'keep', snap: true, pixelGrid: false };
    this.hoverId = null;
    this.mode = 'design'; // 'design' | 'prototype'
    this.editingComponentId = null;
    this.past = [];
    this.future = [];
    this.listeners = new Set();
    this._index = null;
    this._txn = null;
    this.dirty = false;
  }

  // ---------- observers ----------
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(what = {}) {
    this._index = null;
    for (const fn of this.listeners) fn(what);
  }

  // ---------- index / lookup ----------
  get index() {
    if (!this._index) this._index = indexDoc(this.doc);
    return this._index;
  }
  get(id) {
    return this.index.get(id)?.node || null;
  }
  parentOf(id) {
    return this.index.get(id)?.parent || null;
  }
  screenOf(id) {
    return this.index.get(id)?.screen || null;
  }
  get activeScreen() {
    return this.doc.screens.find((s) => s.id === this.activeScreenId) || this.doc.screens[0];
  }
  selectedNodes() {
    return this.selection.map((id) => this.get(id)).filter(Boolean);
  }

  // ---------- history ----------
  snapshot() {
    const { assets, ...rest } = this.doc;
    return JSON.stringify(rest);
  }
  restore(snap) {
    const assets = this.doc.assets;
    this.doc = Object.assign(JSON.parse(snap), { assets });
    this._index = null;
    this.selection = this.selection.filter((id) => this.get(id));
    if (!this.doc.screens.some((s) => s.id === this.activeScreenId)) this.activeScreenId = this.doc.screens[0]?.id;
  }

  /**
   * Applies a mutation as one undoable step.
   * fn(doc) may mutate the document in place. Returns fn's result.
   */
  edit(label, fn, opts = {}) {
    const before = this._txn ? null : this.snapshot();
    let res;
    try {
      res = fn(this.doc);
    } catch (e) {
      if (before) this.restore(before);
      throw e;
    }
    if (before) {
      this.past.push({ label, snap: before, sel: [...this.selection] });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
    }
    this.dirty = true;
    this._index = null;
    if (!opts.silent) this.emit({ doc: true, label });
    return res;
  }

  /** Begins a continuous interaction (drag); intermediate updates are not recorded. */
  begin(label) {
    if (this._txn) return;
    this._txn = { label, snap: this.snapshot(), sel: [...this.selection] };
  }
  /** Live update during a transaction (no history). */
  live(fn) {
    fn(this.doc);
    this._index = null;
    this.emit({ doc: true, live: true });
  }
  commit() {
    if (!this._txn) return;
    const t = this._txn;
    this._txn = null;
    if (t.snap !== this.snapshot()) {
      this.past.push({ label: t.label, snap: t.snap, sel: t.sel });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
      this.dirty = true;
    }
    this.emit({ doc: true, label: t.label });
  }
  cancel() {
    if (!this._txn) return;
    this.restore(this._txn.snap);
    this._txn = null;
    this.emit({ doc: true });
  }

  undo() {
    const s = this.past.pop();
    if (!s) return;
    this.future.push({ label: s.label, snap: this.snapshot(), sel: [...this.selection] });
    this.restore(s.snap);
    this.selection = s.sel.filter((id) => this.get(id));
    this.emit({ doc: true, selection: true, undo: true });
  }
  redo() {
    const s = this.future.pop();
    if (!s) return;
    this.past.push({ label: s.label, snap: this.snapshot(), sel: [...this.selection] });
    this.restore(s.snap);
    this.selection = s.sel.filter((id) => this.get(id));
    this.emit({ doc: true, selection: true, redo: true });
  }

  // ---------- selection ----------
  select(ids, { add = false, toggle = false } = {}) {
    ids = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (toggle) {
      const s = new Set(this.selection);
      for (const id of ids) s.has(id) ? s.delete(id) : s.add(id);
      this.selection = [...s];
    } else if (add) this.selection = [...new Set([...this.selection, ...ids])];
    else this.selection = ids;
    const first = this.selection[0] && this.screenOf(this.selection[0]);
    if (first && this.doc.screens.includes(first)) this.activeScreenId = first.id;
    this.emit({ selection: true });
  }
  clearSelection() {
    if (!this.selection.length) return;
    this.selection = [];
    this.emit({ selection: true });
  }

  setView(patch) {
    Object.assign(this.view, patch);
    this.emit({ view: true });
  }
  setTool(tool) {
    this.tool = tool;
    this.emit({ tool: true });
  }

  replaceDocument(doc) {
    this.doc = doc;
    this.past = [];
    this.future = [];
    this.selection = [];
    this.activeScreenId = doc.screens[0]?.id;
    this._index = null;
    this.dirty = false;
    this.emit({ doc: true, selection: true, replaced: true });
  }

  /** All node ids in document order (for select all / search). */
  allNodes() {
    const out = [];
    for (const r of allRoots(this.doc)) walk(r, (n) => out.push(n));
    return out;
  }
}

export { findNode, deepClone };
