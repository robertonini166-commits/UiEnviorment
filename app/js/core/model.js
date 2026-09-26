// RbxUI document model. A document is a set of "screens" (ScreenGui instance trees)
// whose nodes use Roblox class names and property names 1:1.
//
// Node = { id, ClassName, Name, props: {...}, children: [Node], editor?: {...}, interactions?: [...] }
//   editor: { locked, hidden, collapsed, componentId, isComponent }  (never exported)
// Screen root = ScreenGui node + design: { x, y, width, height, device }

import { defaultsFor, getProps, normValue, SUPPORTED, isGuiObject, validateValue, canParent, applyShorthands } from './schema.js';
import { newId, deepClone } from './types.js';

export const FORMAT = 'rbxui';
export const FORMAT_VERSION = 1;

export const DEVICES = {
  desktop: { label: 'PC 1920×1080', width: 1920, height: 1080 },
  laptop: { label: 'Portátil 1366×768', width: 1366, height: 768 },
  studio: { label: 'Studio 1280×720', width: 1280, height: 720 },
  tablet: { label: 'Tablet 1024×768', width: 1024, height: 768 },
  phone: { label: 'Móvil 844×390 (con notch)', width: 844, height: 390, safe: { l: 47, r: 47, t: 0, b: 21 } },
  phoneSmall: { label: 'Móvil pequeño 667×375', width: 667, height: 375 },
  console: { label: 'Consola 1920×1080', width: 1920, height: 1080 },
};

const EDITOR_KEYS = (cls) => (cls === 'UICorner' ? { CornerRadius: 1 } : {});

export function createNode(ClassName, props = {}, children = [], extra = {}) {
  if (!SUPPORTED.has(ClassName)) throw new Error(`Unsupported class ${ClassName}`);
  const base = defaultsFor(ClassName);
  const defs = getProps(ClassName);
  const node = { id: newId(), ClassName, Name: props.Name || extra.Name || ClassName, props: {}, children: [] };
  for (const [k, v] of Object.entries(base)) if (defs[k] && k !== 'Name') node.props[k] = v;
  for (const [k, v] of Object.entries(props)) {
    if (k === 'Name') continue;
    if (defs[k]) node.props[k] = normValue(defs[k], v);
  }
  applyShorthands(ClassName, node.props, Object.keys(Object.assign({}, EDITOR_KEYS(ClassName), props)));
  for (const c of children) node.children.push(c);
  Object.assign(node, extra);
  if (extra.Name) node.Name = extra.Name;
  return node;
}

export function createScreen(name = 'Screen', device = 'studio', x = 0, y = 0) {
  const d = DEVICES[device] || DEVICES.studio;
  const s = createNode('ScreenGui', {}, [], { Name: name });
  s.design = { x, y, width: d.width, height: d.height, device, background: '#3A6EA5' };
  if (d.safe) s.design.safe = { ...d.safe };
  return s;
}

export function createDocument(name = 'Sin título') {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    name,
    screens: [createScreen('MainUI', 'studio', 0, 0)],
    assets: {},
    components: {},
    swatches: ['#FFFFFF', '#1E1F24', '#31333B', '#FF4B4B', '#FF9F1C', '#FFD93D', '#6BCB3B', '#2EC4B6', '#3A86FF', '#8338EC', '#FF4FA3'],
    settings: { robloxTextMetrics: true },
  };
}

// ---------- traversal ----------
export function walk(node, fn, parent = null, depth = 0) {
  if (fn(node, parent, depth) === false) return false;
  for (const c of node.children) if (walk(c, fn, node, depth + 1) === false) return false;
  return true;
}

export function allRoots(doc) {
  return doc.screens;
}

/** Builds id -> {node, parent, screen} index for a document. */
export function indexDoc(doc) {
  const map = new Map();
  for (const root of allRoots(doc)) {
    walk(root, (n, p) => {
      map.set(n.id, { node: n, parent: p, screen: root });
    });
  }
  return map;
}

export function findNode(doc, id) {
  let found = null;
  for (const root of allRoots(doc)) {
    walk(root, (n, p) => {
      if (n.id === id) {
        found = { node: n, parent: p, screen: root };
        return false;
      }
    });
    if (found) break;
  }
  return found;
}

export function pathOf(doc, id) {
  const idx = indexDoc(doc);
  const out = [];
  let cur = idx.get(id);
  while (cur) {
    out.unshift(cur.node);
    cur = cur.parent ? idx.get(cur.parent.id) : null;
  }
  return out;
}

/** Deep clone with fresh ids (keeps a map old->new id for remapping interactions). */
export function cloneWithNewIds(node, idMap = new Map()) {
  const c = deepClone(node);
  walk(c, (n) => {
    const nid = newId();
    idMap.set(n.id, nid);
    n.id = nid;
  });
  walk(c, (n) => {
    if (n.interactions) for (const it of n.interactions) if (it.target && idMap.has(it.target)) it.target = idMap.get(it.target);
  });
  return c;
}

export function removeNode(doc, id) {
  const f = findNode(doc, id);
  if (!f || !f.parent) return null;
  const i = f.parent.children.indexOf(f.node);
  f.parent.children.splice(i, 1);
  return { node: f.node, parent: f.parent, index: i };
}

export function insertNode(parent, node, index = parent.children.length) {
  if (!canParent(node.ClassName, parent.ClassName)) throw new Error(`${node.ClassName} no puede ir dentro de ${parent.ClassName}`);
  parent.children.splice(Math.max(0, Math.min(index, parent.children.length)), 0, node);
  return node;
}

export function isAncestor(doc, ancestorId, id) {
  const p = pathOf(doc, id);
  return p.some((n) => n.id === ancestorId && n.id !== id);
}

export const guiChildren = (node) => node.children.filter((c) => isGuiObject(c.ClassName) || c.ClassName === 'Folder');
export const modifiers = (node, cls) => node.children.filter((c) => (cls ? c.ClassName === cls : !isGuiObject(c.ClassName) && c.ClassName !== 'Folder'));
export const modifier = (node, cls) => node.children.find((c) => c.ClassName === cls);

/** Unique sibling name helper (Roblox allows duplicates, but scripts rely on names). */
export function uniqueName(parent, base) {
  const names = new Set(parent.children.map((c) => c.Name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(base + i)) i++;
  return base + i;
}

// ---------- import / validation ----------
/**
 * Normalizes a document coming from JSON (hand-written by a person or Claude).
 * Accepts shorthand: missing ids, `children` omitted, Name at top-level or inside props,
 * colors as [r,g,b], legacy Enum.Font strings, etc. Returns { doc, warnings }.
 */
export function normalizeDocument(input) {
  const warnings = [];
  const src = typeof input === 'string' ? JSON.parse(input) : deepClone(input);
  const doc = createDocument(src.name || 'Sin título');
  doc.assets = src.assets || {};
  doc.components = {};
  if (src.swatches) doc.swatches = src.swatches;
  if (src.styles) doc.styles = src.styles;
  if (src.settings) Object.assign(doc.settings, src.settings);
  const seen = new Set();

  const normNode = (raw, path) => {
    const ClassName = raw.ClassName || raw.class || raw.className;
    if (!SUPPORTED.has(ClassName)) {
      warnings.push(`${path}: clase no soportada "${ClassName}" (omitida)`);
      return null;
    }
    const defs = getProps(ClassName);
    const props = {};
    const rawProps = Object.assign({}, raw.props || {});
    // allow Roblox props at node top-level too
    for (const [k, v] of Object.entries(raw)) if (defs[k] && k !== 'Name' && !(k in rawProps)) rawProps[k] = v;
    const base = defaultsFor(ClassName);
    for (const [k, v] of Object.entries(base)) if (defs[k] && k !== 'Name') props[k] = v;
    for (const [k, v] of Object.entries(rawProps)) {
      if (k === 'Name') continue;
      if (!defs[k]) {
        warnings.push(`${path}: propiedad desconocida ${ClassName}.${k} (omitida)`);
        continue;
      }
      const nv = normValue(defs[k], v);
      const err = validateValue(defs[k], nv);
      if (err) warnings.push(`${path}.${k}: ${err}`);
      props[k] = nv;
    }
    applyShorthands(ClassName, props, Object.keys(rawProps).concat(Object.keys(defaultsFor(ClassName)).filter((k) => k === 'CornerRadius' && !('TopLeftRadius' in rawProps))));
    let id = raw.id && !seen.has(raw.id) ? raw.id : newId();
    seen.add(id);
    const node = { id, ClassName, Name: String(raw.Name || rawProps.Name || ClassName), props, children: [] };
    if (raw.editor) node.editor = raw.editor;
    if (raw.interactions) node.interactions = raw.interactions;
    if (raw.buttonFx) node.buttonFx = raw.buttonFx;
    if (raw.design) node.design = raw.design;
    (raw.children || []).forEach((c, i) => {
      const n = normNode(c, `${path}/${c.Name || c.ClassName || i}`);
      if (!n) return;
      if (!canParent(n.ClassName, ClassName)) {
        warnings.push(`${path}: ${n.ClassName} no puede ser hijo de ${ClassName} (omitido)`);
        return;
      }
      node.children.push(n);
    });
    return node;
  };

  const screens = src.screens || (src.ClassName ? [src] : []);
  doc.screens = [];
  let x = 0;
  for (const s of screens) {
    let raw = s;
    if (raw.ClassName !== 'ScreenGui') {
      raw = { ClassName: 'ScreenGui', Name: s.Name || 'Screen', children: [s], design: s.design };
    }
    const n = normNode(raw, raw.Name || 'Screen');
    if (!n) continue;
    const dev = DEVICES[n.design?.device] || DEVICES.studio;
    n.design = Object.assign({ x, y: 0, width: dev.width, height: dev.height, device: n.design?.device || 'studio', background: '#3A6EA5' }, raw.design || {});
    x = n.design.x + n.design.width + 200;
    resolveInteractionTargets(n, warnings);
    doc.screens.push(n);
  }
  if (!doc.screens.length) doc.screens.push(createScreen());
  // components: masters live on the "Componentes" screen; entries point to them by id
  for (const [id, comp] of Object.entries(src.components || {})) {
    if (comp && comp.masterId) doc.components[id] = { id, name: comp.name || id, masterId: comp.masterId, snapshot: comp.snapshot || null };
  }
  return { doc, warnings };
}

/**
 * Interactions may reference targets by id, by Name ("ShopWindow") or by path
 * ("ShopWindow/Header/CloseButton"); resolve names/paths to ids.
 */
export function resolveInteractionTargets(screen, warnings = []) {
  const ids = new Set();
  const byName = new Map();
  const byPath = new Map();
  const visit = (n, path) => {
    ids.add(n.id);
    if (!byName.has(n.Name)) byName.set(n.Name, n.id);
    byPath.set(path, n.id);
    for (const c of n.children) visit(c, path ? path + '/' + c.Name : c.Name);
  };
  for (const c of screen.children) visit(c, c.Name);
  walk(screen, (n) => {
    for (const it of n.interactions || []) {
      const ref = it.targetName ?? it.target;
      delete it.targetName;
      if (!ref || ids.has(ref)) continue;
      const id = byPath.get(ref) || byName.get(ref) || byName.get(String(ref).split('/').pop());
      if (id) it.target = id;
      else {
        warnings.push(`${n.Name}: destino de interacción "${ref}" no encontrado`);
        it.target = null;
      }
    }
  });
}

export function serializeDocument(doc) {
  return JSON.stringify(doc, null, 1);
}

/** Minimal JSON: strips props equal to editor defaults (handy for Claude to read). */
export function compactNode(node) {
  const base = defaultsFor(node.ClassName);
  const props = {};
  for (const [k, v] of Object.entries(node.props)) if (JSON.stringify(base[k]) !== JSON.stringify(v)) props[k] = v;
  const out = { ClassName: node.ClassName, Name: node.Name };
  if (Object.keys(props).length) out.props = props;
  if (node.interactions?.length) out.interactions = node.interactions;
  if (node.buttonFx) out.buttonFx = node.buttonFx;
  if (node.children.length) out.children = node.children.map(compactNode);
  return out;
}
