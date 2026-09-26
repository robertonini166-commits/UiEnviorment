// Shared export helpers: which properties to write, asset resolution, name sanitizing.

import { getProps, editableProps, isGuiObject, ENUMS, CLASSES } from '../core/schema.js';
import { deepEqual } from '../core/types.js';

// Properties introduced by recent/beta Roblox features. Written only when they differ from
// Roblox defaults (and guarded with pcall in Luau) so exports keep working in any Studio.
export const OPTIONAL_PROPS = {
  UICorner: ['TopLeftRadius', 'TopRightRadius', 'BottomRightRadius', 'BottomLeftRadius'],
  UIStroke: ['BorderOffset', 'BorderStrokePosition', 'StrokeSizingMode', 'ZIndex'],
  UIGradient: ['Type', 'Scale', 'TileMode'],
};

const NEVER_EXPORT = new Set(['Interactable', 'Selectable', 'SelectionOrder', 'AutoLocalize', 'InputSink']);

export function robloxDefault(className, prop) {
  let c = className;
  while (c && CLASSES[c]) {
    if (CLASSES[c].defaults && prop in CLASSES[c].defaults) return CLASSES[c].defaults[prop];
    c = CLASSES[c].superclass;
  }
  return undefined;
}

/** Ordered list of [prop, value, def, optional] to export for a node. */
export function exportProps(node) {
  const defs = getProps(node.ClassName);
  const out = [];
  const optional = new Set(OPTIONAL_PROPS[node.ClassName] || []);
  for (const p of editableProps(node.ClassName)) {
    if (p === 'Name' || NEVER_EXPORT.has(p)) continue;
    if (!(p in node.props)) continue;
    const v = node.props[p];
    const def = defs[p];
    if (!def) continue;
    const opt = optional.has(p);
    if (opt) {
      if (node.ClassName === 'UICorner') {
        if (deepEqual(v, node.props.CornerRadius)) continue;
      } else if (deepEqual(v, robloxDefault(node.ClassName, p))) continue;
    }
    out.push([p, v, def, opt]);
  }
  // CornerRadius must be written before the individual radii (it overwrites them)
  out.sort((a, b) => (a[0] === 'CornerRadius' ? -1 : b[0] === 'CornerRadius' ? 1 : 0));
  return out;
}

export function enumValue(enumName, item) {
  return ENUMS[enumName]?.[item] ?? 0;
}

export function fontAsset(id) {
  return `rbxasset://fonts/families/${id}.json`;
}

/** Resolves ContentId values for export; collects missing uploads. */
export function makeContentResolver(doc, report) {
  return (v, node, prop) => {
    const s = String(v || '');
    if (!s) return '';
    if (s.startsWith('asset:')) {
      const a = doc.assets?.[s.slice(6)];
      const rid = a && String(a.rbxId || '').replace(/\D/g, '');
      if (rid) return `rbxassetid://${rid}`;
      report.missingAssets.set(s.slice(6), { name: a?.name || s.slice(6), where: [...(report.missingAssets.get(s.slice(6))?.where || []), `${node.Name}.${prop}`] });
      return '';
    }
    if (/^\d+$/.test(s)) return `rbxassetid://${s}`;
    if (/^(rbxassetid|rbxasset|rbxthumb|http):/.test(s)) return s;
    report.warnings.push(`${node.Name}.${prop}: URL de imagen no válida para Roblox (${s.slice(0, 40)})`);
    return '';
  };
}

export function newReport() {
  return { warnings: [], missingAssets: new Map(), count: 0 };
}

/** Nodes to export (skips editor-only data). */
export function exportChildren(node) {
  return node.children.filter((c) => c.ClassName !== undefined);
}

export { isGuiObject };
