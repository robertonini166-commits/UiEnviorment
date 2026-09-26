// Class / property schema for the Roblox UI instances RbxUI can create.
// Types and enums come from the generated rbx-api.js (rbx-dom reflection database);
// this file adds editor-level knowledge: which classes the editor supports, sensible
// "inserted in Studio"-style defaults and value normalization/validation.

import { CLASSES, ENUMS } from './rbx-api.js';
import { normColor, normSequence, clamp, deepClone } from './types.js';
import { FONT_FAMILIES } from './fonts-data.js';

export { CLASSES, ENUMS };

export const GUI_OBJECTS = ['Frame', 'TextLabel', 'TextButton', 'TextBox', 'ImageLabel', 'ImageButton', 'ScrollingFrame', 'CanvasGroup', 'ViewportFrame', 'VideoFrame'];
export const MODIFIERS = ['UICorner', 'UIStroke', 'UIGradient', 'UIPadding', 'UIScale', 'UIShadow', 'UIAspectRatioConstraint', 'UISizeConstraint', 'UITextSizeConstraint', 'UIListLayout', 'UIGridLayout', 'UIPageLayout', 'UIFlexItem', 'UIDragDetector'];
export const LAYOUTS = ['UIListLayout', 'UIGridLayout', 'UIPageLayout'];
export const TEXT_CLASSES = ['TextLabel', 'TextButton', 'TextBox'];
export const IMAGE_CLASSES = ['ImageLabel', 'ImageButton'];
export const BUTTON_CLASSES = ['TextButton', 'ImageButton'];
export const SUPPORTED = new Set(['ScreenGui', 'Folder', ...GUI_OBJECTS, ...MODIFIERS]);

export const isGuiObject = (c) => GUI_OBJECTS.includes(c);
export const isModifier = (c) => MODIFIERS.includes(c);
export const isLayout = (c) => LAYOUTS.includes(c);
export const isText = (c) => TEXT_CLASSES.includes(c);
export const isImage = (c) => IMAGE_CLASSES.includes(c);
export const isButton = (c) => BUTTON_CLASSES.includes(c);
export const isContainerLike = (c) => c === 'ScreenGui' || c === 'Folder' || isGuiObject(c);

// Which parents a modifier may live under (Roblox accepts them anywhere, but they only do
// something on specific parents; the editor enforces meaningful placement).
export function canParent(childClass, parentClass) {
  if (childClass === 'ScreenGui') return false;
  if (parentClass === 'UIStroke') return childClass === 'UIGradient';
  if (isModifier(parentClass)) return false;
  if (childClass === 'UIGradient') return isGuiObject(parentClass) && parentClass !== 'ScrollingFrame' && parentClass !== 'TextBox' || parentClass === 'UIStroke';
  if (childClass === 'UICorner') return isGuiObject(parentClass) && parentClass !== 'ScrollingFrame';
  if (childClass === 'UITextSizeConstraint') return isText(parentClass);
  if (childClass === 'UIFlexItem' || childClass === 'UIStroke' || childClass === 'UIShadow' || childClass === 'UIScale' ||
      childClass === 'UIAspectRatioConstraint' || childClass === 'UISizeConstraint' || childClass === 'UIDragDetector') return isGuiObject(parentClass);
  if (childClass === 'UIPadding' || isLayout(childClass)) return isContainerLike(parentClass);
  return isContainerLike(parentClass);
}

/** Merged property definitions (own + inherited) for a class. */
const propCache = new Map();
export function getProps(className) {
  if (propCache.has(className)) return propCache.get(className);
  const out = {};
  let c = className;
  const chain = [];
  while (c && CLASSES[c]) {
    chain.unshift(c);
    c = CLASSES[c].superclass;
  }
  for (const k of chain) Object.assign(out, CLASSES[k].props);
  out.Name = { type: 'String' };
  propCache.set(className, out);
  return out;
}

export function getPropDef(className, prop) {
  return getProps(className)[prop];
}

/** Instance.new() defaults straight from Roblox. */
export function robloxDefaults(className) {
  return deepClone(CLASSES[className]?.defaults || {});
}

const MONT_BOLD = { family: 'Montserrat', weight: 'Bold', style: 'Normal' };

// Defaults used when the editor inserts an object (mirrors Studio's insert defaults
// but with modern, game-ready values). Exporters always write every property
// explicitly, so these never depend on Roblox's own defaults.
export const EDITOR_DEFAULTS = {
  ScreenGui: { ResetOnSpawn: false, ZIndexBehavior: 'Sibling', IgnoreGuiInset: false, Enabled: true, DisplayOrder: 0, ScreenInsets: 'CoreUISafeInsets', ClipToDeviceSafeArea: true },
  Frame: { Size: [0, 200, 0, 120], BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, BorderColor3: '#000000' },
  CanvasGroup: { Size: [0, 200, 0, 120], BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, BorderColor3: '#000000', GroupTransparency: 0, GroupColor3: '#FFFFFF' },
  ScrollingFrame: { Size: [0, 240, 0, 200], BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, BorderColor3: '#000000', CanvasSize: [0, 0, 2, 0], ScrollBarThickness: 8, ScrollBarImageColor3: '#000000', ScrollBarImageTransparency: 0.5, ScrollingDirection: 'XY', AutomaticCanvasSize: 'None', Active: true },
  TextLabel: { Size: [0, 200, 0, 50], BackgroundColor3: '#FFFFFF', BackgroundTransparency: 1, BorderSizePixel: 0, BorderColor3: '#000000', Text: 'Texto', FontFace: MONT_BOLD, TextSize: 24, TextColor3: '#FFFFFF', TextXAlignment: 'Center', TextYAlignment: 'Center' },
  TextButton: { Size: [0, 180, 0, 56], BackgroundColor3: '#5EDB4B', BorderSizePixel: 0, BorderColor3: '#000000', Text: 'Botón', FontFace: MONT_BOLD, TextSize: 24, TextColor3: '#FFFFFF', AutoButtonColor: false },
  TextBox: { Size: [0, 220, 0, 44], BackgroundColor3: '#FFFFFF', BorderSizePixel: 0, BorderColor3: '#000000', Text: '', PlaceholderText: 'Escribe aquí…', PlaceholderColor3: '#8A8A8A', FontFace: { family: 'Montserrat', weight: 'Medium', style: 'Normal' }, TextSize: 20, TextColor3: '#1E1E1E', ClearTextOnFocus: false },
  ImageLabel: { Size: [0, 100, 0, 100], BackgroundColor3: '#FFFFFF', BackgroundTransparency: 1, BorderSizePixel: 0, BorderColor3: '#000000', Image: '', ScaleType: 'Fit' },
  ImageButton: { Size: [0, 100, 0, 100], BackgroundColor3: '#FFFFFF', BackgroundTransparency: 1, BorderSizePixel: 0, BorderColor3: '#000000', Image: '', ScaleType: 'Fit', AutoButtonColor: false },
  ViewportFrame: { Size: [0, 160, 0, 160], BackgroundColor3: '#FFFFFF', BackgroundTransparency: 1, BorderSizePixel: 0 },
  VideoFrame: { Size: [0, 320, 0, 180], BackgroundColor3: '#000000', BorderSizePixel: 0 },
  UICorner: { CornerRadius: [0, 8] },
  UIStroke: { Thickness: 2, Color: '#000000', ApplyStrokeMode: 'Contextual', LineJoinMode: 'Round' },
  UIGradient: { Color: [[0, '#FFFFFF'], [1, '#FFFFFF']], Transparency: [[0, 0], [1, 0]], Rotation: 90 },
  UIPadding: { PaddingTop: [0, 8], PaddingBottom: [0, 8], PaddingLeft: [0, 8], PaddingRight: [0, 8] },
  UIListLayout: { SortOrder: 'LayoutOrder', Padding: [0, 8], FillDirection: 'Vertical', HorizontalAlignment: 'Left', VerticalAlignment: 'Top' },
  UIGridLayout: { SortOrder: 'LayoutOrder', CellSize: [0, 100, 0, 100], CellPadding: [0, 8, 0, 8] },
  UIPageLayout: { SortOrder: 'LayoutOrder' },
  UIShadow: { Color: '#000000', Transparency: 0.6, BlurRadius: [0, 12], Offset: [0, 0, 0, 4], Spread: [0, 0, 0, 0], ZIndex: -1 },
};

// Properties shown/edited/exported per class (in the order the "All properties"
// inspector lists them). Everything else is left at Roblox defaults.
export function editableProps(className) {
  const defs = getProps(className);
  const hidden = new Set(['AutoLocalize', 'InputSink', 'SelectionBehaviorDown', 'SelectionBehaviorLeft', 'SelectionBehaviorRight', 'SelectionBehaviorUp',
    'SelectionGroup', 'SelectionOrder', 'MaxVisibleGraphemes', 'TextDirection', 'HoverHapticEffect', 'PressHapticEffect', 'SafeAreaCompatibility']);
  return Object.keys(defs).filter((p) => !hidden.has(p));
}

export function defaultsFor(className) {
  return Object.assign(robloxDefaults(className), deepClone(EDITOR_DEFAULTS[className] || {}));
}

// ---------- Fonts ----------
export const FONT_BY_ID = Object.fromEntries(FONT_FAMILIES.map((f) => [f.id, f]));
const FONT_BY_NAME = Object.fromEntries(FONT_FAMILIES.map((f) => [f.name.toLowerCase().replace(/\s+/g, ''), f]));
const LEGACY_FONT_MAP = { GothamSSm: 'Montserrat', Gotham: 'Montserrat', LegacyArial: 'Arimo', Arial: 'Arimo', SourceSans: 'SourceSansPro' };

/** Resolve any family spelling ("Montserrat", "rbxasset://fonts/families/Montserrat.json", "Fredoka One") to a family id. */
export function resolveFontFamily(family) {
  let s = String(family || '').trim();
  const m = s.match(/families\/([^/]+?)\.json$/i);
  if (m) s = m[1];
  if (FONT_BY_ID[s]) return s;
  if (LEGACY_FONT_MAP[s]) return LEGACY_FONT_MAP[s];
  const k = s.toLowerCase().replace(/\s+/g, '');
  if (FONT_BY_NAME[k]) return FONT_BY_NAME[k].id;
  const byId = FONT_FAMILIES.find((f) => f.id.toLowerCase() === k);
  return byId ? byId.id : null;
}

export const WEIGHTS = ENUMS.FontWeight; // { Thin: 100, ... Heavy: 900 }
export const weightName = (w) => (typeof w === 'number' ? Object.keys(WEIGHTS).find((k) => WEIGHTS[k] === w) || 'Regular' : WEIGHTS[w] ? w : 'Regular');

// Enum.Font (legacy) -> Font datatype, for importing old JSON.
const ENUM_FONT = {
  SourceSans: ['SourceSansPro', 'Regular'], SourceSansBold: ['SourceSansPro', 'Bold'], SourceSansSemibold: ['SourceSansPro', 'SemiBold'],
  SourceSansLight: ['SourceSansPro', 'Light'], SourceSansItalic: ['SourceSansPro', 'Regular', 'Italic'], Bodoni: ['AccanthisADFStd', 'Regular'],
  Garamond: ['Guru', 'Regular'], Cartoon: ['ComicNeueAngular', 'Regular'], Code: ['Inconsolata', 'Regular'], Highway: ['HighwayGothic', 'Regular'],
  SciFi: ['Zekton', 'Regular'], Arcade: ['PressStart2P', 'Regular'], Fantasy: ['Balthazar', 'Regular'], Antique: ['RomanAntique', 'Regular'],
  Gotham: ['Montserrat', 'Regular'], GothamMedium: ['Montserrat', 'Medium'], GothamBold: ['Montserrat', 'Bold'], GothamBlack: ['Montserrat', 'Heavy'],
  Arial: ['Arimo', 'Regular'], ArialBold: ['Arimo', 'Bold'], Legacy: ['Arimo', 'Regular'], BuilderSans: ['BuilderSans', 'Regular'],
  BuilderSansMedium: ['BuilderSans', 'Medium'], BuilderSansBold: ['BuilderSans', 'Bold'], BuilderSansExtraBold: ['BuilderSans', 'ExtraBold'],
  ArimoBold: ['Arimo', 'Bold'], FredokaOne: ['FredokaOne', 'Regular'], LuckiestGuy: ['LuckiestGuy', 'Regular'],
};

export function normFont(v) {
  if (typeof v === 'string') {
    if (ENUM_FONT[v]) {
      const [family, weight, style = 'Normal'] = ENUM_FONT[v];
      return { family, weight, style };
    }
    return { family: resolveFontFamily(v) || 'Montserrat', weight: 'Regular', style: 'Normal' };
  }
  const o = v || {};
  return {
    family: resolveFontFamily(o.family ?? o.Family) || 'Montserrat',
    weight: weightName(o.weight ?? o.Weight ?? 'Regular'),
    style: /italic/i.test(o.style ?? o.Style ?? '') ? 'Italic' : 'Normal',
  };
}

// ---------- Value normalization ----------
function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function arr(v, n, d = 0) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    // accept {X:{Scale,Offset},Y:{...}} / {x,y} / {Scale,Offset} / {Min,Max} object spellings
    if ('X' in v && typeof v.X === 'object') v = [v.X.Scale, v.X.Offset, v.Y.Scale, v.Y.Offset];
    else if ('Scale' in v || 'scale' in v) v = [v.Scale ?? v.scale, v.Offset ?? v.offset];
    else if ('x' in v || 'X' in v) v = [v.x ?? v.X, v.y ?? v.Y];
  }
  const a = Array.isArray(v) ? v : [];
  return Array.from({ length: n }, (_, i) => num(a[i], d));
}

/** Coerce a JSON value into the canonical representation for the given property type. */
export function normValue(def, v) {
  if (!def) return v;
  switch (def.type) {
    case 'Bool': return v === true || v === 'true' || v === 1;
    case 'Int32': return Math.round(num(v));
    case 'Float32': case 'Float64': return num(v);
    case 'String': return v == null ? '' : String(v);
    case 'Color3': return normColor(v);
    case 'UDim': return arr(v, 2);
    case 'UDim2': return arr(v, 4);
    case 'Vector2': return arr(v, 2);
    case 'Rect': return arr(v, 4);
    case 'ColorSequence':
      if (typeof v === 'string') return [[0, normColor(v)], [1, normColor(v)]];
      return normSequence(v, true);
    case 'NumberSequence':
      if (typeof v === 'number') return [[0, v], [1, v]];
      return normSequence(v, false).map(([t, x]) => [t, clamp(x, 0, 1)]);
    case 'Font': return normFont(v);
    case 'ContentId': return v == null ? '' : String(v);
    case 'Enum': {
      const items = ENUMS[def.enum] || {};
      if (typeof v === 'number') return Object.keys(items).find((k) => items[k] === v) ?? Object.keys(items)[0];
      const s = String(v ?? '').replace(/^Enum\.[A-Za-z]+\./, '');
      if (s in items) return s;
      const ci = Object.keys(items).find((k) => k.toLowerCase() === s.toLowerCase());
      return ci ?? Object.keys(items)[0];
    }
    default: return v;
  }
}

/** Validates a value; returns an error string or null. */
export function validateValue(def, v) {
  if (!def) return 'unknown property';
  switch (def.type) {
    case 'Bool': return typeof v === 'boolean' ? null : 'expected boolean';
    case 'Int32': case 'Float32': case 'Float64': return Number.isFinite(v) ? null : 'expected number';
    case 'String': case 'ContentId': return typeof v === 'string' ? null : 'expected string';
    case 'Color3': return /^#[0-9A-F]{6}$/i.test(v) ? null : 'expected "#RRGGBB"';
    case 'UDim': case 'Vector2': return Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? null : 'expected [a, b]';
    case 'UDim2': case 'Rect': return Array.isArray(v) && v.length === 4 && v.every(Number.isFinite) ? null : 'expected [a, b, c, d]';
    case 'Enum': return ENUMS[def.enum] && v in ENUMS[def.enum] ? null : `expected Enum.${def.enum} item name`;
    case 'Font': return v && FONT_BY_ID[v.family] && WEIGHTS[v.weight] && (v.style === 'Normal' || v.style === 'Italic') ? null : 'invalid Font (family must be an official Roblox family)';
    case 'ColorSequence': case 'NumberSequence': return Array.isArray(v) && v.length >= 2 ? null : 'expected sequence with >= 2 keypoints';
    default: return null;
  }
}

/**
 * Roblox shorthands: writing UICorner.CornerRadius sets the four individual radii.
 * Call with the keys that were explicitly written.
 */
export function applyShorthands(className, props, writtenKeys) {
  if (className === 'UICorner' && writtenKeys.includes('CornerRadius')) {
    for (const k of ['TopLeftRadius', 'TopRightRadius', 'BottomRightRadius', 'BottomLeftRadius']) {
      if (!writtenKeys.includes(k)) props[k] = [...props.CornerRadius];
    }
  }
  if (className === 'UICorner' && !writtenKeys.includes('CornerRadius') && writtenKeys.includes('TopLeftRadius')) {
    props.CornerRadius = [...props.TopLeftRadius];
  }
  return props;
}

// Human labels (Spanish UI) for common properties.
export const PROP_LABELS = {
  Position: 'Posición', Size: 'Tamaño', AnchorPoint: 'Punto de anclaje', Rotation: 'Rotación', ZIndex: 'ZIndex', LayoutOrder: 'Orden (LayoutOrder)',
  BackgroundColor3: 'Color de fondo', BackgroundTransparency: 'Transparencia fondo', Visible: 'Visible', ClipsDescendants: 'Recortar hijos',
  Text: 'Texto', TextSize: 'Tamaño texto', TextColor3: 'Color texto', FontFace: 'Fuente', TextScaled: 'Texto escalado', TextWrapped: 'Ajustar líneas',
  TextXAlignment: 'Alineación X', TextYAlignment: 'Alineación Y', TextTransparency: 'Transparencia texto', LineHeight: 'Interlineado',
  Image: 'Imagen', ImageColor3: 'Tinte', ImageTransparency: 'Transparencia imagen', ScaleType: 'Modo de escala',
};
