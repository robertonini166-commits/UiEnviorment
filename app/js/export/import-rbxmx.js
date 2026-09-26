// Imports Roblox XML models (.rbxmx) — e.g. an existing UI saved from Studio with
// "Save to File" — into RbxUI screens. Works in the browser (DOMParser) and in Node
// when a DOMParser implementation is passed in.

import { getProps, SUPPORTED, ENUMS, canParent, resolveFontFamily, weightName, defaultsFor, isGuiObject } from '../core/schema.js';
import { newId, rgbToHex } from '../core/types.js';
import { DEVICES } from '../core/model.js';

const WEIGHT_BY_NUM = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Heavy' };
// Enum.Font (legacy "Font" token) -> Font datatype
const ENUM_FONT = {
  3: ['SourceSansPro', 'Regular'], 4: ['SourceSansPro', 'Bold'], 5: ['SourceSansPro', 'Light'], 6: ['SourceSansPro', 'Regular', 'Italic'], 16: ['SourceSansPro', 'SemiBold'],
  7: ['AccanthisADFStd', 'Regular'], 8: ['Guru', 'Regular'], 9: ['ComicNeueAngular', 'Regular'], 10: ['Inconsolata', 'Regular'], 11: ['HighwayGothic', 'Regular'],
  12: ['Zekton', 'Regular'], 13: ['PressStart2P', 'Regular'], 14: ['Balthazar', 'Regular'], 15: ['RomanAntique', 'Regular'], 17: ['Montserrat', 'Regular'],
  18: ['Montserrat', 'Medium'], 19: ['Montserrat', 'Bold'], 20: ['Montserrat', 'Heavy'], 21: ['AmaticSC', 'Regular'], 22: ['Bangers', 'Regular'], 23: ['Creepster', 'Regular'],
  24: ['DenkOne', 'Regular'], 25: ['Fondamento', 'Regular'], 26: ['FredokaOne', 'Regular'], 27: ['GrenzeGotisch', 'Regular'], 28: ['IndieFlower', 'Regular'],
  29: ['JosefinSans', 'Regular'], 30: ['Jura', 'Regular'], 31: ['Kalam', 'Regular'], 32: ['LuckiestGuy', 'Regular'], 33: ['Merriweather', 'Regular'], 34: ['Michroma', 'Regular'],
  35: ['Nunito', 'Regular'], 36: ['Oswald', 'Regular'], 37: ['PatrickHand', 'Regular'], 38: ['PermanentMarker', 'Regular'], 39: ['Roboto', 'Regular'], 40: ['RobotoCondensed', 'Regular'],
  41: ['RobotoMono', 'Regular'], 42: ['Sarpanch', 'Regular'], 43: ['SpecialElite', 'Regular'], 44: ['TitilliumWeb', 'Regular'], 45: ['Ubuntu', 'Regular'], 46: ['BuilderSans', 'Regular'],
  47: ['BuilderSans', 'Medium'], 48: ['BuilderSans', 'Bold'], 49: ['BuilderSans', 'ExtraBold'], 50: ['Arimo', 'Regular'], 51: ['Arimo', 'Bold'], 0: ['Arimo', 'Regular'], 1: ['Arimo', 'Regular'], 2: ['Arimo', 'Bold'],
};

const kids = (el, tag) => [...el.children].filter((c) => !tag || c.tagName === tag);
const child = (el, tag) => [...el.children].find((c) => c.tagName === tag);
const num = (el, tag) => Number(child(el, tag)?.textContent ?? 0);

function readValue(el, def) {
  const t = el.tagName;
  switch (t) {
    case 'bool': return el.textContent.trim() === 'true';
    case 'int': case 'int64': return Math.round(Number(el.textContent));
    case 'float': case 'double': return Number(el.textContent);
    case 'string': case 'ProtectedString': return el.textContent;
    case 'Color3': {
      if (child(el, 'R')) return rgbToHex(num(el, 'R') * 255, num(el, 'G') * 255, num(el, 'B') * 255);
      const n = Number(el.textContent);
      return rgbToHex((n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
    case 'Color3uint8': {
      const n = Number(el.textContent);
      return rgbToHex((n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
    case 'UDim': return [num(el, 'S'), num(el, 'O')];
    case 'UDim2': return [num(el, 'XS'), num(el, 'XO'), num(el, 'YS'), num(el, 'YO')];
    case 'Vector2': return [num(el, 'X'), num(el, 'Y')];
    case 'Rect2D': {
      const mn = child(el, 'min'), mx = child(el, 'max');
      return [num(mn, 'X'), num(mn, 'Y'), num(mx, 'X'), num(mx, 'Y')];
    }
    case 'token': {
      const v = Number(el.textContent);
      if (def?.type === 'Enum') {
        const items = ENUMS[def.enum] || {};
        return Object.keys(items).find((k) => items[k] === v) ?? Object.keys(items)[0];
      }
      return v;
    }
    case 'ColorSequence': {
      const p = el.textContent.trim().split(/\s+/).map(Number);
      const out = [];
      for (let i = 0; i + 4 < p.length + 1; i += 5) out.push([p[i], rgbToHex(p[i + 1] * 255, p[i + 2] * 255, p[i + 3] * 255)]);
      return out;
    }
    case 'NumberSequence': {
      const p = el.textContent.trim().split(/\s+/).map(Number);
      const out = [];
      for (let i = 0; i + 2 < p.length + 1; i += 3) out.push([p[i], p[i + 1]]);
      return out;
    }
    case 'Font': {
      const fam = child(child(el, 'Family') || el, 'url')?.textContent || '';
      const w = Number(child(el, 'Weight')?.textContent || 400);
      return { family: resolveFontFamily(fam) || 'Montserrat', weight: WEIGHT_BY_NUM[w] || weightName(w), style: (child(el, 'Style')?.textContent || 'Normal').trim() === 'Italic' ? 'Italic' : 'Normal' };
    }
    case 'Content': case 'ContentId': {
      const u = child(el, 'url');
      return u ? u.textContent.trim() : '';
    }
    default: return undefined;
  }
}

/**
 * @param {string} xml
 * @param {DOMParser} [Parser]
 * @returns {{ screens: object[], warnings: string[] }}
 */
export function importRbxmx(xml, Parser = globalThis.DOMParser) {
  const warnings = [];
  const dom = new Parser().parseFromString(xml, 'application/xml');
  const root = dom.documentElement;
  if (!root || root.tagName !== 'roblox') throw new Error('No es un archivo .rbxmx válido');
  const readItem = (item, parentClass, path) => {
    const cls = item.getAttribute('class');
    if (!SUPPORTED.has(cls)) {
      if (!['LocalScript', 'Script', 'ModuleScript'].includes(cls)) warnings.push(`${path}: ${cls} no soportado (omitido)`);
      return null;
    }
    if (parentClass && !canParent(cls, parentClass)) {
      warnings.push(`${path}: ${cls} dentro de ${parentClass} (omitido)`);
      return null;
    }
    const defs = getProps(cls);
    const props = {};
    const rbxDefaults = defaultsFor(cls);
    let name = cls;
    let legacyFont = null, legacyFontSize = null;
    const propsEl = child(item, 'Properties');
    for (const pe of propsEl ? kids(propsEl) : []) {
      const pname = pe.getAttribute('name');
      if (pname === 'Name') {
        name = pe.textContent;
        continue;
      }
      if (pname === 'Font' && pe.tagName === 'token') {
        legacyFont = Number(pe.textContent);
        continue;
      }
      if (pname === 'FontSize') {
        legacyFontSize = Number(pe.textContent);
        continue;
      }
      const def = defs[pname];
      if (!def) continue;
      const v = readValue(pe, def);
      if (v !== undefined) props[pname] = v;
    }
    // Instance.new defaults for anything not present in the file
    const node = { id: newId(), ClassName: cls, Name: name, props: {}, children: [] };
    for (const [k, v] of Object.entries(rbxDefaults)) if (defs[k] && k !== 'Name') node.props[k] = v;
    Object.assign(node.props, props);
    if (!props.FontFace && legacyFont != null && ENUM_FONT[legacyFont]) {
      const [family, weight, style = 'Normal'] = ENUM_FONT[legacyFont];
      node.props.FontFace = { family, weight, style };
    }
    void legacyFontSize;
    for (const c of kids(item, 'Item')) {
      const n = readItem(c, cls, `${path}/${c.getAttribute('class')}`);
      if (n) node.children.push(n);
    }
    return node;
  };
  const screens = [];
  for (const item of kids(root, 'Item')) {
    const cls = item.getAttribute('class');
    if (cls === 'ScreenGui' || cls === 'Folder' || cls === 'StarterGui') {
      if (cls === 'StarterGui') {
        for (const c of kids(item, 'Item')) {
          const n = readItem(c, null, c.getAttribute('class'));
          if (n?.ClassName === 'ScreenGui') screens.push(n);
        }
        continue;
      }
      const n = readItem(item, null, cls);
      if (!n) continue;
      if (cls === 'Folder') {
        const sg = { id: newId(), ClassName: 'ScreenGui', Name: n.Name, props: defaultsFor('ScreenGui'), children: n.children.filter((c) => isGuiObject(c.ClassName) || c.ClassName === 'Folder') };
        screens.push(sg);
      } else screens.push(n);
    } else if (isGuiObject(cls)) {
      const n = readItem(item, 'ScreenGui', cls);
      if (n) screens.push({ id: newId(), ClassName: 'ScreenGui', Name: n.Name + 'Gui', props: defaultsFor('ScreenGui'), children: [n] });
    } else warnings.push(`${cls} en la raíz (omitido)`);
  }
  for (const s of screens) {
    const d = DEVICES.studio;
    s.design = { x: 0, y: 0, width: d.width, height: d.height, device: 'studio', background: '#3A6EA5' };
    if (s.props.ZIndexBehavior === 'Global') warnings.push(`${s.Name}: ZIndexBehavior Global (vista previa como Sibling)`);
  }
  return { screens, warnings };
}
