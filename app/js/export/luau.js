// Luau exporter. Produces a script that rebuilds the UI with Instance.new, either for the
// Studio command bar (parents into StarterGui, replacing an existing copy) or as a
// ModuleScript that returns a build(parent) function for runtime creation.

import { exportProps, fontAsset, makeContentResolver, newReport } from './common.js';
import { hexToRgb } from '../core/types.js';

const num = (v) => {
  const n = Math.round((Number(v) || 0) * 1e6) / 1e6;
  return Object.is(n, -0) ? '0' : String(n);
};

export function luaString(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, (c) => '\\' + c.charCodeAt(0)) + '"';
}

const rgb = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return `Color3.fromRGB(${r}, ${g}, ${b})`;
};

export function luaValue(def, v, resolveContent, node, prop) {
  switch (def.type) {
    case 'Bool': return v ? 'true' : 'false';
    case 'Int32': return String(Math.round(v));
    case 'Float32': case 'Float64': return num(v);
    case 'String': return luaString(v);
    case 'Color3': return rgb(v);
    case 'UDim': return `UDim.new(${num(v[0])}, ${Math.round(v[1])})`;
    case 'UDim2': return `UDim2.new(${num(v[0])}, ${Math.round(v[1])}, ${num(v[2])}, ${Math.round(v[3])})`;
    case 'Vector2': return `Vector2.new(${num(v[0])}, ${num(v[1])})`;
    case 'Rect': return `Rect.new(${num(v[0])}, ${num(v[1])}, ${num(v[2])}, ${num(v[3])})`;
    case 'Enum': return `Enum.${def.enum}.${v}`;
    case 'ColorSequence':
      return `ColorSequence.new({${v.map(([t, c]) => `ColorSequenceKeypoint.new(${num(t)}, ${rgb(c)})`).join(', ')}})`;
    case 'NumberSequence':
      return `NumberSequence.new({${v.map(([t, x]) => `NumberSequenceKeypoint.new(${num(t)}, ${num(x)})`).join(', ')}})`;
    case 'Font': return `Font.new(${luaString(fontAsset(v.family))}, Enum.FontWeight.${v.weight}, Enum.FontStyle.${v.style === 'Italic' ? 'Italic' : 'Normal'})`;
    case 'ContentId': return luaString(resolveContent(v, node, prop));
    default: return 'nil';
  }
}

/**
 * @param doc
 * @param opts { screens?, target: 'commandbar'|'module', extra?: (screen)=>[{ClassName, Name, source}] }
 */
export function exportLuau(doc, opts = {}) {
  const report = newReport();
  const resolveContent = makeContentResolver(doc, report);
  const target = opts.target || 'commandbar';
  const out = [];
  let vid = 0;
  const emit = (node, parentVar, indent) => {
    const v = `i${++vid}`;
    report.count++;
    out.push(`${indent}local ${v} = Instance.new(${luaString(node.ClassName)})`);
    out.push(`${indent}${v}.Name = ${luaString(node.Name)}`);
    const optional = [];
    for (const [p, val, def, opt] of exportProps(node)) {
      const line = `${v}.${p} = ${luaValue(def, val, resolveContent, node, p)}`;
      if (opt) optional.push(line);
      else out.push(indent + line);
    }
    if (optional.length) out.push(`${indent}pcall(function() ${optional.join('; ')} end) -- propiedades nuevas/beta`);
    if (node.source !== undefined) out.push(`${indent}${v}.Source = ${luaString(node.source)}`);
    for (const c of node.children || []) emit(c, v, indent);
    if (parentVar) out.push(`${indent}${v}.Parent = ${parentVar}`);
    return v;
  };

  if (target === 'snippet') {
    out.push('-- Generado por RbxUI Studio', 'local function build(parent: Instance)');
    const vars = (opts.nodes || []).map((n) => emit(n, 'parent', '\t'));
    out.push(`\treturn ${vars.join(', ') || 'nil'}`, 'end', '', 'return build');
    return { code: out.join('\n') + '\n', report };
  }
  const screens = opts.screens || doc.screens;
  const header = [
    '--[[',
    `  ${doc.name || 'UI'} — generado por RbxUI Studio`,
    '  Cada objeto es una instancia real de Roblox (Frame, TextLabel, UIStroke, ...),',
    '  así que puedes animarlo o editarlo en Studio igual que si lo hubieras creado a mano.',
    ']]',
  ];
  if (target === 'module') {
    out.push(...header, 'local Build = {}', '');
    for (const s of screens) {
      out.push(`function Build.${s.Name.replace(/[^A-Za-z0-9_]/g, '_') || 'Screen'}(parent: Instance?): ScreenGui`);
      const v = emit(Object.assign({}, s, { children: [...s.children, ...(opts.extra ? opts.extra(s) : []).map((e) => ({ ClassName: e.ClassName, Name: e.Name, props: {}, children: [], source: e.source }))] }), null, '\t');
      out.push(`\t${v}.Parent = parent`, `\treturn ${v}`, 'end', '');
    }
    out.push('return Build');
  } else {
    out.push(...header, 'local StarterGui = game:GetService("StarterGui")', 'local ChangeHistoryService = game:GetService("ChangeHistoryService")',
      'local recording = ChangeHistoryService:TryBeginRecording("RbxUI import")', '');
    for (const s of screens) {
      out.push(`do -- ${s.Name}`);
      out.push(`\tlocal old = StarterGui:FindFirstChild(${luaString(s.Name)})`, '\tif old then old:Destroy() end');
      const v = emit(Object.assign({}, s, { children: [...s.children, ...(opts.extra ? opts.extra(s) : []).map((e) => ({ ClassName: e.ClassName, Name: e.Name, props: {}, children: [], source: e.source }))] }), null, '\t');
      out.push(`\t${v}.Parent = StarterGui`, 'end', '');
    }
    out.push('if recording then ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit) end',
      `print("RbxUI: importado ${screens.map((s) => s.Name).join(', ').replace(/"/g, '')} en StarterGui")`);
  }
  return { code: out.join('\n') + '\n', report };
}
