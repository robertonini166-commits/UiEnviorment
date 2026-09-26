// Roblox XML model (.rbxmx) exporter. Drag the file into Roblox Studio (or
// right-click StarterGui > Insert from File) and every instance appears exactly
// as designed: ScreenGui > Frames/Labels/... with their UI modifiers as children.

import { exportProps, enumValue, fontAsset, makeContentResolver, newReport } from './common.js';
import { hexToRgb } from '../core/types.js';

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const num = (v) => {
  const n = Number(v) || 0;
  return Object.is(n, -0) ? '0' : String(Math.round(n * 1e6) / 1e6);
};
const c01 = (hex) => hexToRgb(hex).map((c) => String(c / 255));

function valueXml(name, def, v, resolveContent, node) {
  const n = xmlEsc(name);
  switch (def.type) {
    case 'Bool': return `<bool name="${n}">${v ? 'true' : 'false'}</bool>`;
    case 'Int32': return `<int name="${n}">${Math.round(v)}</int>`;
    case 'Float32': return `<float name="${n}">${num(v)}</float>`;
    case 'Float64': return `<double name="${n}">${num(v)}</double>`;
    case 'String': return `<string name="${n}">${xmlEsc(v)}</string>`;
    case 'Color3': {
      const [r, g, b] = c01(v);
      return `<Color3 name="${n}"><R>${r}</R><G>${g}</G><B>${b}</B></Color3>`;
    }
    case 'UDim': return `<UDim name="${n}"><S>${num(v[0])}</S><O>${Math.round(v[1])}</O></UDim>`;
    case 'UDim2': return `<UDim2 name="${n}"><XS>${num(v[0])}</XS><XO>${Math.round(v[1])}</XO><YS>${num(v[2])}</YS><YO>${Math.round(v[3])}</YO></UDim2>`;
    case 'Vector2': return `<Vector2 name="${n}"><X>${num(v[0])}</X><Y>${num(v[1])}</Y></Vector2>`;
    case 'Rect': return `<Rect2D name="${n}"><min><X>${num(v[0])}</X><Y>${num(v[1])}</Y></min><max><X>${num(v[2])}</X><Y>${num(v[3])}</Y></max></Rect2D>`;
    case 'Enum': return `<token name="${n}">${enumValue(def.enum, v)}</token>`;
    case 'ColorSequence':
      return `<ColorSequence name="${n}">${v.map(([t, c]) => `${num(t)} ${c01(c).join(' ')} 0 `).join('')}</ColorSequence>`;
    case 'NumberSequence':
      return `<NumberSequence name="${n}">${v.map(([t, x]) => `${num(t)} ${num(x)} 0 `).join('')}</NumberSequence>`;
    case 'Font': {
      const weights = { Thin: 100, ExtraLight: 200, Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Heavy: 900 };
      return `<Font name="${n}"><Family><url>${xmlEsc(fontAsset(v.family))}</url></Family><Weight>${weights[v.weight] || 400}</Weight><Style>${v.style === 'Italic' ? 'Italic' : 'Normal'}</Style></Font>`;
    }
    case 'ContentId': {
      const url = resolveContent(v, node, name);
      return url ? `<Content name="${n}"><url>${xmlEsc(url)}</url></Content>` : `<Content name="${n}"><null></null></Content>`;
    }
    default: return '';
  }
}

/**
 * @param {object} doc
 * @param {object} opts { screens?: node[], extra?: (screen) => [{ClassName, Name, source}] }
 * @returns {{ xml: string, report }}
 */
export function exportRbxmx(doc, opts = {}) {
  const report = newReport();
  const resolveContent = makeContentResolver(doc, report);
  let ref = 0;
  const lines = [];
  const item = (node, depth) => {
    const pad = '  '.repeat(depth);
    report.count++;
    lines.push(`${pad}<Item class="${node.ClassName}" referent="RBX${(ref++).toString(16).toUpperCase().padStart(8, '0')}">`);
    lines.push(`${pad}  <Properties>`);
    lines.push(`${pad}    <string name="Name">${xmlEsc(node.Name)}</string>`);
    for (const [p, v, def] of exportProps(node)) {
      const x = valueXml(p, def, v, resolveContent, node);
      if (x) lines.push(`${pad}    ${x}`);
    }
    if (node.source !== undefined) lines.push(`${pad}    <ProtectedString name="Source"><![CDATA[${String(node.source).replace(/]]>/g, ']]]]><![CDATA[>')}]]></ProtectedString>`);
    lines.push(`${pad}  </Properties>`);
    for (const c of node.children || []) item(c, depth + 1);
    lines.push(`${pad}</Item>`);
  };
  const screens = opts.screens || doc.screens;
  for (const s of screens) {
    const extra = opts.extra ? opts.extra(s) : [];
    item(Object.assign({}, s, { children: [...s.children, ...extra.map((e) => ({ ClassName: e.ClassName, Name: e.Name, props: {}, children: [], source: e.source }))] }), 1);
  }
  const xml = `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">\n  <Meta name="ExplicitAutoJoints">true</Meta>\n${lines.join('\n')}\n</roblox>\n`;
  return { xml, report };
}
