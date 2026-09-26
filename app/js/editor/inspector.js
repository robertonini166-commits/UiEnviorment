// Right panel "Diseño": Figma-like property sections mapped 1:1 onto Roblox properties
// and UI modifier instances (UICorner, UIStroke, UIGradient, UIPadding, layouts...).

import { getProps, ENUMS, isText, isImage, isGuiObject, isModifier, isLayout, isButton, canParent, editableProps, WEIGHTS, GUI_OBJECTS } from '../core/schema.js';
import { FONT_FAMILIES, availableWeights, isApproximated, ensureFont, cssFamily } from '../core/fonts.js';
import { DEVICES } from '../core/model.js';
import { evalColorSequence, evalNumberSequence, rgba, round, clamp, deepEqual } from '../core/types.js';
import { h, numInput, textInput, select, checkbox, seg, field, colorField, popover, menu, toast } from './ui.js';
import { icon, classIcon } from './icons.js';
import { textLayoutFor } from '../core/paint.js';

const ALIGN_ICONS = { Left: 'alignL', Center: 'alignCH', Right: 'alignR', Top: 'alignT', Bottom: 'alignB' };

export class Inspector {
  constructor(app, host) {
    this.app = app;
    this.store = app.store;
    this.cmd = app.cmd;
    this.host = host;
    this.bound = [];
    this.collapsed = new Set(JSON.parse(localStorage.getItem('rbxui.collapsed') || '["all"]'));
    this.store.on((w) => {
      if (w.live) return this.refreshValues();
      if (w.doc || w.selection || w.view) this.render();
    });
  }

  // ---------- helpers ----------
  get nodes() {
    return this.store.selectedNodes();
  }
  ids(filter) {
    return this.nodes.filter((n) => !filter || filter(n)).map((n) => n.id);
  }
  common(prop, nodes = this.nodes) {
    const vals = nodes.filter((n) => prop in n.props).map((n) => n.props[prop]);
    if (!vals.length) return { value: undefined, mixed: false };
    const mixed = vals.some((v) => !deepEqual(v, vals[0]));
    return { value: vals[0], mixed };
  }
  set(prop, value, final = true, nodes) {
    const ids = (nodes || this.nodes).filter((n) => getProps(n.ClassName)[prop]).map((n) => n.id);
    if (!ids.length) return;
    this._self = true;
    if (!final) this.cmd.setProp(ids, prop, value, { live: true });
    else this.cmd.setProp(ids, prop, value);
    this._self = false;
  }
  bind(el, get) {
    this.bound.push({ el, get });
    return el;
  }
  refreshValues() {
    for (const b of this.bound) {
      try {
        const v = b.get();
        if (v !== undefined && b.el.setValue) b.el.setValue(v);
      } catch { /* node gone */ }
    }
  }

  section(key, title, body, { actions = [], collapsible = true, sub } = {}) {
    const collapsed = this.collapsed.has(key);
    const t = h('span', { class: 't' + (collapsible ? ' clickable' : '') }, title, sub ? h('small', {}, sub) : null);
    if (collapsible) {
      t.addEventListener('click', () => {
        collapsed ? this.collapsed.delete(key) : this.collapsed.add(key);
        localStorage.setItem('rbxui.collapsed', JSON.stringify([...this.collapsed]));
        this.render();
      });
    }
    return h('div', { class: 'insp-section' + (collapsed ? ' collapsed' : '') }, h('div', { class: 'hd' }, t, h('div', { class: 'actions', style: { display: 'flex', gap: '2px' } }, ...actions)), h('div', { class: 'bd' }, body));
  }

  addBtn(title, fn, ic = 'plus') {
    const b = h('button', { class: 'icon-btn', title, html: icon(ic) });
    b.addEventListener('click', fn);
    return b;
  }

  // ---------- main render ----------
  render() {
    if (this._self) return;
    const s = this.store;
    const scroll = this.host.scrollTop;
    this.bound = [];
    this.host.innerHTML = '';
    const nodes = this.nodes;
    if (!nodes.length) {
      this.host.append(this.screenPanel(s.activeScreen));
      return;
    }
    if (nodes.length === 1 && nodes[0].ClassName === 'ScreenGui') {
      this.host.append(this.screenPanel(nodes[0]));
      return;
    }
    if (nodes.every((n) => isModifier(n.ClassName))) {
      for (const m of nodes) this.host.append(this.section('mod-' + m.id, m.ClassName, this.modifierBody(m), { collapsible: false }));
      return;
    }
    const guis = nodes.filter((n) => isGuiObject(n.ClassName));
    this.host.append(this.headerSection(nodes));
    if (guis.length) {
      this.host.append(this.alignSection());
      this.host.append(this.geometrySection(guis));
      const containers = guis.filter((n) => ['Frame', 'ScrollingFrame', 'CanvasGroup'].includes(n.ClassName) || n.children.some((c) => isLayout(c.ClassName)));
      if (guis.length === 1 && containers.length === 1) this.host.append(this.layoutSection(guis[0]));
      if (guis.length === 1) {
        const p = s.parentOf(guis[0].id);
        if (p?.children.some((c) => c.ClassName === 'UIListLayout')) this.host.append(this.flexItemSection(guis[0]));
      }
      if (guis.every((n) => isText(n.ClassName))) this.host.append(this.textSection(guis));
      if (guis.every((n) => isImage(n.ClassName))) this.host.append(this.imageSection(guis));
      this.host.append(this.fillSection(guis));
      if (guis.length === 1) {
        this.host.append(this.cornerSection(guis[0]));
        this.host.append(this.strokeSection(guis[0]));
        this.host.append(this.shadowSection(guis[0]));
        this.host.append(this.constraintsSection(guis[0]));
      }
      if (guis.every((n) => n.ClassName === 'ScrollingFrame')) this.host.append(this.scrollSection(guis));
      if (guis.every((n) => n.ClassName === 'CanvasGroup')) this.host.append(this.canvasGroupSection(guis));
      this.host.append(this.behaviorSection(guis));
      if (guis.length === 1) this.host.append(this.allPropsSection(guis[0]));
    }
    this.host.scrollTop = scroll;
  }

  // ---------- screen ----------
  screenPanel(scr) {
    const s = this.store;
    if (!scr) return h('div', { class: 'empty-state' }, 'Sin pantallas');
    const d = scr.design;
    const wrap = h('div');
    const devOpts = Object.entries(DEVICES).map(([k, v]) => [k, v.label]);
    if (!DEVICES[d.device]) devOpts.push(['custom', `Personalizado ${d.width}×${d.height}`]);
    const body = h('div', {},
      field('Nombre', textInput(scr.Name, (v) => s.edit('Renombrar', () => (scr.Name = v)))),
      field('Dispositivo', select(devOpts, DEVICES[d.device] ? d.device : 'custom', (v) => this.cmd.setDevice(scr, v))),
      h('div', { class: 'grid2' },
        numInput({ label: 'W', value: d.width, step: 1, min: 100, decimals: 0, onChange: (v, f) => f && s.edit('Ancho', () => Object.assign(scr.design, { width: v, device: 'custom' })) }),
        numInput({ label: 'H', value: d.height, step: 1, min: 100, decimals: 0, onChange: (v, f) => f && s.edit('Alto', () => Object.assign(scr.design, { height: v, device: 'custom' })) })),
      h('div', { class: 'field', style: { marginTop: '6px' } }, h('label', {}, 'Fondo (vista)'), colorField({ color: d.background || '#3A6EA5', onChange: (c, t, f) => f && s.edit('Fondo', () => (scr.design.background = c)) })),
      h('div', { class: 'hint' }, 'El fondo solo es una ayuda visual del editor (no se exporta). Puedes poner una captura de tu juego como fondo:'),
      (() => {
        const b = h('button', { class: 'btn small', style: { marginTop: '6px' } }, d.backgroundImage ? 'Cambiar captura de fondo' : 'Usar captura del juego como fondo');
        b.addEventListener('click', () => this.app.pickFile('image/*', (file, url) => s.edit('Fondo', () => (scr.design.backgroundImage = url))));
        const x = d.backgroundImage ? h('button', { class: 'btn small ghost' }, 'Quitar') : null;
        x?.addEventListener('click', () => s.edit('Fondo', () => delete scr.design.backgroundImage));
        return h('div', { style: { display: 'flex', gap: '6px' } }, b, x);
      })(),
    );
    wrap.append(this.section('screen', 'Pantalla (ScreenGui)', body, { collapsible: false }));
    const P = scr.props;
    const setS = (k, v) => s.edit(k, () => (scr.props[k] = v));
    wrap.append(this.section('screengui', 'Propiedades de ScreenGui', h('div', {},
      h('div', { class: 'field' }, checkbox('Enabled', P.Enabled, (v) => setS('Enabled', v))),
      h('div', { class: 'field' }, checkbox('ResetOnSpawn', P.ResetOnSpawn, (v) => setS('ResetOnSpawn', v), 'Si se reinicia al reaparecer el personaje. Normalmente false.')),
      h('div', { class: 'field' }, checkbox('IgnoreGuiInset', P.IgnoreGuiInset, (v) => setS('IgnoreGuiInset', v), 'Ocupa también la barra superior de Roblox (58 px).')),
      field('ZIndexBehavior', select(Object.keys(ENUMS.ZIndexBehavior), P.ZIndexBehavior, (v) => setS('ZIndexBehavior', v))),
      field('DisplayOrder', numInput({ value: P.DisplayOrder, step: 1, decimals: 0, onChange: (v, f) => f && setS('DisplayOrder', v) })),
      field('ScreenInsets', select(Object.keys(ENUMS.ScreenInsets), P.ScreenInsets, (v) => setS('ScreenInsets', v))),
      P.ZIndexBehavior === 'Global' ? h('div', { class: 'warn-box' }, 'ZIndexBehavior Global se previsualiza como Sibling. Recomendado: Sibling.') : null,
    )));
    wrap.append(this.section('tips', 'Consejos', h('div', { class: 'hint' },
      h('p', {}, h('span', { class: 'kbd' }, 'F'), ' Frame · ', h('span', { class: 'kbd' }, 'T'), ' Texto · ', h('span', { class: 'kbd' }, 'B'), ' Botón · ', h('span', { class: 'kbd' }, 'I'), ' Imagen · ', h('span', { class: 'kbd' }, 'O'), ' Círculo'),
      h('p', {}, 'Doble clic para entrar en un grupo o editar texto. Ctrl+clic selecciona en profundidad. Arrastra con Alt para duplicar y ver distancias. Mayús+A = auto layout (UIListLayout).'),
      h('p', {}, 'Todo lo que ves son instancias reales de Roblox: lo que diseñas es exactamente lo que se exporta.'))));
    return wrap;
  }

  // ---------- header ----------
  headerSection(nodes) {
    const s = this.store;
    const n = nodes[0];
    const multi = nodes.length > 1;
    const classes = [...new Set(nodes.map((x) => x.ClassName))];
    const badge = h('button', { class: 'class-badge', title: 'Cambiar clase', html: classIcon(classes[0]) + `<span>${multi ? `${nodes.length} objetos` : n.ClassName}</span>` });
    badge.addEventListener('click', () => {
      if (!nodes.every((x) => isGuiObject(x.ClassName))) return;
      menu(GUI_OBJECTS.filter((c) => c !== n.ClassName).map((c) => ({ label: 'Convertir a ' + c, icon: null, action: () => this.cmd.changeClass(c) })), badge);
    });
    const body = h('div', {}, h('div', { class: 'field' }, badge, multi ? null : h('span', { class: 'hint', style: { marginLeft: 'auto' } }, n.editor?.componentId ? 'Instancia de componente' : '')));
    if (!multi) body.append(field('Name', textInput(n.Name, (v) => this.cmd.setProp([n.id], 'Name', v, { label: 'Renombrar' }), { title: 'Nombre de la instancia en Roblox (los scripts lo usan)' })));
    if (!multi && n.editor?.componentId) {
      const comp = s.doc.components?.[n.editor.componentId];
      const row = h('div', { style: { display: 'flex', gap: '6px' } });
      const go = h('button', { class: 'btn small' }, 'Editar componente');
      go.addEventListener('click', () => this.app.components?.editComponent(n.editor.componentId));
      const reset = h('button', { class: 'btn small' }, 'Restablecer');
      reset.addEventListener('click', () => this.app.components?.resetInstance(n.id));
      const det = h('button', { class: 'btn small ghost' }, 'Desvincular');
      det.addEventListener('click', () => this.app.components?.detach(n.id));
      row.append(go, reset, det);
      body.append(h('div', { class: 'hint' }, `Componente: ${comp?.name || '¿eliminado?'}`), row);
    }
    return this.section('header', 'Objeto', body, { collapsible: false });
  }

  alignSection() {
    const mk = (ic, mode, tip) => {
      const b = h('button', { class: 'icon-btn', title: tip, html: icon(ic) });
      b.addEventListener('click', () => (mode.startsWith('dist') ? this.cmd.distribute(mode === 'distH' ? 'h' : 'v') : this.cmd.align(mode)));
      return b;
    };
    return h('div', { class: 'insp-section', style: { display: 'flex', justifyContent: 'space-between', padding: '6px 10px' } },
      mk('alignL', 'left', 'Alinear a la izquierda (Alt+A)'), mk('alignCH', 'centerH', 'Centrar horizontal (Alt+H)'), mk('alignR', 'right', 'Alinear a la derecha (Alt+D)'),
      mk('alignT', 'top', 'Alinear arriba (Alt+W)'), mk('alignCV', 'centerV', 'Centrar vertical (Alt+V)'), mk('alignB', 'bottom', 'Alinear abajo (Alt+S)'),
      mk('distH', 'distH', 'Distribuir horizontalmente'), mk('distV', 'distV', 'Distribuir verticalmente'));
  }

  // ---------- geometry ----------
  geometrySection(nodes) {
    const s = this.store;
    const one = nodes.length === 1 ? nodes[0] : null;
    const pos = this.common('Position', nodes), size = this.common('Size', nodes);
    const anchor = this.common('AnchorPoint', nodes);
    const inLayout = nodes.some((n) => s.parentOf(n.id)?.children.some((c) => isLayout(c.ClassName)));
    const udimRow = (label, prop, idx, mixed) => {
      const cur = this.common(prop, nodes).value || [0, 0, 0, 0];
      const scale = this.bind(numInput({ label, value: cur[idx], step: 0.01, decimals: 4, mixed, title: `${prop}.${idx < 2 ? 'X' : 'Y'}.Scale (fracción del padre)`, onChange: (v, f) => this.set(prop, (old) => {
        const a = [...old];
        a[idx] = v;
        return a;
      }, f) }), () => one?.props[prop][idx]);
      const off = this.bind(numInput({ label: 'px', value: cur[idx + 1], step: 1, decimals: 0, mixed, title: `${prop}.${idx < 2 ? 'X' : 'Y'}.Offset (píxeles)`, onChange: (v, f) => this.set(prop, (old) => {
        const a = [...old];
        a[idx + 1] = v;
        return a;
      }, f) }), () => one?.props[prop][idx + 1]);
      return h('div', { class: 'grid2', style: { marginBottom: '6px' } }, scale, off);
    };
    const abs = one ? this.cmd.boxOf(one.id) : null;
    const body = h('div', {},
      h('div', { class: 'lbl', style: { margin: '2px 0 4px', display: 'flex', justifyContent: 'space-between' } }, h('span', {}, 'Position  (Scale | Offset)'), inLayout ? h('span', { style: { color: 'var(--warn)' } }, 'controlada por layout') : null),
      udimRow('X', 'Position', 0, pos.mixed), udimRow('Y', 'Position', 2, pos.mixed),
      h('div', { class: 'lbl', style: { margin: '6px 0 4px' } }, 'Size  (Scale | Offset)'),
      udimRow('W', 'Size', 0, size.mixed), udimRow('H', 'Size', 2, size.mixed),
    );
    if (abs) body.append(h('div', { class: 'hint', style: { marginBottom: '6px' } }, `Tamaño real: ${round(abs.w, 1)} × ${round(abs.h, 1)} px · posición ${round(abs.ax, 1)}, ${round(abs.ay, 1)}`));
    // anchor + rotation
    const ag = h('div', { class: 'anchor-grid', title: 'AnchorPoint' });
    const av = anchor.value || [0, 0];
    for (const y of [0, 0.5, 1]) for (const x of [0, 0.5, 1]) {
      const b = h('button', { class: !anchor.mixed && av[0] === x && av[1] === y ? 'on' : '', title: `AnchorPoint (${x}, ${y})` });
      b.addEventListener('click', () => this.setAnchorKeepPlace(nodes, [x, y]));
      ag.append(b);
    }
    const ax = numInput({ label: 'AX', value: av[0], step: 0.05, decimals: 3, mixed: anchor.mixed, onChange: (v, f) => f && this.setAnchorKeepPlace(nodes, [v, av[1]]) });
    const ay = numInput({ label: 'AY', value: av[1], step: 0.05, decimals: 3, mixed: anchor.mixed, onChange: (v, f) => f && this.setAnchorKeepPlace(nodes, [av[0], v]) });
    const rot = this.common('Rotation', nodes);
    const rotIn = this.bind(numInput({ label: '↻', value: rot.value ?? 0, step: 1, decimals: 2, mixed: rot.mixed, title: 'Rotation (grados)', onChange: (v, f) => this.set('Rotation', v, f) }), () => one?.props.Rotation);
    body.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } }, ag, h('div', { style: { flex: 1, display: 'grid', gap: '6px' } }, h('div', { class: 'grid2' }, ax, ay), rotIn)));
    // units
    const um = s.view.unitMode;
    body.append(h('div', { class: 'lbl', style: { margin: '8px 0 4px' } }, 'Unidades al mover/redimensionar'),
      seg([['keep', 'Mantener', 'Conserva Scale u Offset de cada eje'], ['scale', 'Scale', 'Todo relativo al padre (se adapta a cualquier pantalla)'], ['offset', 'Offset', 'Píxeles fijos']], um, (v) => s.setView({ unitMode: v })));
    const toS = h('button', { class: 'btn small', title: 'Convierte Position y Size a Scale manteniendo el aspecto actual' }, '→ Todo a Scale');
    toS.addEventListener('click', () => this.cmd.convertUnits('scale'));
    const toO = h('button', { class: 'btn small', title: 'Convierte Position y Size a Offset (px) manteniendo el aspecto actual' }, '→ Todo a Offset');
    toO.addEventListener('click', () => this.cmd.convertUnits('offset'));
    const toSR = h('button', { class: 'btn small ghost', title: 'Convierte también todos los hijos' }, '+ hijos');
    toSR.addEventListener('click', () => this.cmd.convertUnits('scale', true));
    body.append(h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' } }, toS, toO, toSR));
    // misc
    const z = this.common('ZIndex', nodes), lo = this.common('LayoutOrder', nodes);
    body.append(h('div', { class: 'grid2', style: { marginTop: '8px' } },
      numInput({ label: 'Z', value: z.value ?? 1, step: 1, decimals: 0, mixed: z.mixed, title: 'ZIndex', onChange: (v, f) => f && this.set('ZIndex', v) }),
      numInput({ label: 'Ord', value: lo.value ?? 0, step: 1, decimals: 0, mixed: lo.mixed, title: 'LayoutOrder (orden dentro de UIListLayout/UIGridLayout)', onChange: (v, f) => f && this.set('LayoutOrder', v) })));
    const as = this.common('AutomaticSize', nodes), sc = this.common('SizeConstraint', nodes);
    body.append(h('div', { class: 'grid2', style: { marginTop: '6px' } },
      h('div', {}, h('div', { class: 'lbl' }, 'AutomaticSize'), select(Object.keys(ENUMS.AutomaticSize), as.value, (v) => this.set('AutomaticSize', v), { mixed: as.mixed })),
      h('div', {}, h('div', { class: 'lbl' }, 'SizeConstraint'), select(Object.keys(ENUMS.SizeConstraint), sc.value, (v) => this.set('SizeConstraint', v), { mixed: sc.mixed }))));
    return this.section('geometry', 'Posición y tamaño', body);
  }

  /** Changes AnchorPoint while keeping the object in place (adjusts Position). */
  setAnchorKeepPlace(nodes, A) {
    const s = this.store;
    s.edit('AnchorPoint', () => {
      for (const n of nodes) {
        const b = this.cmd.boxOf(n.id), pb = this.cmd.parentBoxOf(n.id);
        n.props.AnchorPoint = [clamp(A[0], -10, 10), clamp(A[1], -10, 10)];
        const inLayout = s.parentOf(n.id)?.children.some((c) => isLayout(c.ClassName));
        if (b && pb && !inLayout) this.app.geometry.writeBox(n, pb, b, 'keep', { size: false });
      }
    });
  }

  // ---------- auto layout ----------
  layoutSection(n) {
    const layout = n.children.find((c) => isLayout(c.ClassName));
    const pad = n.children.find((c) => c.ClassName === 'UIPadding');
    const actions = [];
    const body = h('div');
    if (!layout) {
      const addList = h('button', { class: 'btn small' }, '+ Lista (UIListLayout)');
      addList.addEventListener('click', () => this.cmd.autoLayout());
      const addGrid = h('button', { class: 'btn small' }, '+ Cuadrícula');
      addGrid.addEventListener('click', () => this.cmd.addModifier('UIGridLayout', [n]));
      const addPage = h('button', { class: 'btn small ghost' }, '+ Páginas');
      addPage.addEventListener('click', () => this.cmd.addModifier('UIPageLayout', [n]));
      body.append(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, addList, addGrid, addPage), h('div', { class: 'hint', style: { marginTop: '6px' } }, 'Auto layout de Figma = UIListLayout (+ UIPadding). Los hijos se colocan solos y se reordenan arrastrando.'));
    } else {
      actions.push(this.addBtn('Quitar layout', () => this.cmd.removeNode(layout.id), 'minus'));
      const L = layout.props;
      const setL = (k, v, f = true) => this.set(k, v, f, [layout]);
      if (layout.ClassName === 'UIListLayout') {
        body.append(h('div', { style: { display: 'flex', gap: '6px', marginBottom: '6px' } },
          seg([['Vertical', icon('dirV'), 'Vertical'], ['Horizontal', icon('dirH'), 'Horizontal']], L.FillDirection, (v) => setL('FillDirection', v)),
          h('button', { class: 'icon-btn' + (L.Wraps ? ' on' : ''), title: 'Wraps (saltar de línea)', html: icon('wrap'), onclick: () => setL('Wraps', !L.Wraps) })));
      }
      if (layout.ClassName !== 'UIPageLayout' || true) {
        const hv = L.HorizontalAlignment, vv = L.VerticalAlignment;
        const grid = h('div', { class: 'anchor-grid', title: 'HorizontalAlignment / VerticalAlignment' });
        for (const y of ['Top', 'Center', 'Bottom']) for (const x of ['Left', 'Center', 'Right']) {
          const b = h('button', { class: hv === x && vv === y ? 'on' : '', title: `${x} / ${y}` });
          b.addEventListener('click', () => this.store.edit('Alineación', () => Object.assign(layout.props, { HorizontalAlignment: x, VerticalAlignment: y })));
          grid.append(b);
        }
        const right = h('div', { style: { flex: 1, display: 'grid', gap: '6px' } });
        if (layout.ClassName === 'UIListLayout' || layout.ClassName === 'UIPageLayout') {
          const P = L.Padding || [0, 0];
          right.append(h('div', { class: 'grid2' },
            numInput({ label: 'Gap', value: P[1], step: 1, decimals: 0, title: 'Padding.Offset entre elementos', onChange: (v, f) => setL('Padding', [P[0], v], f) }),
            numInput({ label: '%', value: P[0], step: 0.01, decimals: 3, title: 'Padding.Scale', onChange: (v, f) => setL('Padding', [v, P[1]], f) })));
        }
        if (layout.ClassName === 'UIGridLayout') {
          const cs = L.CellSize, cp = L.CellPadding;
          right.append(h('div', { class: 'grid2' },
            numInput({ label: 'CW', value: cs[1], step: 1, decimals: 0, title: 'CellSize X offset', onChange: (v, f) => setL('CellSize', [cs[0], v, cs[2], cs[3]], f) }),
            numInput({ label: 'CH', value: cs[3], step: 1, decimals: 0, title: 'CellSize Y offset', onChange: (v, f) => setL('CellSize', [cs[0], cs[1], cs[2], v], f) }),
            numInput({ label: 'GX', value: cp[1], step: 1, decimals: 0, title: 'CellPadding X', onChange: (v, f) => setL('CellPadding', [cp[0], v, cp[2], cp[3]], f) }),
            numInput({ label: 'GY', value: cp[3], step: 1, decimals: 0, title: 'CellPadding Y', onChange: (v, f) => setL('CellPadding', [cp[0], cp[1], cp[2], v], f) })));
        }
        body.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' } }, grid, right));
      }
      if (layout.ClassName === 'UIListLayout') {
        const flexKey = L.FillDirection === 'Horizontal' ? 'HorizontalFlex' : 'VerticalFlex';
        body.append(h('div', { class: 'grid2' },
          h('div', {}, h('div', { class: 'lbl' }, flexKey), select(Object.keys(ENUMS.UIFlexAlignment), L[flexKey], (v) => setL(flexKey, v))),
          h('div', {}, h('div', { class: 'lbl' }, 'ItemLineAlignment'), select(Object.keys(ENUMS.ItemLineAlignment), L.ItemLineAlignment, (v) => setL('ItemLineAlignment', v)))));
      }
      if (layout.ClassName === 'UIGridLayout') {
        body.append(h('div', { class: 'grid2' },
          h('div', {}, h('div', { class: 'lbl' }, 'FillDirection'), select(Object.keys(ENUMS.FillDirection), L.FillDirection, (v) => setL('FillDirection', v))),
          h('div', {}, h('div', { class: 'lbl' }, 'StartCorner'), select(Object.keys(ENUMS.StartCorner), L.StartCorner, (v) => setL('StartCorner', v))),
          h('div', {}, h('div', { class: 'lbl' }, 'Máx. celdas/línea'), numInput({ value: L.FillDirectionMaxCells, step: 1, decimals: 0, min: 0, onChange: (v, f) => setL('FillDirectionMaxCells', v, f) }))));
      }
      if (layout.ClassName === 'UIPageLayout') {
        body.append(h('div', { class: 'grid2' },
          h('div', { class: 'field' }, checkbox('Circular', L.Circular, (v) => setL('Circular', v))),
          h('div', { class: 'field' }, checkbox('Animated', L.Animated, (v) => setL('Animated', v)))));
      }
      body.append(h('div', { class: 'grid2', style: { marginTop: '6px' } },
        h('div', {}, h('div', { class: 'lbl' }, 'SortOrder'), select(Object.keys(ENUMS.SortOrder), L.SortOrder, (v) => setL('SortOrder', v)))));
    }
    // padding
    const padBox = h('div', { style: { marginTop: '8px' } });
    if (pad) {
      const P = pad.props;
      const pi = (k, lab) => numInput({ label: lab, value: P[k][1], step: 1, decimals: 0, title: `${k}.Offset`, onChange: (v, f) => this.set(k, [P[k][0], v], f, [pad]) });
      const rm = h('button', { class: 'icon-btn', title: 'Quitar UIPadding', html: icon('minus') });
      rm.addEventListener('click', () => this.cmd.removeNode(pad.id));
      padBox.append(h('div', { class: 'lbl', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, 'UIPadding (px)', rm),
        h('div', { class: 'grid2' }, pi('PaddingLeft', '←'), pi('PaddingRight', '→'), pi('PaddingTop', '↑'), pi('PaddingBottom', '↓')));
    } else {
      const b = h('button', { class: 'btn small ghost' }, '+ UIPadding');
      b.addEventListener('click', () => this.cmd.addModifier('UIPadding', [n]));
      padBox.append(b);
    }
    body.append(padBox);
    return this.section('layout', 'Auto layout', body, { actions, sub: layout ? layout.ClassName : '' });
  }

  flexItemSection(n) {
    const fi = n.children.find((c) => c.ClassName === 'UIFlexItem');
    const body = h('div');
    if (!fi) {
      const b = h('button', { class: 'btn small ghost' }, '+ UIFlexItem');
      b.addEventListener('click', () => this.cmd.addModifier('UIFlexItem', [n]));
      body.append(b, h('div', { class: 'hint' }, 'Hace que este hijo crezca/encoja dentro de la lista (como "Fill container" en Figma).'));
    } else {
      const P = fi.props;
      body.append(h('div', { class: 'grid2' },
        h('div', {}, h('div', { class: 'lbl' }, 'FlexMode'), select(Object.keys(ENUMS.UIFlexMode), P.FlexMode, (v) => this.set('FlexMode', v, true, [fi]))),
        h('div', {}, h('div', { class: 'lbl' }, 'ItemLineAlignment'), select(Object.keys(ENUMS.ItemLineAlignment), P.ItemLineAlignment, (v) => this.set('ItemLineAlignment', v, true, [fi])))));
      if (P.FlexMode === 'Custom') body.append(h('div', { class: 'grid2', style: { marginTop: '6px' } },
        numInput({ label: 'Grow', value: P.GrowRatio, step: 0.1, decimals: 2, onChange: (v, f) => this.set('GrowRatio', v, f, [fi]) }),
        numInput({ label: 'Shrink', value: P.ShrinkRatio, step: 0.1, decimals: 2, onChange: (v, f) => this.set('ShrinkRatio', v, f, [fi]) })));
    }
    return this.section('flexitem', 'Elemento de layout', body, { actions: fi ? [this.addBtn('Quitar UIFlexItem', () => this.cmd.removeNode(fi.id), 'minus')] : [] });
  }

  // ---------- fill ----------
  fillSection(nodes) {
    const bg = this.common('BackgroundColor3', nodes), bt = this.common('BackgroundTransparency', nodes);
    const body = h('div', {}, h('div', { class: 'field' }, colorField({ color: bg.value || '#FFFFFF', transparency: bt.value ?? 0, mixed: bg.mixed, swatches: this.store.doc.swatches, onChange: (c, t, f) => {
      this.set('BackgroundColor3', c, false);
      this.set('BackgroundTransparency', t, f);
    } })));
    const one = nodes.length === 1 ? nodes[0] : null;
    const grad = one?.children.find((c) => c.ClassName === 'UIGradient');
    const actions = [];
    if (one && canParent('UIGradient', one.ClassName)) {
      if (!grad) {
        const b = h('button', { class: 'btn small ghost', style: { marginTop: '2px' } }, '+ Degradado (UIGradient)');
        b.addEventListener('click', () => {
          const [g] = this.cmd.addModifier('UIGradient', [one]) || [];
          if (g && (one.props.BackgroundColor3 || '#FFFFFF') !== '#FFFFFF') {
            this.store.edit('Degradado', () => {
              g.props.Color = [[0, one.props.BackgroundColor3], [1, shade(one.props.BackgroundColor3, -0.25)]];
              one.props.BackgroundColor3 = '#FFFFFF';
            });
          }
        });
        body.append(b);
      } else {
        body.append(this.gradientEditor(grad, one));
      }
    }
    if (one && isText(one.ClassName) && grad) body.append(h('div', { class: 'hint' }, 'Ojo: en Roblox el UIGradient también tiñe el texto de este objeto. Para texto limpio usa un TextLabel hijo.'));
    return this.section('fill', 'Relleno', body, { actions });
  }

  gradientEditor(g, owner) {
    const P = g.props;
    const wrap = h('div', { class: 'mod-card' });
    const rm = h('button', { class: 'icon-btn', title: 'Quitar UIGradient', html: icon('minus') });
    rm.addEventListener('click', () => this.cmd.removeNode(g.id));
    const en = checkbox('', P.Enabled !== false, (v) => this.set('Enabled', v, true, [g]), 'Enabled');
    wrap.append(h('div', { class: 'mod-hd' }, h('span', { class: 'nm' }, 'UIGradient'), en, rm));
    // tracks
    let selColor = this._gsel?.id === g.id ? this._gsel.i : 0;
    const colorBar = (kind) => {
      const seq = kind === 'color' ? P.Color : P.Transparency;
      const bar = h('div', { class: 'gbar' + (kind === 'alpha' ? ' alpha' : '') });
      const fill = h('div', { class: 'fill' });
      const stops = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        stops.push(kind === 'color' ? `${evalColorSequence(P.Color, t)} ${t * 100}%` : `rgba(255,255,255,${1 - evalNumberSequence(P.Transparency, t)}) ${t * 100}%`);
      }
      fill.style.background = `linear-gradient(90deg, ${stops.join(',')})`;
      bar.append(fill);
      seq.forEach(([t, v], i) => {
        const st = h('div', { class: 'stop' + (kind === 'color' && i === selColor ? ' on' : ''), style: { left: t * 100 + '%', '--c': kind === 'color' ? v : '#fff', '--a': kind === 'alpha' ? v : 0 }, title: kind === 'color' ? `${v} @ ${round(t, 3)}` : `Transparencia ${v} @ ${round(t, 3)}` });
        st.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (kind === 'color') {
            this._gsel = { id: g.id, i };
          }
          const r = bar.getBoundingClientRect();
          st.setPointerCapture(e.pointerId);
          let moved = false;
          const mv = (ev) => {
            moved = true;
            if (i === 0 || i === seq.length - 1) return; // endpoints fixed at 0 and 1 (Roblox rule)
            const nt = round(clamp((ev.clientX - r.left) / r.width, 0.001, 0.999), 3);
            const key = kind === 'color' ? 'Color' : 'Transparency';
            this.set(key, (old) => {
              const a = old.map((k) => [...k]);
              a[i][0] = nt;
              return a.sort((x, y) => x[0] - y[0]);
            }, false, [g]);
          };
          const up = (ev) => {
            st.removeEventListener('pointermove', mv);
            st.removeEventListener('pointerup', up);
            const key = kind === 'color' ? 'Color' : 'Transparency';
            if (Math.abs(ev.clientY - r.top) > 60 && seq.length > 2 && i !== 0 && i !== seq.length - 1) {
              this.set(key, (old) => old.filter((_, j) => j !== i), true, [g]);
              return;
            }
            if (moved) this.set(key, (old) => old, true, [g]);
            else if (kind === 'color') this.render();
            else {
              const inp = numInput({ label: 'T', value: v, step: 0.05, min: 0, max: 1, decimals: 3, onChange: (nv, f) => this.set('Transparency', (old) => old.map((k, j) => (j === i ? [k[0], nv] : k)), f, [g]) });
              popover(h('div', { style: { padding: '8px', width: '140px' } }, inp), st);
            }
          };
          st.addEventListener('pointermove', mv);
          st.addEventListener('pointerup', up);
        });
        bar.append(st);
      });
      bar.addEventListener('pointerdown', (e) => {
        if (e.target !== bar && e.target !== fill) return;
        const r = bar.getBoundingClientRect();
        const t = round(clamp((e.clientX - r.left) / r.width, 0.001, 0.999), 3);
        const key = kind === 'color' ? 'Color' : 'Transparency';
        const val = kind === 'color' ? evalColorSequence(P.Color, t) : round(evalNumberSequence(P.Transparency, t), 3);
        if (seq.length >= 20) return toast('Roblox admite máximo 20 puntos', 'err');
        this.set(key, (old) => [...old.map((k) => [...k]), [t, val]].sort((a, b) => a[0] - b[0]), true, [g]);
      });
      return bar;
    };
    wrap.append(h('div', { class: 'lbl' }, 'Color (ColorSequence)'), colorBar('color'));
    const cur = P.Color[Math.min(selColor, P.Color.length - 1)];
    if (cur) {
      const idx = Math.min(selColor, P.Color.length - 1);
      wrap.append(h('div', { class: 'field' }, h('label', {}, `Punto ${idx + 1}`), colorField({ color: cur[1], swatches: this.store.doc.swatches, onChange: (c, t, f) => this.set('Color', (old) => old.map((k, j) => (j === idx ? [k[0], c] : k)), f, [g]) })));
    }
    wrap.append(h('div', { class: 'lbl' }, 'Transparencia (NumberSequence)'), colorBar('alpha'));
    wrap.append(h('div', { class: 'grid2' },
      numInput({ label: '↻', value: P.Rotation, step: 1, decimals: 2, title: 'Rotation', onChange: (v, f) => this.set('Rotation', v, f, [g]) }),
      select(Object.keys(ENUMS.GradientType), P.Type, (v) => this.set('Type', v, true, [g]), { title: 'Type' }),
      numInput({ label: 'OX', value: P.Offset[0], step: 0.05, decimals: 3, title: 'Offset.X', onChange: (v, f) => this.set('Offset', [v, P.Offset[1]], f, [g]) }),
      numInput({ label: 'OY', value: P.Offset[1], step: 0.05, decimals: 3, title: 'Offset.Y', onChange: (v, f) => this.set('Offset', [P.Offset[0], v], f, [g]) }),
      numInput({ label: 'Esc', value: P.Scale ?? 1, step: 0.05, decimals: 3, min: 0.001, title: 'Scale', onChange: (v, f) => this.set('Scale', v, f, [g]) }),
      select(Object.keys(ENUMS.GradientTileMode), P.TileMode, (v) => this.set('TileMode', v, true, [g]), { title: 'TileMode' })));
    const presets = h('div', { style: { display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' } });
    const preset = (label, color, tr, rot = 90) => {
      const b = h('button', { class: 'btn small ghost' }, label);
      b.addEventListener('click', () => this.store.edit('Preset degradado', () => Object.assign(g.props, { Color: color, Transparency: tr, Rotation: rot, Offset: [0, 0] })));
      presets.append(b);
    };
    const base = owner.props.BackgroundColor3 || '#FFFFFF';
    preset('Brillo', [[0, '#FFFFFF'], [1, '#C8C8C8']], [[0, 0], [1, 0]]);
    preset('Sombra abajo', [[0, '#FFFFFF'], [0.55, '#FFFFFF'], [1, '#9A9A9A']], [[0, 0], [1, 0]]);
    preset('Invertir', [...P.Color].map(([t, c]) => [round(1 - t, 3), c]).reverse(), [...P.Transparency].map(([t, v]) => [round(1 - t, 3), v]).reverse(), P.Rotation);
    preset('Desvanecer', [[0, '#FFFFFF'], [1, '#FFFFFF']], [[0, 0], [1, 1]]);
    void base;
    wrap.append(presets, h('div', { class: 'hint', style: { marginTop: '4px' } }, 'El color del degradado se multiplica por BackgroundColor3 (déjalo en blanco para colores exactos). Arrastra un punto fuera para borrarlo.'));
    return wrap;
  }

  // ---------- corners ----------
  cornerSection(n) {
    const c = n.children.find((x) => x.ClassName === 'UICorner');
    const body = h('div');
    const actions = [];
    if (!canParent('UICorner', n.ClassName)) return h('div');
    if (!c) {
      actions.push(this.addBtn('Añadir UICorner', () => this.cmd.addModifier('UICorner', [n])));
      body.append(h('div', { class: 'hint' }, 'Sin esquinas redondeadas (UICorner).'));
    } else {
      actions.push(this.addBtn('Quitar UICorner', () => this.cmd.removeNode(c.id), 'minus'));
      const P = c.props;
      const r = P.CornerRadius;
      body.append(h('div', { class: 'grid2' },
        numInput({ label: 'R', value: r[1], step: 1, decimals: 0, min: 0, title: 'CornerRadius.Offset (px)', onChange: (v, f) => this.set('CornerRadius', [r[0], v], f, [c]) }),
        numInput({ label: '%', value: r[0], step: 0.05, decimals: 3, min: 0, title: 'CornerRadius.Scale (0.5 = píldora/círculo)', onChange: (v, f) => this.set('CornerRadius', [v, r[1]], f, [c]) })));
      const indiv = ['TopLeftRadius', 'TopRightRadius', 'BottomRightRadius', 'BottomLeftRadius'];
      const differs = indiv.some((k) => P[k] && !deepEqual(P[k], P.CornerRadius));
      const toggle = h('button', { class: 'btn small ghost', style: { marginTop: '6px' } }, differs ? 'Esquinas individuales ▾' : 'Esquinas individuales ▸');
      body.append(toggle);
      const box = h('div', { class: 'grid2', style: { marginTop: '6px', display: differs || this._showCorners ? 'grid' : 'none' } },
        ...indiv.map((k, i) => numInput({ label: ['↖', '↗', '↘', '↙'][i], value: (P[k] || r)[1], step: 1, decimals: 0, min: 0, title: `${k}.Offset (beta de Roblox)`, onChange: (v, f) => this.set(k, [(P[k] || r)[0], v], f, [c]) })));
      toggle.addEventListener('click', () => {
        this._showCorners = !this._showCorners;
        box.style.display = box.style.display === 'none' ? 'grid' : 'none';
      });
      body.append(box);
      if (differs) body.append(h('div', { class: 'hint' }, 'Radios individuales: función beta de Roblox ("New UI Capabilities"). Se exportan protegidos.'));
      const presets = h('div', { style: { display: 'flex', gap: '4px', marginTop: '6px' } });
      for (const [lab, val] of [['0', [0, 0]], ['4', [0, 4]], ['8', [0, 8]], ['12', [0, 12]], ['16', [0, 16]], ['Píldora', [0.5, 0]]]) {
        const b = h('button', { class: 'btn small ghost' }, lab);
        b.addEventListener('click', () => this.set('CornerRadius', val, true, [c]));
        presets.append(b);
      }
      body.append(presets);
    }
    return this.section('corner', 'Esquinas', body, { actions, sub: c ? 'UICorner' : '' });
  }

  // ---------- strokes ----------
  strokeSection(n) {
    const strokes = n.children.filter((x) => x.ClassName === 'UIStroke');
    const body = h('div');
    const actions = [this.addBtn('Añadir UIStroke', () => this.cmd.addModifier('UIStroke', [n]))];
    if (!strokes.length) body.append(h('div', { class: 'hint' }, isText(n.ClassName) ? 'Sin contorno. En texto, UIStroke (Contextual) contornea las letras; con ApplyStrokeMode=Border contornea la caja.' : 'Sin contorno (UIStroke).'));
    for (const st of strokes) body.append(this.strokeCard(st, n));
    return this.section('stroke', 'Contorno', body, { actions, sub: strokes.length ? `UIStroke ×${strokes.length}` : '' });
  }

  strokeCard(st, owner) {
    const P = st.props;
    const card = h('div', { class: 'mod-card' });
    const rm = h('button', { class: 'icon-btn', title: 'Quitar', html: icon('minus') });
    rm.addEventListener('click', () => this.cmd.removeNode(st.id));
    const text = isText(owner.ClassName);
    card.append(h('div', { class: 'mod-hd' }, h('span', { class: 'nm' }, text ? (P.ApplyStrokeMode === 'Border' ? 'Borde de caja' : 'Contorno de letras') : 'Borde'), checkbox('', P.Enabled !== false, (v) => this.set('Enabled', v, true, [st]), 'Enabled'), rm));
    card.append(h('div', { class: 'field' }, colorField({ color: P.Color, transparency: P.Transparency, swatches: this.store.doc.swatches, onChange: (c, t, f) => {
      this.set('Color', c, false, [st]);
      this.set('Transparency', t, f, [st]);
    } })));
    card.append(h('div', { class: 'grid2' },
      numInput({ label: 'Grosor', value: P.Thickness, step: 0.5, decimals: 2, min: 0, title: 'Thickness', onChange: (v, f) => this.set('Thickness', v, f, [st]) }),
      select(Object.keys(ENUMS.LineJoinMode), P.LineJoinMode, (v) => this.set('LineJoinMode', v, true, [st]), { title: 'LineJoinMode (esquinas)' })));
    const row2 = h('div', { class: 'grid2', style: { marginTop: '6px' } });
    if (text) row2.append(select(Object.keys(ENUMS.ApplyStrokeMode), P.ApplyStrokeMode, (v) => this.set('ApplyStrokeMode', v, true, [st]), { title: 'ApplyStrokeMode' }));
    if (!text || P.ApplyStrokeMode === 'Border') row2.append(select(Object.keys(ENUMS.BorderStrokePosition), P.BorderStrokePosition || 'Outer', (v) => this.set('BorderStrokePosition', v, true, [st]), { title: 'BorderStrokePosition (fuera/centro/dentro)' }));
    card.append(row2);
    const g = st.children.find((c) => c.ClassName === 'UIGradient');
    if (g) card.append(this.gradientEditor(g, st));
    else {
      const b = h('button', { class: 'btn small ghost', style: { marginTop: '6px' } }, '+ degradado del contorno');
      b.addEventListener('click', () => this.store.edit('Degradado de contorno', () => {
        const { createNode } = this.app.model;
        const gg = createNode('UIGradient', { Color: [[0, '#FFFFFF'], [1, '#888888']], Rotation: 90 });
        gg.Name = 'UIGradient';
        st.children.push(gg);
      }));
      card.append(b);
    }
    return card;
  }

  // ---------- shadow ----------
  shadowSection(n) {
    const shadows = n.children.filter((x) => x.ClassName === 'UIShadow');
    const body = h('div');
    const actions = [this.addBtn('Añadir UIShadow', () => this.cmd.addModifier('UIShadow', [n]))];
    const hard = h('button', { class: 'btn small ghost' }, '+ Sombra dura (estilo simulador)');
    hard.addEventListener('click', () => this.store.edit('Sombra dura', () => {
      const { createNode } = this.app.model;
      const sh = createNode('UIShadow', { Color: '#000000', Transparency: 0.35, BlurRadius: [0, 0], Offset: [0, 0, 0, 6], ZIndex: -1 });
      sh.Name = 'UIShadow';
      n.children.unshift(sh);
    }));
    if (!shadows.length) body.append(h('div', { class: 'hint' }, 'Sin sombra. UIShadow es la sombra nativa de Roblox (blur, offset, spread).'), hard);
    for (const sh of shadows) {
      const P = sh.props;
      const card = h('div', { class: 'mod-card' });
      const rm = h('button', { class: 'icon-btn', title: 'Quitar', html: icon('minus') });
      rm.addEventListener('click', () => this.cmd.removeNode(sh.id));
      card.append(h('div', { class: 'mod-hd' }, h('span', { class: 'nm' }, 'UIShadow'), checkbox('', P.Enabled !== false, (v) => this.set('Enabled', v, true, [sh])), rm));
      card.append(h('div', { class: 'field' }, colorField({ color: P.Color, transparency: P.Transparency, swatches: this.store.doc.swatches, onChange: (c, t, f) => {
        this.set('Color', c, false, [sh]);
        this.set('Transparency', t, f, [sh]);
      } })));
      card.append(h('div', { class: 'grid2' },
        numInput({ label: 'X', value: P.Offset[1], step: 1, decimals: 0, title: 'Offset X (px)', onChange: (v, f) => this.set('Offset', [P.Offset[0], v, P.Offset[2], P.Offset[3]], f, [sh]) }),
        numInput({ label: 'Y', value: P.Offset[3], step: 1, decimals: 0, title: 'Offset Y (px)', onChange: (v, f) => this.set('Offset', [P.Offset[0], P.Offset[1], P.Offset[2], v], f, [sh]) }),
        numInput({ label: 'Blur', value: P.BlurRadius[1], step: 1, decimals: 0, min: 0, title: 'BlurRadius (px)', onChange: (v, f) => this.set('BlurRadius', [P.BlurRadius[0], v], f, [sh]) }),
        numInput({ label: 'Spr', value: P.Spread[1], step: 1, decimals: 0, title: 'Spread (px, ambos ejes)', onChange: (v, f) => this.set('Spread', [P.Spread[0], v, P.Spread[2], v], f, [sh]) })));
      body.append(card);
    }
    return this.section('shadow', 'Sombra', body, { actions, sub: shadows.length ? 'UIShadow' : '' });
  }

  // ---------- text ----------
  textSection(nodes) {
    const one = nodes.length === 1 ? nodes[0] : null;
    const body = h('div');
    const txt = this.common('Text', nodes);
    if (one) body.append(h('div', { class: 'field col' }, textInput(one.props.Text, (v) => this.set('Text', v), { multiline: true, placeholder: 'Texto…' })));
    else body.append(h('div', { class: 'hint' }, txt.mixed ? 'Textos distintos' : ''));
    if (nodes.every((n) => n.ClassName === 'TextBox')) {
      const ph = this.common('PlaceholderText', nodes);
      body.append(field('Placeholder', textInput(ph.value, (v) => this.set('PlaceholderText', v))));
    }
    // font
    const ff = this.common('FontFace', nodes);
    const f = ff.value || { family: 'Montserrat', weight: 'Regular', style: 'Normal' };
    const fam = FONT_FAMILIES.find((x) => x.id === f.family);
    const fontBtn = h('button', { class: 'sel', style: { textAlign: 'left', fontFamily: cssFamily(f.family), fontWeight: WEIGHTS[f.weight] } }, ff.mixed ? 'Mixto' : fam?.name || f.family, isApproximated(f.family) ? ' ⚠' : '');
    ensureFont(f.family, f.weight, f.style);
    fontBtn.addEventListener('click', () => this.fontPicker(fontBtn, f, (fid) => this.set('FontFace', (old) => ({ ...old, family: fid }))));
    body.append(h('div', { class: 'field' }, fontBtn));
    if (isApproximated(f.family)) body.append(h('div', { class: 'warn-box' }, `${fam?.name}: fuente exclusiva de Roblox. La vista previa usa ${fam?.approx}; en Roblox se verá con la real. Puedes importar el archivo desde tu Studio (Menú › Fuentes de Roblox).`));
    const avail = availableWeights(f.family);
    const wOpts = Object.keys(WEIGHTS).map((w) => [w, `${w} (${WEIGHTS[w]})${avail.length && !avail.includes(WEIGHTS[w]) ? ' ~' : ''}`]);
    const ts = this.common('TextSize', nodes);
    body.append(h('div', { class: 'grid2' },
      select(wOpts, f.weight, (v) => this.set('FontFace', (old) => ({ ...old, weight: v })), { title: 'FontWeight (~ = la fuente no tiene ese grosor; Roblox usa el más cercano)', mixed: ff.mixed }),
      numInput({ label: 'Tam', value: ts.value ?? 14, step: 1, decimals: 1, min: 1, max: 100, mixed: ts.mixed, title: 'TextSize (1-100). En Roblox = altura de línea en px', onChange: (v, fin) => this.set('TextSize', v, fin) })));
    body.append(h('div', { class: 'grid2', style: { marginTop: '6px' } },
      h('div', { class: 'field', style: { margin: 0 } }, checkbox('Cursiva', f.style === 'Italic', (v) => this.set('FontFace', (old) => ({ ...old, style: v ? 'Italic' : 'Normal' })))),
      numInput({ label: 'Línea', value: this.common('LineHeight', nodes).value ?? 1, step: 0.05, decimals: 2, min: 1, max: 3, title: 'LineHeight (1-3)', onChange: (v, fin) => this.set('LineHeight', v, fin) })));
    // color
    const tc = this.common('TextColor3', nodes), tt = this.common('TextTransparency', nodes);
    body.append(h('div', { class: 'field', style: { marginTop: '6px' } }, colorField({ color: tc.value || '#000000', transparency: tt.value ?? 0, mixed: tc.mixed, swatches: this.store.doc.swatches, onChange: (c, t, fin) => {
      this.set('TextColor3', c, false);
      this.set('TextTransparency', t, fin);
    } })));
    // alignment
    const xa = this.common('TextXAlignment', nodes).value, ya = this.common('TextYAlignment', nodes).value;
    body.append(h('div', { class: 'grid2' },
      seg(['Left', 'Center', 'Right'].map((v) => [v, icon(ALIGN_ICONS[v]), v]), xa, (v) => this.set('TextXAlignment', v)),
      seg(['Top', 'Center', 'Bottom'].map((v) => [v, icon(ALIGN_ICONS[v]), v]), ya, (v) => this.set('TextYAlignment', v))));
    const sc = this.common('TextScaled', nodes), wr = this.common('TextWrapped', nodes), rt = this.common('RichText', nodes);
    body.append(h('div', { class: 'grid2', style: { marginTop: '8px' } },
      checkbox('TextScaled', sc.value, (v) => this.set('TextScaled', v), 'Ajusta el tamaño al hueco (máx 100)'),
      checkbox('TextWrapped', wr.value, (v) => this.set('TextWrapped', v)),
      checkbox('RichText', rt.value, (v) => this.set('RichText', v), 'Permite <b>, <font color="#hex">, <stroke>… '),
      select(Object.keys(ENUMS.TextTruncate), this.common('TextTruncate', nodes).value, (v) => this.set('TextTruncate', v), { title: 'TextTruncate' })));
    // auto width
    const autoBtn = h('button', { class: 'btn small ghost', style: { marginTop: '6px' }, title: 'AutomaticSize = XY (la caja se adapta al texto)' }, 'Ajustar caja al texto');
    autoBtn.addEventListener('click', () => this.store.edit('Ajustar al texto', () => {
      for (const n of nodes) {
        const b = this.cmd.boxOf(n.id);
        const { lay } = textLayoutFor(n, { ...b, w: 1e5, h: 1e5, pad: b.pad });
        const pad = b.pad || { l: 0, r: 0, t: 0, b: 0 };
        n.props.Size = [0, Math.ceil(lay.bounds.w + pad.l + pad.r), 0, Math.ceil(lay.bounds.h + pad.t + pad.b)];
      }
    }));
    body.append(autoBtn);
    if (one) {
      const b = this.cmd.boxOf(one.id);
      if (b) {
        const r = textLayoutFor(one, b);
        if (!r.lay.fits && !one.props.TextScaled) body.append(h('div', { class: 'warn-box' }, 'El texto no cabe en su caja: en Roblox se saldrá o se cortará. Usa TextScaled, agranda la caja o activa AutomaticSize.'));
        if (one.props.TextScaled) body.append(h('div', { class: 'hint' }, `TextScaled → tamaño efectivo ≈ ${r.base.size}px`));
      }
    }
    // legacy stroke
    const ls = this.common('TextStrokeTransparency', nodes);
    body.append(h('div', { class: 'lbl', style: { marginTop: '8px' } }, 'TextStroke (antiguo, 1px — mejor usa UIStroke)'),
      h('div', { class: 'field' }, colorField({ color: this.common('TextStrokeColor3', nodes).value || '#000000', transparency: ls.value ?? 1, swatches: this.store.doc.swatches, onChange: (c, t, fin) => {
        this.set('TextStrokeColor3', c, false);
        this.set('TextStrokeTransparency', t, fin);
      } })));
    return this.section('text', 'Texto', body);
  }

  fontPicker(anchor, f, onPick) {
    const list = h('div', { class: 'menu', style: { maxHeight: '60vh', width: '270px' } });
    const q = h('input', { class: 'txt', placeholder: 'Buscar fuente de Roblox…', style: { margin: '4px 4px 6px', width: 'calc(100% - 8px)' } });
    q.addEventListener('keydown', (e) => e.stopPropagation());
    const items = [];
    for (const fam of FONT_FAMILIES) {
      ensureFont(fam.id, 'Regular', 'Normal');
      const it = h('div', { class: 'mi' + (fam.id === f.family ? ' hot' : ''), style: { fontFamily: cssFamily(fam.id), fontSize: '15px' }, title: fam.asset }, fam.name, isApproximated(fam.id) ? h('span', { class: 'sc', title: 'Solo en Roblox: vista previa aproximada' }, '⚠ aprox') : null);
      it.addEventListener('click', () => {
        onPick(fam.id);
        pop.close();
      });
      items.push([fam, it]);
      list.append(it);
    }
    q.addEventListener('input', () => {
      const v = q.value.toLowerCase();
      for (const [fam, it] of items) it.style.display = fam.name.toLowerCase().includes(v) ? '' : 'none';
    });
    const pop = popover(h('div', {}, q, h('div', { class: 'hint', style: { padding: '0 8px 4px' } }, 'Solo las 40 familias oficiales de Roblox (Font.new)'), list), anchor, { side: 'left' });
    setTimeout(() => q.focus(), 0);
  }

  // ---------- image ----------
  imageSection(nodes) {
    const one = nodes.length === 1 ? nodes[0] : null;
    const body = h('div');
    const img = this.common('Image', nodes);
    const asset = one && this.app.assets?.resolve(one.props.Image);
    const pick = h('button', { class: 'btn small' }, img.value ? 'Cambiar imagen' : 'Elegir imagen');
    pick.addEventListener('click', () => this.app.pickImageFor?.(one ? one.id : null, nodes.map((n) => n.id)));
    const preview = asset?.url ? h('img', { src: asset.url, style: { maxWidth: '64px', maxHeight: '64px', background: '#333', borderRadius: '4px' } }) : null;
    body.append(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' } }, preview, h('div', { style: { display: 'grid', gap: '4px', flex: 1 } }, pick, h('div', { class: 'hint' }, img.value ? (asset ? `${asset.name || ''} ${asset.rbxId ? '· rbxassetid://' + asset.rbxId : '· sin subir a Roblox'}` : String(img.value)) : 'Sin imagen'))));
    body.append(field('Image', textInput(img.mixed ? '' : img.value, (v) => this.set('Image', v.trim()), { placeholder: 'rbxassetid://123 o asset local', title: 'ContentId. Puedes pegar un rbxassetid directamente.' })));
    const ic = this.common('ImageColor3', nodes), it = this.common('ImageTransparency', nodes);
    body.append(h('div', { class: 'lbl' }, 'ImageColor3 (tinte) / ImageTransparency'), h('div', { class: 'field' }, colorField({ color: ic.value || '#FFFFFF', transparency: it.value ?? 0, swatches: this.store.doc.swatches, onChange: (c, t, f) => {
      this.set('ImageColor3', c, false);
      this.set('ImageTransparency', t, f);
    } })));
    const st = this.common('ScaleType', nodes);
    body.append(h('div', { class: 'grid2' },
      select(Object.keys(ENUMS.ScaleType), st.value, (v) => this.set('ScaleType', v), { title: 'ScaleType' }),
      select(Object.keys(ENUMS.ResamplerMode), this.common('ResampleMode', nodes).value, (v) => this.set('ResampleMode', v), { title: 'ResampleMode' })));
    if (one && st.value === 'Slice') {
      const sc = one.props.SliceCenter || [0, 0, 0, 0];
      body.append(h('div', { class: 'lbl', style: { marginTop: '6px' } }, 'SliceCenter (px de la imagen) / SliceScale'),
        h('div', { class: 'grid2' },
          ...['X0', 'Y0', 'X1', 'Y1'].map((l, i) => numInput({ label: l, value: sc[i], step: 1, decimals: 0, onChange: (v, f) => this.set('SliceCenter', (old) => old.map((x, j) => (j === i ? v : x)), f) })),
          numInput({ label: 'Esc', value: one.props.SliceScale ?? 1, step: 0.05, decimals: 3, onChange: (v, f) => this.set('SliceScale', v, f) })));
      if (asset?.width) {
        const auto = h('button', { class: 'btn small ghost', style: { marginTop: '4px' } }, 'Centro automático (1/3)');
        auto.addEventListener('click', () => this.set('SliceCenter', [Math.round(asset.width / 3), Math.round(asset.height / 3), Math.round((asset.width * 2) / 3), Math.round((asset.height * 2) / 3)]));
        body.append(auto);
      }
    }
    if (one && st.value === 'Tile') {
      const t = one.props.TileSize || [1, 0, 1, 0];
      body.append(h('div', { class: 'lbl', style: { marginTop: '6px' } }, 'TileSize'), h('div', { class: 'grid2' },
        numInput({ label: 'W', value: t[1], step: 1, decimals: 0, title: 'TileSize X offset', onChange: (v, f) => this.set('TileSize', [0, v, t[2] && !t[3] ? 0 : t[2], t[3]], f) }),
        numInput({ label: 'H', value: t[3], step: 1, decimals: 0, title: 'TileSize Y offset', onChange: (v, f) => this.set('TileSize', [t[0] && !t[1] ? 0 : t[0], t[1], 0, v], f) })));
    }
    if (one) {
      const rs = one.props.ImageRectSize || [0, 0], ro = one.props.ImageRectOffset || [0, 0];
      body.append(h('div', { class: 'lbl', style: { marginTop: '6px' } }, 'ImageRectOffset / ImageRectSize (spritesheets)'), h('div', { class: 'grid2' },
        numInput({ label: 'OX', value: ro[0], step: 1, decimals: 0, onChange: (v, f) => this.set('ImageRectOffset', [v, ro[1]], f) }),
        numInput({ label: 'OY', value: ro[1], step: 1, decimals: 0, onChange: (v, f) => this.set('ImageRectOffset', [ro[0], v], f) }),
        numInput({ label: 'SW', value: rs[0], step: 1, decimals: 0, onChange: (v, f) => this.set('ImageRectSize', [v, rs[1]], f) }),
        numInput({ label: 'SH', value: rs[1], step: 1, decimals: 0, onChange: (v, f) => this.set('ImageRectSize', [rs[0], v], f) })));
      if (asset?.width) {
        const nat = h('button', { class: 'btn small ghost', style: { marginTop: '6px' } }, `Tamaño original (${asset.width}×${asset.height})`);
        nat.addEventListener('click', () => this.set('Size', [0, asset.width, 0, asset.height]));
        body.append(nat);
      }
    }
    if (nodes.every((n) => n.ClassName === 'ImageButton') && one) {
      body.append(field('HoverImage', textInput(one.props.HoverImage, (v) => this.set('HoverImage', v.trim()))), field('PressedImage', textInput(one.props.PressedImage, (v) => this.set('PressedImage', v.trim()))));
    }
    return this.section('image', 'Imagen', body);
  }

  // ---------- constraints ----------
  constraintsSection(n) {
    const kinds = [['UIAspectRatioConstraint', 'Proporción'], ['UISizeConstraint', 'Tamaño mín/máx'], ['UIScale', 'Escala'], ...(isText(n.ClassName) ? [['UITextSizeConstraint', 'Tamaño de texto']] : []), ['UIDragDetector', 'Arrastrable']];
    const body = h('div');
    const present = kinds.filter(([k]) => n.children.some((c) => c.ClassName === k));
    const missing = kinds.filter(([k]) => !n.children.some((c) => c.ClassName === k));
    for (const [k, lab] of present) {
      const m = n.children.find((c) => c.ClassName === k);
      const rm = h('button', { class: 'icon-btn', title: 'Quitar', html: icon('minus') });
      rm.addEventListener('click', () => this.cmd.removeNode(m.id));
      const card = h('div', { class: 'mod-card' }, h('div', { class: 'mod-hd' }, h('span', { class: 'nm' }, `${lab} · ${k}`), rm), this.modifierBody(m, true));
      if (k === 'UIAspectRatioConstraint') {
        const fromCur = h('button', { class: 'btn small ghost' }, 'Usar proporción actual');
        fromCur.addEventListener('click', () => {
          const b = this.cmd.boxOf(n.id);
          if (b) this.set('AspectRatio', round(b.w / Math.max(b.h, 1), 4), true, [m]);
        });
        card.append(fromCur);
      }
      body.append(card);
    }
    const actions = [];
    if (missing.length) {
      const add = h('button', { class: 'icon-btn', title: 'Añadir restricción', html: icon('plus') });
      add.addEventListener('click', () => menu(missing.map(([k, lab]) => ({ label: `${lab} (${k})`, action: () => this.cmd.addModifier(k, [n]) })), add));
      actions.push(add);
    }
    if (!present.length) body.append(h('div', { class: 'hint' }, 'Sin restricciones. Tip: UIAspectRatioConstraint mantiene la forma en móviles.'));
    return this.section('constraints', 'Restricciones y escala', body, { actions });
  }

  scrollSection(nodes) {
    const body = h('div');
    const one = nodes[0];
    const P = one.props;
    const cs = P.CanvasSize;
    body.append(h('div', { class: 'lbl' }, 'CanvasSize (Scale | Offset)'), h('div', { class: 'grid2' },
      numInput({ label: 'W', value: cs[0], step: 0.1, decimals: 3, onChange: (v, f) => this.set('CanvasSize', [v, cs[1], cs[2], cs[3]], f) }),
      numInput({ label: 'px', value: cs[1], step: 1, decimals: 0, onChange: (v, f) => this.set('CanvasSize', [cs[0], v, cs[2], cs[3]], f) }),
      numInput({ label: 'H', value: cs[2], step: 0.1, decimals: 3, onChange: (v, f) => this.set('CanvasSize', [cs[0], cs[1], v, cs[3]], f) }),
      numInput({ label: 'px', value: cs[3], step: 1, decimals: 0, onChange: (v, f) => this.set('CanvasSize', [cs[0], cs[1], cs[2], v], f) })));
    body.append(h('div', { class: 'grid2', style: { marginTop: '6px' } },
      h('div', {}, h('div', { class: 'lbl' }, 'AutomaticCanvasSize'), select(Object.keys(ENUMS.AutomaticSize), P.AutomaticCanvasSize, (v) => this.set('AutomaticCanvasSize', v))),
      h('div', {}, h('div', { class: 'lbl' }, 'ScrollingDirection'), select(Object.keys(ENUMS.ScrollingDirection), P.ScrollingDirection, (v) => this.set('ScrollingDirection', v)))));
    body.append(h('div', { class: 'lbl', style: { marginTop: '6px' } }, 'Barra de scroll'), h('div', { class: 'field' }, colorField({ color: P.ScrollBarImageColor3, transparency: P.ScrollBarImageTransparency, onChange: (c, t, f) => {
      this.set('ScrollBarImageColor3', c, false);
      this.set('ScrollBarImageTransparency', t, f);
    } })), numInput({ label: 'Grosor', value: P.ScrollBarThickness, step: 1, decimals: 0, min: 0, onChange: (v, f) => this.set('ScrollBarThickness', v, f) }));
    return this.section('scroll', 'ScrollingFrame', body);
  }

  canvasGroupSection(nodes) {
    const P = nodes[0].props;
    return this.section('cgroup', 'CanvasGroup', h('div', {}, h('div', { class: 'field' }, colorField({ color: P.GroupColor3, transparency: P.GroupTransparency, onChange: (c, t, f) => {
      this.set('GroupColor3', c, false);
      this.set('GroupTransparency', t, f);
    } })), h('div', { class: 'hint' }, 'GroupTransparency hace transparente el grupo entero (ideal para animar la apertura de ventanas).')));
  }

  behaviorSection(nodes) {
    const body = h('div', { class: 'grid2' });
    const flag = (k, tip) => {
      const c = this.common(k, nodes);
      if (c.value === undefined) return null;
      return checkbox(k, c.value, (v) => this.set(k, v), tip);
    };
    body.append(...[
      flag('Visible', 'Si está en false, el objeto empieza oculto en el juego'),
      flag('ClipsDescendants', 'Recorta a los hijos que se salgan'),
      flag('Active', 'Bloquea los clics hacia lo que hay detrás'),
      flag('AutoButtonColor', 'Oscurece el botón al pasar/pulsar (Roblox)'),
      flag('Modal', 'Libera el ratón en primera persona'),
      flag('Selectable', 'Navegable con mando'),
      flag('ClearTextOnFocus'), flag('MultiLine'), flag('TextEditable'),
    ].filter(Boolean));
    return this.section('behavior', 'Comportamiento', body);
  }

  // ---------- generic ----------
  propEditor(node, prop, def, value) {
    const set = (v, f = true) => this.set(prop, v, f, [node]);
    switch (def.type) {
      case 'Bool': return checkbox('', value, (v) => set(v));
      case 'Int32': return numInput({ value, step: 1, decimals: 0, onChange: (v, f) => set(v, f) });
      case 'Float32': case 'Float64': return numInput({ value, step: 0.05, decimals: 4, onChange: (v, f) => set(v, f) });
      case 'String': case 'ContentId': return textInput(value, (v) => set(v));
      case 'Color3': return colorField({ color: value, swatches: this.store.doc.swatches, onChange: (c, t, f) => set(c, f) });
      case 'Enum': return select(Object.keys(ENUMS[def.enum] || {}), value, (v) => set(v));
      case 'UDim': return h('div', { class: 'grid2' }, numInput({ label: 'S', value: value[0], step: 0.01, decimals: 4, onChange: (v, f) => set([v, value[1]], f) }), numInput({ label: 'O', value: value[1], step: 1, decimals: 0, onChange: (v, f) => set([value[0], v], f) }));
      case 'Vector2': return h('div', { class: 'grid2' }, numInput({ label: 'X', value: value[0], step: 0.05, decimals: 4, onChange: (v, f) => set([v, value[1]], f) }), numInput({ label: 'Y', value: value[1], step: 0.05, decimals: 4, onChange: (v, f) => set([value[0], v], f) }));
      case 'UDim2': case 'Rect': return h('div', { class: 'grid2' }, ...value.map((x, i) => numInput({ label: def.type === 'Rect' ? ['X0', 'Y0', 'X1', 'Y1'][i] : ['XS', 'XO', 'YS', 'YO'][i], value: x, step: i % 2 && def.type === 'UDim2' ? 1 : 0.01, decimals: 4, onChange: (v, f) => set(value.map((y, j) => (j === i ? v : y)), f) })));
      case 'Font': return h('span', { class: 'hint' }, `${value.family} ${value.weight}`);
      case 'ColorSequence': case 'NumberSequence': return h('span', { class: 'hint' }, `${value.length} puntos`);
      default: return h('span', { class: 'hint' }, JSON.stringify(value));
    }
  }

  modifierBody(m, compact = false) {
    const table = h('table', { class: 'props-table' });
    const defs = getProps(m.ClassName);
    for (const p of editableProps(m.ClassName)) {
      if (p === 'Name' || !(p in m.props)) continue;
      if (m.ClassName === 'UIGradient' && (p === 'Color' || p === 'Transparency')) continue;
      table.append(h('tr', {}, h('td', { title: p }, p), h('td', {}, this.propEditor(m, p, defs[p], m.props[p]))));
    }
    if (m.ClassName === 'UIGradient' && !compact) {
      const owner = this.store.parentOf(m.id);
      return h('div', {}, this.gradientEditor(m, owner || m));
    }
    return table;
  }

  allPropsSection(n) {
    const table = h('table', { class: 'props-table' });
    const defs = getProps(n.ClassName);
    for (const p of editableProps(n.ClassName)) {
      if (p === 'Name' || !(p in n.props)) continue;
      table.append(h('tr', {}, h('td', { title: p }, p), h('td', {}, this.propEditor(n, p, defs[p], n.props[p]))));
    }
    return this.section('all', 'Todas las propiedades (Roblox)', h('div', {}, h('div', { class: 'hint', style: { marginBottom: '6px' } }, 'Lista completa, igual que la ventana Properties de Studio.'), table));
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(clamp(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt, 0, 255));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export { shade, rgba };
