// RbxUI Studio — application bootstrap: panels, toolbar, menus, shortcuts, clipboard, autosave.

import { Store } from './editor/store.js';
import { Commands } from './editor/commands.js';
import { Canvas, isTyping, CREATE_TOOLS } from './editor/canvas.js';
import { LayersPanel } from './editor/layers.js';
import { Inspector } from './editor/inspector.js';
import { Assets } from './editor/assets.js';
import { KIT, ensureKitAssets, bindKitAssets } from './editor/templates.js';
import { openExportDialog } from './editor/export-ui.js';
import { Prototype } from './editor/prototype.js';
import { Components } from './editor/components.js';
import { CodePanel } from './editor/codepanel.js';
import { importRbxmx } from './export/import-rbxmx.js';
import * as geometry from './editor/geometry.js';
import * as model from './core/model.js';
import { createDocument, normalizeDocument, DEVICES } from './core/model.js';
import { GUI_OBJECTS, MODIFIERS, canParent, isGuiObject } from './core/schema.js';
import { registerUserFont, FONT_FAMILIES, setRobloxTextMetrics, clearMeasureCache } from './core/fonts.js';
import { ScreenRenderer } from './core/renderer.js';
import { h, menu, toast, download, dialog, closePopovers, popover } from './editor/ui.js';
import { icon } from './editor/icons.js';
import { kvGet, startAutosave } from './editor/persist.js';
import { readAsDataURL } from './editor/assets.js';
import { SAMPLE } from './editor/sample.js';

const TOOLS = [
  ['select', 'select', 'Mover / seleccionar (V)'], ['hand', 'hand', 'Mano (H o Espacio)'], ['frame', 'frame', 'Frame (F)'], ['rect', 'rect', 'Rectángulo (R)'],
  ['ellipse', 'ellipse', 'Círculo / elipse (O)'], ['text', 'text', 'Texto — TextLabel (T)'], ['button', 'button', 'Botón — TextButton (B)'], ['image', 'image', 'Imagen — ImageLabel (I)'],
  ['scroll', 'scroll', 'ScrollingFrame (S)'],
];
const TOOL_KEYS = { v: 'select', h: 'hand', f: 'frame', a: 'frame', r: 'rect', o: 'ellipse', t: 'text', b: 'button', i: 'image', s: 'scroll' };

class App {
  constructor(doc) {
    this.store = new Store(doc);
    this.geometry = geometry;
    this.model = model;
    this.cmd = new Commands(this);
    this.assets = new Assets(this);
    this.canvas = new Canvas(this);
    this.components = new Components(this);
    this.prototype = new Prototype(this);
    this.leftTab = 'layers';
    this.rightTab = 'design';
    this.layers = new LayersPanel(this, h('div'));
    this.inspector = new Inspector(this, h('div'));
    this.code = new CodePanel(this, h('div'));
    this.buildChrome();
    this.bindKeys();
    this.bindClipboard();
    this.store.on((w) => {
      if (w.tool) this.renderToolbar();
      if (w.view || w.doc) this.renderZoom();
      if (w.assets && this.leftTab === 'assets') this.renderLeft();
      if (w.doc && !w.live) document.getElementById('doc-name').value = this.store.doc.name;
      if (w.replaced) this.renderLeft();
    });
    setRobloxTextMetrics(this.store.doc.settings?.robloxTextMetrics !== false);
    startAutosave(this.store);
    requestAnimationFrame(() => this.canvas.zoomToFit());
    window.addEventListener('beforeunload', () => {
      // autosave is async; nothing to block
    });
  }

  // ---------- chrome ----------
  buildChrome() {
    const name = document.getElementById('doc-name');
    name.value = this.store.doc.name;
    name.addEventListener('change', () => this.store.edit('Renombrar proyecto', (d) => (d.name = name.value.trim() || 'Sin título')));
    name.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') name.blur();
    });
    document.getElementById('menu-btn').addEventListener('click', (e) => this.mainMenu(e.currentTarget));
    document.getElementById('export-btn').addEventListener('click', () => openExportDialog(this));
    document.getElementById('play-btn').addEventListener('click', () => this.prototype.play());
    this.renderToolbar();
    this.renderZoom();
    // left tabs
    const lt = document.getElementById('left-tabs');
    for (const [k, label] of [['layers', 'Capas'], ['assets', 'Recursos'], ['kit', 'Kit']]) {
      const b = h('button', { class: this.leftTab === k ? 'on' : '' }, label);
      b.addEventListener('click', () => {
        this.leftTab = k;
        [...lt.children].forEach((x) => x.classList.toggle('on', x === b));
        this.renderLeft();
      });
      lt.append(b);
    }
    const rt = document.getElementById('right-tabs');
    for (const [k, label] of [['design', 'Diseño'], ['prototype', 'Prototipo'], ['code', 'Código']]) {
      const b = h('button', { class: this.rightTab === k ? 'on' : '' }, label);
      b.addEventListener('click', () => {
        this.rightTab = k;
        [...rt.children].forEach((x) => x.classList.toggle('on', x === b));
        this.renderRight();
      });
      rt.append(b);
    }
    this.renderLeft();
    this.renderRight();
  }

  renderLeft() {
    const body = document.getElementById('left-body');
    body.innerHTML = '';
    if (this.leftTab === 'layers') {
      body.append(this.layers.host);
      this.layers.render();
    } else if (this.leftTab === 'assets') {
      const host = h('div');
      body.append(host);
      this.assets.renderPanel(host);
      const comp = h('div');
      body.append(comp);
      this.components.renderPanel(comp);
    } else {
      body.append(this.kitPanel());
    }
  }

  renderRight() {
    const body = document.getElementById('right-body');
    body.innerHTML = '';
    if (this.rightTab === 'design') {
      body.append(this.inspector.host);
      this.inspector.render();
    } else if (this.rightTab === 'prototype') {
      body.append(this.prototype.host);
      this.prototype.render();
    } else {
      body.append(this.code.host);
      this.code.render();
    }
  }

  renderToolbar() {
    const tb = document.getElementById('toolbar');
    tb.innerHTML = '';
    for (const [k, ic, tip] of TOOLS) {
      const b = h('button', { class: 'tool' + (this.store.tool === k ? ' on' : ''), title: tip, html: icon(ic) });
      b.addEventListener('click', () => this.store.setTool(k));
      tb.append(b);
    }
    const more = h('button', { class: 'tool', title: 'Más objetos', html: icon('plus') });
    more.addEventListener('click', () => menu(this.insertItems(), more));
    tb.append(more);
    const undo = h('button', { class: 'tool', title: 'Deshacer (Ctrl+Z)', html: icon('undo') });
    undo.addEventListener('click', () => this.store.undo());
    const redo = h('button', { class: 'tool', title: 'Rehacer (Ctrl+Shift+Z)', html: icon('redo') });
    redo.addEventListener('click', () => this.store.redo());
    tb.append(h('span', { style: { width: '8px' } }), undo, redo);
  }

  renderZoom() {
    const z = document.getElementById('zoom-ctl');
    z.innerHTML = '';
    const b = h('button', { class: 'btn ghost', title: 'Zoom' }, Math.round(this.store.view.zoom * 100) + '%');
    b.addEventListener('click', () => menu([
      { label: 'Acercar', shortcut: 'Ctrl +', action: () => this.canvas.zoomBy(1.25) },
      { label: 'Alejar', shortcut: 'Ctrl −', action: () => this.canvas.zoomBy(0.8) },
      { label: 'Ver todo', shortcut: 'Mayús 1', action: () => this.canvas.zoomToFit() },
      { label: 'Zoom a la selección', shortcut: 'Mayús 2', action: () => this.canvas.zoomToSelection() },
      { label: '50%', action: () => this.setZoom(0.5) }, { label: '100%', shortcut: 'Mayús 0', action: () => this.setZoom(1) }, { label: '200%', action: () => this.setZoom(2) },
      { sep: true },
      { label: (this.store.view.showHidden ? '✓ ' : '') + 'Mostrar objetos invisibles (Visible=false)', action: () => this.store.setView({ showHidden: !this.store.view.showHidden }) },
      { label: (this.store.view.snap ? '✓ ' : '') + 'Ajuste inteligente (snap)', action: () => this.store.setView({ snap: !this.store.view.snap }) },
      { label: (this.store.view.showLayoutGuides ? '✓ ' : '') + 'Guías de layout / padding', action: () => this.store.setView({ showLayoutGuides: !this.store.view.showLayoutGuides }) },
      { label: (this.store.view.showRulers ? '✓ ' : '') + 'Reglas y guías', shortcut: 'Mayús R', action: () => this.store.setView({ showRulers: !this.store.view.showRulers }) },
      { label: (this.store.view.pixelGrid ? '✓ ' : '') + 'Cuadrícula de píxeles', action: () => this.store.setView({ pixelGrid: !this.store.view.pixelGrid }) },
      { label: (this.store.view.showCoreUI ? '✓ ' : '') + 'Barra de Roblox y controles móviles', action: () => this.store.setView({ showCoreUI: !this.store.view.showCoreUI }) },
    ], b));
    z.append(b);
  }

  setZoom(z) {
    const r = this.canvas.wrap.getBoundingClientRect();
    this.canvas.zoomAt(z, r.width / 2, r.height / 2);
  }

  kitPanel() {
    const wrap = h('div');
    wrap.append(h('div', { class: 'section-title' }, 'Kit Stud Style'), h('div', { class: 'hint', style: { padding: '0 12px 8px' } }, 'Piezas listas en estilo simulador. Arrástralas al lienzo o haz clic para insertarlas. Todo son instancias de Roblox editables.'));
    const grid = h('div', { class: 'kit-grid' });
    for (const item of KIT) {
      const thumb = h('div', { class: 'thumb' });
      const el = h('div', { class: 'kit-item', draggable: 'true', title: item.name }, thumb, item.name);
      el.addEventListener('click', () => this.insertKit(item));
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-rbxui-kit', item.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      grid.append(el);
      this.kitThumb(item, thumb);
    }
    wrap.append(grid);
    return wrap;
  }

  async kitThumb(item, host) {
    const map = await ensureKitAssets(this);
    const tree = bindKitAssets(item.make(), map);
    const { doc } = normalizeDocument({ screens: [{ ClassName: 'ScreenGui', Name: 'thumb', design: { width: 600, height: 420 }, children: [Object.assign({}, tree, { props: Object.assign({}, tree.props, { AnchorPoint: [0.5, 0.5], Position: [0.5, 0, 0.5, 0] }) })] }] });
    doc.assets = this.store.doc.assets;
    const scr = doc.screens[0];
    const r = new ScreenRenderer(host, { doc, mode: 'edit' });
    const boxes = r.render(scr);
    const b = boxes.get(scr.children[0].id);
    const k = Math.min(1, 118 / (b.w + 16), 60 / (b.h + 16));
    r.root.style.transform = `scale(${k})`;
    r.root.style.transformOrigin = '0 0';
    r.root.style.position = 'absolute';
    r.root.style.left = `${59 - (b.x + b.w / 2) * k}px`;
    r.root.style.top = `${32 - (b.y + b.h / 2) * k}px`;
    host.style.position = 'relative';
  }

  async insertKit(item, at) {
    const map = await ensureKitAssets(this);
    const tree = bindKitAssets(item.make(), map);
    const parent = this.cmd.insertionParent(tree.ClassName);
    if (at) {
      const target = this.canvas.containerAt(at[0], at[1]) || this.store.activeScreen;
      const scr = this.store.screenOf(target.id);
      const local = target.ClassName === 'ScreenGui' ? [at[0] - scr.design.x, at[1] - scr.design.y] : this.geometry.worldToLocal(this.store, this.cmd.boxes(scr), target.id, at[0], at[1]);
      tree.props = Object.assign({}, tree.props, { AnchorPoint: [0.5, 0.5], Position: [0, Math.round(local[0]), 0, Math.round(local[1])] });
      return this.cmd.insertTree(tree, target);
    }
    if (parent.ClassName === 'ScreenGui') tree.props = Object.assign({}, tree.props, { AnchorPoint: [0.5, 0.5], Position: [0.5, 0, 0.5, 0] });
    return this.cmd.insertTree(tree, parent);
  }

  insertImage(assetId, at) {
    const a = this.store.doc.assets[assetId];
    if (!a) return;
    let w = a.width || 100, hh = a.height || 100;
    const k = Math.min(1, 300 / Math.max(w, hh));
    w = Math.round(w * k);
    hh = Math.round(hh * k);
    let parent = this.cmd.insertionParent('ImageLabel');
    let box;
    if (at) {
      parent = this.canvas.containerAt(at[0], at[1]) || this.store.activeScreen;
      const scr = this.store.screenOf(parent.id);
      const local = parent.ClassName === 'ScreenGui' ? [at[0] - scr.design.x, at[1] - scr.design.y] : this.geometry.worldToLocal(this.store, this.cmd.boxes(scr), parent.id, at[0], at[1]);
      box = { x: local[0] - w / 2, y: local[1] - hh / 2, w, h: hh };
    }
    return this.cmd.insert('ImageLabel', { parent, props: { Image: 'asset:' + assetId, Size: [0, w, 0, hh], ScaleType: 'Fit' }, box, name: a.name.replace(/[^\w]/g, '') || 'Image' });
  }

  insertItems() {
    const add = (cls, label) => ({ label: label || cls, action: () => this.cmd.insert(cls) });
    const mods = MODIFIERS.map((m) => ({ label: m, action: () => this.cmd.addModifier(m) }));
    return [
      { header: 'Objetos' },
      add('Frame'), add('TextLabel'), add('TextButton'), add('TextBox'), add('ImageLabel'), add('ImageButton'), add('ScrollingFrame'), add('CanvasGroup'), add('Folder', 'Folder (agrupar sin caja)'), add('ViewportFrame'), add('VideoFrame'),
      { sep: true },
      { label: 'Modificador para la selección', submenu: mods },
      { label: 'Pantalla nueva', submenu: Object.entries(DEVICES).map(([k, d]) => ({ label: d.label, action: () => this.cmd.addScreen(k) })) },
      { label: 'Del kit', submenu: KIT.map((k) => ({ label: k.name, action: () => this.insertKit(k) })) },
    ];
  }

  // ---------- menus ----------
  mainMenu(anchor) {
    const s = this.store;
    menu([
      { label: 'Archivo', submenu: [
        { label: 'Nuevo proyecto', action: () => this.newProject() },
        { label: 'Abrir… (.rbxui.json)', shortcut: 'Ctrl O', action: () => this.openFile() },
        { label: 'Guardar como archivo', shortcut: 'Ctrl S', action: () => this.saveFile() },
        { sep: true },
        { label: 'Importar .rbxmx de Roblox Studio…', action: () => this.importRbxmxFile() },
        { label: 'Importar JSON / pegar código…', action: () => this.importJsonDialog() },
        { sep: true },
        { label: 'Exportar a Roblox…', shortcut: 'Ctrl E', action: () => openExportDialog(this) },
        { label: 'Cargar ejemplo', action: () => this.loadSample() },
      ] },
      { label: 'Editar', submenu: [
        { label: 'Deshacer', shortcut: 'Ctrl Z', action: () => s.undo() }, { label: 'Rehacer', shortcut: 'Ctrl Mayús Z', action: () => s.redo() },
        { sep: true },
        { label: 'Copiar', shortcut: 'Ctrl C', action: () => this.cmd.copy() }, { label: 'Cortar', shortcut: 'Ctrl X', action: () => this.cmd.copy(true) },
        { label: 'Pegar', shortcut: 'Ctrl V', action: () => this.cmd.paste() }, { label: 'Duplicar', shortcut: 'Ctrl D', action: () => this.cmd.duplicate() },
        { label: 'Eliminar', shortcut: 'Supr', action: () => this.cmd.deleteSelection() },
        { sep: true },
        { label: 'Seleccionar todo', shortcut: 'Ctrl A', action: () => this.cmd.selectAll() },
        { label: 'Seleccionar padre', shortcut: 'Esc', action: () => this.cmd.selectParent() },
        { label: 'Seleccionar hijos', shortcut: 'Enter', action: () => this.cmd.selectChildren() },
        { label: 'Seleccionar capas iguales', shortcut: 'Ctrl Mayús A', action: () => this.cmd.selectMatching() },
        { sep: true },
        { label: 'Copiar estilo', shortcut: 'Ctrl Alt C', action: () => this.cmd.copyStyle() },
        { label: 'Pegar estilo', shortcut: 'Ctrl Alt V', action: () => this.cmd.pasteStyle() },
        { label: 'Buscar y reemplazar…', shortcut: 'Ctrl F', action: () => this.findDialog() },
        { label: 'Renombrar selección…', shortcut: 'Ctrl R', action: () => this.renameDialog() },
        { label: 'Escalar selección…', shortcut: 'K', action: () => this.scaleDialog() },
        { label: 'Ordenar en cuadrícula (tidy up)', shortcut: 'Mayús T', action: () => this.cmd.tidyUp() },
      ] },
      { label: 'Objeto', submenu: this.objectMenuItems() },
      { label: 'Insertar', submenu: this.insertItems() },
      { label: 'Ver', submenu: [
        { label: 'Ver todo', shortcut: 'Mayús 1', action: () => this.canvas.zoomToFit() },
        { label: 'Zoom a la selección', shortcut: 'Mayús 2', action: () => this.canvas.zoomToSelection() },
        { label: (s.view.showHidden ? '✓ ' : '') + 'Mostrar invisibles', action: () => s.setView({ showHidden: !s.view.showHidden }) },
        { label: (s.view.snap ? '✓ ' : '') + 'Ajuste inteligente', action: () => s.setView({ snap: !s.view.snap }) },
        { label: (s.doc.settings?.robloxTextMetrics !== false ? '✓ ' : '') + 'Tamaño de texto como Roblox', action: () => this.toggleMetrics() },
      ] },
      { label: 'Fuentes de Roblox…', action: () => this.fontsDialog() },
      { label: 'Ayuda', submenu: [
        { label: 'Atajos de teclado', shortcut: 'Ctrl /', action: () => this.shortcutsDialog() },
        { label: 'Acerca de RbxUI Studio', action: () => this.aboutDialog() },
      ] },
    ], anchor);
  }

  objectMenuItems() {
    const c = this.cmd;
    return [
      { label: 'Agrupar en Frame', shortcut: 'Ctrl G', action: () => c.group('Frame') },
      { label: 'Agrupar en Folder', shortcut: 'Ctrl Alt G', action: () => c.group('Folder') },
      { label: 'Desagrupar', shortcut: 'Ctrl Mayús G', action: () => c.ungroup() },
      { label: 'Auto layout (UIListLayout)', shortcut: 'Mayús A', action: () => c.autoLayout() },
      { sep: true },
      { label: 'Traer al frente', shortcut: 'Ctrl Mayús ]', action: () => c.reorder('front') },
      { label: 'Traer adelante', shortcut: 'Ctrl ]', action: () => c.reorder('forward') },
      { label: 'Enviar atrás', shortcut: 'Ctrl [', action: () => c.reorder('backward') },
      { label: 'Enviar al fondo', shortcut: 'Ctrl Mayús [', action: () => c.reorder('back') },
      { sep: true },
      { label: 'Alinear', submenu: [
        { label: 'Izquierda', shortcut: 'Alt A', action: () => c.align('left') }, { label: 'Centro H', shortcut: 'Alt H', action: () => c.align('centerH') },
        { label: 'Derecha', shortcut: 'Alt D', action: () => c.align('right') }, { label: 'Arriba', shortcut: 'Alt W', action: () => c.align('top') },
        { label: 'Centro V', shortcut: 'Alt V', action: () => c.align('centerV') }, { label: 'Abajo', shortcut: 'Alt S', action: () => c.align('bottom') },
        { sep: true }, { label: 'Distribuir horizontal', action: () => c.distribute('h') }, { label: 'Distribuir vertical', action: () => c.distribute('v') },
      ] },
      { label: 'Unidades', submenu: [
        { label: 'Convertir a Scale', action: () => c.convertUnits('scale') }, { label: 'Convertir a Offset', action: () => c.convertUnits('offset') },
        { label: 'Convertir a Scale (con hijos)', action: () => c.convertUnits('scale', true) },
      ] },
      { label: 'Convertir a clase', submenu: GUI_OBJECTS.map((k) => ({ label: k, action: () => c.changeClass(k) })) },
      { label: 'Añadir modificador', submenu: MODIFIERS.map((m) => ({ label: m, action: () => c.addModifier(m) })) },
      { sep: true },
      { label: 'Crear componente', shortcut: 'Ctrl Alt K', action: () => this.components.createFromSelection() },
      { label: 'Bloquear / desbloquear', shortcut: 'Ctrl Mayús L', action: () => c.toggleEditor('locked') },
      { label: 'Ocultar en editor', shortcut: 'Ctrl Mayús H', action: () => c.toggleEditor('hidden') },
      { label: 'Visible (Roblox) on/off', action: () => c.setProp(this.store.selection, 'Visible', (v) => !v) },
    ];
  }

  contextMenu(x, y) {
    const s = this.store;
    const sel = s.selectedNodes();
    const isScreen = sel.length === 1 && s.doc.screens.includes(sel[0]);
    const items = sel.length ? [
      { label: 'Copiar', shortcut: 'Ctrl C', action: () => this.cmd.copy() },
      { label: 'Pegar', shortcut: 'Ctrl V', action: () => this.cmd.paste() },
      { label: 'Duplicar', shortcut: 'Ctrl D', action: () => this.cmd.duplicate() },
      { label: 'Eliminar', shortcut: 'Supr', action: () => this.cmd.deleteSelection() },
      { sep: true },
      ...(isScreen ? [{ label: 'Exportar esta pantalla…', action: () => openExportDialog(this) }] : this.objectMenuItems()),
      { sep: true },
      { label: 'Copiar como Luau', action: () => this.code.copySelectionLuau() },
      { label: 'Copiar como JSON', action: () => this.cmd.copy() },
    ] : [
      { label: 'Pegar', shortcut: 'Ctrl V', action: () => this.cmd.paste() },
      { label: 'Nueva pantalla', action: () => this.cmd.addScreen() },
      { label: 'Ver todo', action: () => this.canvas.zoomToFit() },
    ];
    menu(items, { x, y });
  }

  // ---------- keyboard ----------
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e) || document.querySelector('.dialog-back')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const c = this.cmd, s = this.store;
      const run = (fn) => {
        e.preventDefault();
        fn();
      };
      if (mod && k === 'z') return run(() => (e.shiftKey ? s.redo() : s.undo()));
      if (mod && k === 'y') return run(() => s.redo());
      if (mod && k === 'd') return run(() => c.duplicate());
      if (mod && k === 'a') return run(() => c.selectAll());
      if (mod && k === 's') return run(() => this.saveFile());
      if (mod && k === 'o') return run(() => this.openFile());
      if (mod && k === 'e') return run(() => openExportDialog(this));
      if (mod && e.altKey && k === 'k') return run(() => this.components.createFromSelection());
      if (mod && e.altKey && k === 'c') return run(() => c.copyStyle());
      if (mod && e.altKey && k === 'v') return run(() => c.pasteStyle());
      if (mod && e.shiftKey && k === 'a') return run(() => c.selectMatching());
      if (mod && k === 'f') return run(() => this.findDialog());
      if (mod && k === 'r') return run(() => this.renameDialog());
      if (mod && k === 'g') return run(() => (e.shiftKey ? c.ungroup() : c.group(e.altKey ? 'Folder' : 'Frame')));
      if (mod && e.shiftKey && k === 'l') return run(() => c.toggleEditor('locked'));
      if (mod && e.shiftKey && k === 'h') return run(() => c.toggleEditor('hidden'));
      if (mod && (e.key === ']' || e.code === 'BracketRight')) return run(() => c.reorder(e.shiftKey ? 'front' : 'forward'));
      if (mod && (e.key === '[' || e.code === 'BracketLeft')) return run(() => c.reorder(e.shiftKey ? 'back' : 'backward'));
      if (mod && (k === '=' || k === '+')) return run(() => this.canvas.zoomBy(1.25));
      if (mod && k === '-') return run(() => this.canvas.zoomBy(0.8));
      if (mod && k === '/') return run(() => this.shortcutsDialog());
      if (mod) return;
      if (e.altKey) {
        const al = { a: 'left', h: 'centerH', d: 'right', w: 'top', v: 'centerV', s: 'bottom' }[k];
        if (al) return run(() => c.align(al));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') return run(() => c.deleteSelection());
      if (e.key === 'Escape') return run(() => {
        closePopovers();
        if (CREATE_TOOLS[s.tool] || s.tool === 'hand') s.setTool('select');
        else c.selectParent();
      });
      if (e.key === 'Enter') return run(() => {
        const n = s.selectedNodes()[0];
        if (n && ['TextLabel', 'TextButton', 'TextBox'].includes(n.ClassName)) this.canvas.startTextEdit(n.id);
        else c.selectChildren();
      });
      if (e.key.startsWith('Arrow')) {
        const st = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
        return run(() => c.nudge(...d));
      }
      if (e.shiftKey && k === 'a') return run(() => c.autoLayout());
      if (e.shiftKey && k === 'r') return run(() => s.setView({ showRulers: !s.view.showRulers }));
      if (e.shiftKey && e.key === '!') return run(() => this.canvas.zoomToFit());
      if (e.shiftKey && (e.code === 'Digit1')) return run(() => this.canvas.zoomToFit());
      if (e.shiftKey && (e.code === 'Digit2')) return run(() => this.canvas.zoomToSelection());
      if (e.shiftKey && (e.code === 'Digit0')) return run(() => this.setZoom(1));
      if (e.key === 'F5') return run(() => this.prototype.play());
      if (k === 'k' && !e.shiftKey) return run(() => this.scaleDialog());
      if (e.ctrlKey === false && e.altKey === false && e.shiftKey && k === 't') return run(() => c.tidyUp());
      if (!e.shiftKey && TOOL_KEYS[k]) return run(() => s.setTool(TOOL_KEYS[k]));
    });
  }

  bindClipboard() {
    document.addEventListener('copy', (e) => {
      if (isTyping(e)) return;
      if (!this.store.selection.length) return;
      e.preventDefault();
      this.cmd.copy();
    });
    document.addEventListener('cut', (e) => {
      if (isTyping(e)) return;
      e.preventDefault();
      this.cmd.copy(true);
    });
    document.addEventListener('paste', async (e) => {
      if (isTyping(e)) return;
      e.preventDefault();
      const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        for (const f of files) {
          const id = await this.assets.addFile(f);
          this.insertImage(id);
        }
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text && /<roblox[\s>]/.test(text)) return this.importRbxmxText(text);
      this.cmd.paste(text);
    });
  }

  async onCanvasDrop(e, wx, wy) {
    const kit = e.dataTransfer.getData('application/x-rbxui-kit');
    if (kit) {
      const item = KIT.find((k) => k.id === kit);
      if (item) this.insertKit(item, [wx, wy]);
      return;
    }
    const asset = e.dataTransfer.getData('application/x-rbxui-asset');
    if (asset) {
      const target = this.canvas.pickFromPath(this.canvas.hitPath(wx, wy), true);
      const n = target && this.store.get(target);
      if (n && (n.ClassName === 'ImageLabel' || n.ClassName === 'ImageButton') && e.altKey) this.cmd.setProp([n.id], 'Image', 'asset:' + asset);
      else this.insertImage(asset, [wx, wy]);
      return;
    }
    for (const f of e.dataTransfer.files || []) {
      if (f.type.startsWith('image/')) {
        const id = await this.assets.addFile(f);
        this.insertImage(id, [wx, wy]);
      } else if (/\.rbxmx$/i.test(f.name)) {
        this.importRbxmxText(await f.text());
      } else if (/\.json$/i.test(f.name)) {
        this.loadJsonText(await f.text(), f.name);
      }
    }
  }

  pickFile(accept, cb) {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (f) cb(f, accept.startsWith('image') ? await readAsDataURL(f) : await f.text());
      inp.remove();
    });
    document.body.append(inp);
    inp.click();
  }

  /** Image picker for an ImageLabel/Button (existing assets, upload, or rbxassetid). */
  pickImageFor(id, ids) {
    ids = ids || (id ? [id] : []);
    const list = h('div', { class: 'asset-grid', style: { padding: '0', gridTemplateColumns: 'repeat(4, 1fr)' } });
    for (const a of this.assets.list) {
      const el = h('div', { class: 'asset', title: a.name }, h('img', { src: a.url }));
      el.addEventListener('click', () => {
        this.cmd.setProp(ids, 'Image', 'asset:' + a.id);
        d.close();
      });
      list.append(el);
    }
    const up = h('button', { class: 'btn' }, 'Subir imagen…');
    up.addEventListener('click', () => this.pickFile('image/*', async (f) => {
      const aid = await this.assets.addFile(f);
      this.cmd.setProp(ids, 'Image', 'asset:' + aid);
      d.close();
    }));
    const rid = h('input', { class: 'txt', placeholder: 'o pega un rbxassetid://…', style: { flex: 1 } });
    rid.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const v = rid.value.trim();
        const num = v.replace(/\D/g, '');
        if (num) this.cmd.setProp(ids, 'Image', 'rbxassetid://' + num);
        d.close();
      }
    });
    const d = dialog('Elegir imagen', h('div', { style: { display: 'grid', gap: '10px' } }, this.assets.list.length ? list : h('div', { class: 'hint' }, 'Aún no hay imágenes en el proyecto.'), h('div', { style: { display: 'flex', gap: '8px' } }, up, rid), h('div', { class: 'hint' }, 'Las imágenes de Roblox (rbxassetid) no se pueden previsualizar aquí: para verlas, sube también el PNG y pon su ID en el panel Recursos.')), [{ label: 'Cancelar' }], { width: '520px' });
  }

  // ---------- files ----------
  newProject() {
    if (this.store.dirty && !confirm('¿Crear un proyecto nuevo? Los cambios actuales siguen en el autoguardado hasta que edites el nuevo.')) return;
    this.store.replaceDocument(createDocument());
    this.canvas.zoomToFit();
  }

  loadSample() {
    const { doc } = normalizeDocument(SAMPLE());
    this.store.replaceDocument(doc);
    ensureKitAssets(this).then((map) => {
      this.store.edit('Ejemplo', () => {
        for (const n of this.store.allNodes()) if (n.props?.Image === 'asset:studs') n.props.Image = 'asset:' + map.studs;
      });
      this.canvas.zoomToFit();
    });
  }

  openFile() {
    this.pickFile('.json,.rbxui,.rbxmx,application/json', (f, text) => {
      if (/\.rbxmx$/i.test(f.name)) this.importRbxmxText(text);
      else this.loadJsonText(text, f.name);
    });
  }

  loadJsonText(text, name = '') {
    try {
      const { doc, warnings } = normalizeDocument(text);
      if (!doc.name || doc.name === 'Sin título') doc.name = name.replace(/\.(rbxui\.)?json$/i, '') || doc.name;
      this.store.replaceDocument(doc);
      this.canvas.zoomToFit();
      toast(warnings.length ? `Abierto con ${warnings.length} aviso(s) — mira la consola` : 'Proyecto abierto');
      if (warnings.length) console.warn(warnings);
    } catch (err) {
      toast('JSON no válido: ' + err.message, 'err');
    }
  }

  saveFile() {
    download(`${(this.store.doc.name || 'rbxui').replace(/[^\w\-]+/g, '_')}.rbxui.json`, JSON.stringify(this.store.doc, null, 1), 'application/json');
    this.store.dirty = false;
  }

  importRbxmxFile() {
    this.pickFile('.rbxmx,.xml', (f, text) => this.importRbxmxText(text));
  }

  importRbxmxText(text) {
    try {
      const { screens, warnings } = importRbxmx(text);
      if (!screens.length) return toast('No se encontraron ScreenGui/Frames en el archivo', 'err');
      this.store.edit('Importar rbxmx', (d) => {
        let x = Math.max(0, ...d.screens.map((sc) => sc.design.x + sc.design.width)) + 200;
        for (const sc of screens) {
          sc.design.x = x;
          x += sc.design.width + 200;
          d.screens.push(sc);
        }
      });
      this.canvas.zoomToScreen(screens[0]);
      toast(`Importado: ${screens.map((s) => s.Name).join(', ')}${warnings.length ? ` (${warnings.length} avisos)` : ''}`);
      if (warnings.length) console.warn(warnings);
    } catch (err) {
      toast('No se pudo importar: ' + err.message, 'err');
    }
  }

  importJsonDialog() {
    const ta = h('textarea', { class: 'txt', style: { height: '300px', fontFamily: 'monospace' }, placeholder: 'Pega aquí JSON de RbxUI (documento, pantalla o nodos) o un .rbxmx' });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    dialog('Importar', h('div', {}, ta, h('div', { class: 'hint', style: { marginTop: '6px' } }, 'Documento completo → reemplaza el proyecto. Nodos/pantallas → se añaden. Formato en docs/FORMAT.md.')), [
      { label: 'Cancelar' },
      { label: 'Importar', primary: true, action: () => {
        const t = ta.value.trim();
        if (/^<roblox/.test(t)) return this.importRbxmxText(t);
        try {
          const j = JSON.parse(t);
          if (j.format === 'rbxui' && j.screens) this.loadJsonText(t);
          else this.cmd.paste(t);
        } catch (err) {
          toast('JSON no válido: ' + err.message, 'err');
          return false;
        }
      } },
    ]);
  }

  toggleMetrics() {
    const on = this.store.doc.settings?.robloxTextMetrics === false;
    this.store.edit('Métrica de texto', (d) => {
      d.settings = Object.assign({}, d.settings, { robloxTextMetrics: on });
    });
    setRobloxTextMetrics(on);
    clearMeasureCache();
    this.store.emit({ doc: true });
  }

  fontsDialog() {
    const inp = h('input', { type: 'file', multiple: true, accept: '.ttf,.otf', style: { display: 'none' } });
    const log = h('div', { class: 'hint' });
    inp.addEventListener('change', async () => {
      let ok = 0;
      for (const f of inp.files) {
        const m = f.name.replace(/\.(ttf|otf)$/i, '').match(/^([A-Za-z0-9]+?)-?(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Semibold|Bold|ExtraBold|Black|Heavy)?(Italic)?$/);
        if (!m) continue;
        const famId = FONT_FAMILIES.find((x) => x.id.toLowerCase() === m[1].toLowerCase() || x.name.replace(/\s/g, '').toLowerCase() === m[1].toLowerCase())?.id;
        if (!famId) continue;
        const wmap = { Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Semibold: 600, Bold: 700, ExtraBold: 800, Black: 900, Heavy: 900 };
        const url = URL.createObjectURL(f);
        await registerUserFont(famId, wmap[m[2] || 'Regular'], m[3] ? 'Italic' : 'Normal', url);
        ok++;
      }
      log.textContent = `${ok} archivo(s) de fuente cargados para esta sesión.`;
      clearMeasureCache();
      this.store.emit({ doc: true });
    });
    const pick = h('button', { class: 'btn' }, 'Elegir archivos .ttf/.otf…');
    pick.addEventListener('click', () => inp.click());
    const rows = FONT_FAMILIES.map((f) => h('tr', {}, h('td', {}, f.name), h('td', { class: 'hint' }, f.asset), h('td', {}, f.faces.length ? '✓ incluida' : `≈ ${f.approx}`)));
    dialog('Fuentes de Roblox', h('div', {},
      h('p', {}, 'RbxUI solo permite las 40 familias oficiales de Roblox (Font.new("rbxasset://fonts/families/…")), así el texto nunca se rompe al exportar. 32 vienen incluidas (licencia OFL); las exclusivas de Roblox (Builder, Gotham→Montserrat, etc.) se previsualizan con una similar.'),
      h('p', {}, 'Para verlas exactas, carga los archivos desde tu instalación de Roblox Studio: ', h('code', {}, '%LOCALAPPDATA%\\Roblox\\Versions\\<versión>\\content\\fonts'), ' (p.ej. BuilderSans-Bold.otf).'),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, pick, log), inp,
      h('table', { class: 'props-table', style: { marginTop: '10px' } }, rows)), [{ label: 'Cerrar' }]);
  }

  findDialog() {
    const f = h('input', { class: 'txt', placeholder: 'Buscar…' });
    const r = h('input', { class: 'txt', placeholder: 'Reemplazar por…' });
    let inNames = false;
    [f, r].forEach((x) => x.addEventListener('keydown', (e) => e.stopPropagation()));
    const res = h('div', { class: 'hint' });
    const list = h('div', { style: { maxHeight: '220px', overflow: 'auto', marginTop: '8px' } });
    const refresh = () => {
      list.innerHTML = '';
      if (!f.value) return;
      const hits = this.store.allNodes().filter((n) => (n.props?.Text || '').includes(f.value) || (inNames && n.Name.includes(f.value)));
      res.textContent = `${hits.length} coincidencia(s)`;
      for (const n of hits.slice(0, 100)) {
        const row = h('div', { class: 'row', style: { paddingLeft: '6px' } }, h('span', { class: 'nm' }, `${n.Name} — ${(n.props.Text || '').slice(0, 60)}`));
        row.addEventListener('click', () => {
          this.store.select(n.id);
          this.canvas.zoomToSelection();
        });
        list.append(row);
      }
    };
    f.addEventListener('input', refresh);
    dialog('Buscar y reemplazar', h('div', { style: { display: 'grid', gap: '8px' } }, f, r, h('div', {}, h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { inNames = e.target.checked; refresh(); } }), 'Buscar también en nombres')), res, list), [
      { label: 'Cerrar' },
      { label: 'Reemplazar todo', primary: true, action: () => {
        const n = this.cmd.findReplace(f.value, r.value, { inNames, inTexts: true });
        toast(`${n} reemplazo(s)`);
      } },
    ]);
    setTimeout(() => f.focus(), 0);
  }

  renameDialog() {
    const sel = this.store.selectedNodes();
    if (!sel.length) return toast('Selecciona capas para renombrar');
    const inp = h('input', { class: 'txt', value: sel.length > 1 ? `${sel[0].Name.replace(/\d+$/, '')}$n` : sel[0].Name });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    dialog(`Renombrar ${sel.length} capa(s)`, h('div', { style: { display: 'grid', gap: '8px' } }, inp, h('div', { class: 'hint' }, '$n = número (1, 2, 3…), $& = nombre actual, $c = clase. Ej: "Card$n" → Card1, Card2…')), [
      { label: 'Cancelar' },
      { label: 'Renombrar', primary: true, action: () => this.cmd.batchRename(inp.value) },
    ]);
    setTimeout(() => inp.select(), 0);
  }

  scaleDialog() {
    if (!this.store.selection.length) return toast('Selecciona algo para escalar');
    const inp = h('input', { class: 'txt', value: '1.25' });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    dialog('Escalar (K)', h('div', { style: { display: 'grid', gap: '8px' } }, inp, h('div', { class: 'hint' }, 'Multiplica tamaños, texto, contornos, esquinas y espaciados de la selección y todo su contenido (como la herramienta Escala de Figma). Alternativa sin cambiar valores: añadir un UIScale.')), [
      { label: 'Cancelar' },
      { label: 'Escalar', primary: true, action: () => this.cmd.scaleSelection(parseFloat(inp.value.replace(',', '.'))) },
    ]);
    setTimeout(() => inp.select(), 0);
  }

  shortcutsDialog() {
    const rows = [
      ['V / H', 'Mover / Mano'], ['F · R · O', 'Frame · Rectángulo · Círculo'], ['T · B · I · S', 'Texto · Botón · Imagen · Scroll'],
      ['Espacio + arrastrar', 'Desplazar lienzo'], ['Ctrl + rueda', 'Zoom'], ['Mayús 1 / 2 / 0', 'Ver todo / selección / 100%'],
      ['Ctrl + clic', 'Seleccionar en profundidad'], ['Doble clic', 'Entrar en grupo / editar texto'], ['Alt + arrastrar', 'Duplicar y medir distancias'],
      ['Mayús + arrastrar', 'Bloquear eje / mantener proporción'], ['Ctrl mientras arrastras', 'Sin snap ni reparentar'],
      ['Flechas (+Mayús)', 'Mover 1px (10px)'], ['Ctrl D / C / X / V', 'Duplicar / Copiar / Cortar / Pegar'],
      ['Ctrl G / Ctrl Mayús G', 'Agrupar / Desagrupar'], ['Mayús A', 'Auto layout (UIListLayout)'], ['Alt A/H/D/W/V/S', 'Alinear'],
      ['Ctrl ] / [', 'Adelante / atrás (Mayús: al frente/fondo)'], ['Ctrl Alt K', 'Crear componente'], ['Ctrl E', 'Exportar a Roblox'], ['F5', 'Probar interacciones'],
      ['Ctrl Alt C / V', 'Copiar / pegar estilo'], ['Ctrl Mayús A', 'Seleccionar capas iguales'], ['Ctrl F', 'Buscar y reemplazar'], ['Ctrl R', 'Renombrar selección'],
      ['K', 'Escalar selección con contenido'], ['Mayús T', 'Ordenar en cuadrícula'], ['Mayús R', 'Reglas y guías (arrastra desde la regla)'],
    ];
    dialog('Atajos de teclado', h('table', { class: 'props-table' }, rows.map(([k, v]) => h('tr', {}, h('td', {}, h('span', { class: 'kbd' }, k)), h('td', {}, v)))), [{ label: 'Cerrar' }]);
  }

  aboutDialog() {
    dialog('RbxUI Studio', h('div', {},
      h('p', {}, 'Editor tipo Figma para interfaces de Roblox. El diseño se guarda directamente como instancias de Roblox (Frame, TextLabel, UIStroke, UIGradient, UIListLayout…), así que la exportación es 1:1: nada se descuadra.'),
      h('p', {}, 'Formatos: .rbxmx (arrastrar a Studio), script Luau para la Command Bar, ModuleScript y JSON (que Claude puede leer y escribir).'),
      h('p', { class: 'hint' }, 'Fuentes incluidas bajo SIL Open Font License. Datos de la API de Roblox: rbx-dom reflection database.')), [{ label: 'Cerrar' }]);
  }

  /** PNG of a screen (renders offscreen with fonts inlined). */
  async screenshot(scr) {
    const { renderScreenPng } = await import('./editor/snapshot.js');
    return renderScreenPng(this, scr);
  }
}

// ---------- boot ----------
async function boot() {
  let doc = null;
  const params = new URLSearchParams(location.search);
  const saved = !params.has('fresh') && (await kvGet('autosave'));
  if (params.get('doc')) {
    try {
      const r = await fetch(params.get('doc'));
      doc = normalizeDocument(await r.json()).doc;
    } catch (e) {
      console.warn(e);
    }
  }
  if (!doc && saved) {
    try {
      doc = normalizeDocument(saved).doc;
    } catch (e) {
      console.warn('autosave inválido', e);
      doc = null;
    }
  }
  const first = !doc;
  if (!doc) doc = normalizeDocument(SAMPLE()).doc;
  const app = new App(doc);
  window.rbxui = app;
  if (first) {
    const map = await ensureKitAssets(app);
    app.store.edit('Ejemplo', () => {
      for (const n of app.store.allNodes()) if (n.props?.Image === 'asset:studs') n.props.Image = 'asset:' + map.studs;
    }, { silent: false });
    app.store.past = [];
    app.canvas.zoomToFit();
  }
}

boot();

export { App, canParent, isGuiObject, popover };
