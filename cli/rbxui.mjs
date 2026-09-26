#!/usr/bin/env node
// RbxUI command line — lets people and AI agents (Claude) use the editor engine headlessly.
//
//   node cli/rbxui.mjs render   <doc.json> [--screen N|Name] [--out file.png] [--scale 2] [--node Name]
//   node cli/rbxui.mjs export   <doc.json> [--format rbxmx|luau|module] [--out file] [--no-runtime]
//   node cli/rbxui.mjs validate <doc.json>          # schema warnings + design lint (+ rbx-dom check if built)
//   node cli/rbxui.mjs import   <file.rbxmx> [--out doc.json]
//   node cli/rbxui.mjs fonts                         # list the official Roblox font families
//   node cli/rbxui.mjs serve    [port]               # run the editor locally

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalizeDocument } from '../app/js/core/model.js';
import { exportRbxmx } from '../app/js/export/rbxmx.js';
import { exportLuau } from '../app/js/export/luau.js';
import { buildRuntime, hasInteractions } from '../app/js/export/runtime.js';
import { importRbxmx } from '../app/js/export/import-rbxmx.js';
import { MiniDOMParser } from '../app/js/core/minixml.js';
import { lintDocument } from '../app/js/core/lint.js';
import { FONT_FAMILIES } from '../app/js/core/fonts-data.js';
import { serve } from './serve.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [cmd, file, ...rest] = process.argv.slice(2);
const opt = (name, def) => {
  const i = rest.indexOf('--' + name);
  return i >= 0 ? rest[i + 1] : def;
};
const flag = (name) => rest.includes('--' + name);
const load = (f) => {
  if (!f || !existsSync(f)) die(`No existe el archivo: ${f}`);
  return normalizeDocument(JSON.parse(readFileSync(f, 'utf8')));
};
function die(msg) {
  console.error(msg);
  process.exit(1);
}
const base = (f) => path.basename(f).replace(/\.(rbxui\.)?json$/i, '');

async function render() {
  const { doc, warnings } = load(file);
  warnings.forEach((w) => console.warn('aviso:', w));
  const sel = opt('screen', null);
  const screens = doc.screens.filter((s, i) => !s.design?.componentsPage && (sel == null || String(i) === sel || s.Name === sel));
  if (!screens.length) die('Pantalla no encontrada');
  const { chromium } = await import('playwright');
  const srv = await serve(0);
  const port = srv.address().port;
  const tmp = path.join(root, 'out', '.render');
  mkdirSync(tmp, { recursive: true });
  const docPath = path.join(tmp, 'doc.json');
  writeFileSync(docPath, JSON.stringify(doc));
  const browser = await chromium.launch();
  const scale = Number(opt('scale', 1));
  const outs = [];
  for (const s of screens) {
    const idx = doc.screens.indexOf(s);
    const page = await browser.newPage({ viewport: { width: s.design.width, height: s.design.height }, deviceScaleFactor: scale });
    page.on('pageerror', (e) => console.error('[render]', e.message));
    await page.goto(`http://localhost:${port}/app/render.html?doc=/out/.render/doc.json&screen=${idx}`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 20000 });
    await page.waitForTimeout(250);
    const out = opt('out', null) && screens.length === 1 ? opt('out') : path.join(root, 'out', `${base(file)}-${s.Name}.png`);
    const nodeName = opt('node', null);
    if (nodeName) {
      // close-up of one element (first node with that Name), with a margin for strokes/shadows
      const id = (() => {
        let found = null;
        const visit = (n) => {
          if (!found && n.Name === nodeName) found = n.id;
          n.children.forEach(visit);
        };
        visit(s);
        return found;
      })();
      if (!id) die('No existe un nodo llamado ' + nodeName);
      const rect = await page.evaluate((id) => {
        const el = document.querySelector(`.rbx-node[data-id="${id}"]`);
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, id);
      const m = 12;
      await page.screenshot({ path: out, clip: { x: Math.max(0, rect.x - m), y: Math.max(0, rect.y - m), width: rect.width + 2 * m, height: rect.height + 2 * m } });
    } else await page.locator('.rbx-screen').screenshot({ path: out });
    outs.push(out);
    await page.close();
  }
  await browser.close();
  srv.close();
  outs.forEach((o) => console.log(o));
}

function doExport() {
  const { doc, warnings } = load(file);
  warnings.forEach((w) => console.warn('aviso:', w));
  const format = opt('format', 'rbxmx');
  const screens = doc.screens.filter((s) => !s.design?.componentsPage);
  const extra = (s) => (!flag('no-runtime') && hasInteractions(s) ? [{ ClassName: 'LocalScript', Name: 'RbxUIController', source: buildRuntime(s) }] : []);
  let out, content, report;
  if (format === 'rbxmx') {
    ({ xml: content, report } = exportRbxmx(doc, { screens, extra }));
    out = opt('out', `out/${base(file)}.rbxmx`);
  } else if (format === 'luau' || format === 'module') {
    ({ code: content, report } = exportLuau(doc, { screens, extra, target: format === 'module' ? 'module' : 'commandbar' }));
    out = opt('out', `out/${base(file)}.luau`);
  } else die('Formato desconocido: ' + format);
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  writeFileSync(out, content);
  console.log(`${out} — ${report.count} instancias`);
  for (const [id, a] of report.missingAssets) console.warn(`imagen sin rbxassetid: ${a.name} (asset:${id}) usada en ${a.where.join(', ')}`);
  report.warnings.forEach((w) => console.warn('aviso:', w));
}

function validate() {
  const { doc, warnings } = load(file);
  let bad = 0;
  for (const w of warnings) {
    console.log('ESQUEMA  ', w);
    bad++;
  }
  for (const l of lintDocument(doc)) {
    console.log(l.level === 'error' ? 'ERROR    ' : l.level === 'warn' ? 'AVISO    ' : 'INFO     ', l.message);
    if (l.level === 'error') bad++;
  }
  const checker = path.join(root, 'tools/rbxcheck/target/release/rbxcheck');
  if (existsSync(checker)) {
    const tmp = path.join(root, 'out', '.validate.rbxmx');
    mkdirSync(path.dirname(tmp), { recursive: true });
    writeFileSync(tmp, exportRbxmx(doc).xml);
    try {
      console.log('RBX-DOM  ', execFileSync(checker, [tmp], { encoding: 'utf8' }).trim().split('\n').pop());
    } catch (e) {
      console.log('RBX-DOM   ERROR', e.stdout || e.message);
      bad++;
    }
  }
  console.log(bad ? `\n${bad} problema(s)` : '\nOK');
  process.exit(bad ? 1 : 0);
}

function doImport() {
  if (!existsSync(file)) die('No existe ' + file);
  const { screens, warnings } = importRbxmx(readFileSync(file, 'utf8'), MiniDOMParser);
  warnings.forEach((w) => console.warn('aviso:', w));
  let x = 0;
  for (const s of screens) {
    s.design.x = x;
    x += s.design.width + 200;
  }
  const doc = { format: 'rbxui', version: 1, name: path.basename(file).replace(/\.rbxmx$/i, ''), screens, assets: {} };
  const out = opt('out', file.replace(/\.rbxmx$/i, '.rbxui.json'));
  writeFileSync(out, JSON.stringify(doc, null, 1));
  console.log(`${out} — ${screens.length} pantalla(s)`);
}

switch (cmd) {
  case 'render': await render(); break;
  case 'export': doExport(); break;
  case 'validate': validate(); break;
  case 'import': doImport(); break;
  case 'fonts': FONT_FAMILIES.forEach((f) => console.log(`${f.id.padEnd(18)} ${f.name.padEnd(20)} ${f.faces.length ? 'pesos ' + [...new Set(f.faces.map((x) => x.weight))].join(',') : '(solo Roblox, vista ≈ ' + f.approx + ')'}`)); break;
  case 'serve': {
    const port = Number(file || 5170);
    await serve(port);
    console.log(`RbxUI Studio → http://localhost:${port}`);
    break;
  }
  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
}
