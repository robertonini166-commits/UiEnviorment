#!/usr/bin/env node
// RbxUI MCP server (Model Context Protocol, stdio). Lets Claude design Roblox UIs with RbxUI:
//   claude mcp add rbxui -- node /ruta/a/UiEnviorment/cli/mcp.mjs
// Tools: rbxui_guide, rbxui_render, rbxui_validate, rbxui_export, rbxui_template, rbxui_import_rbxmx, rbxui_fonts
// No dependencies besides Playwright (only needed by rbxui_render).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { normalizeDocument, compactNode } from '../app/js/core/model.js';
import { exportRbxmx } from '../app/js/export/rbxmx.js';
import { exportLuau } from '../app/js/export/luau.js';
import { buildRuntime, hasInteractions } from '../app/js/export/runtime.js';
import { importRbxmx } from '../app/js/export/import-rbxmx.js';
import { MiniDOMParser } from '../app/js/core/minixml.js';
import { lintDocument } from '../app/js/core/lint.js';
import { FONT_FAMILIES } from '../app/js/core/fonts-data.js';
import { KIT } from '../app/js/editor/templates.js';
import { SCREEN_TEMPLATES } from '../app/js/editor/screen-templates.js';
import { serve } from './serve.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PROTOCOL = '2024-11-05';

// ---------- helpers ----------
function loadDoc(args) {
  let src = args.document;
  if (!src && args.path) {
    if (!existsSync(args.path)) throw new Error(`No existe el archivo ${args.path}`);
    src = readFileSync(args.path, 'utf8');
  }
  if (!src) throw new Error('Pasa "document" (objeto JSON o texto) o "path" a un .rbxui.json');
  if (typeof src === 'string') src = JSON.parse(src);
  // accept a bare node or screen too
  if (!src.screens) src = { screens: [src.ClassName === 'ScreenGui' ? src : { ClassName: 'ScreenGui', Name: 'Screen', children: [src] }] };
  return normalizeDocument(src);
}

const text = (t) => ({ content: [{ type: 'text', text: t }] });

let browserP = null;
let server = null;
async function browser() {
  if (!browserP) {
    browserP = (async () => {
      const { chromium } = await import('playwright');
      server = await serve(0);
      return chromium.launch();
    })();
  }
  return browserP;
}

async function renderPng(doc, { screen, node, scale = 1 }) {
  const b = await browser();
  const port = server.address().port;
  const tmp = path.join(root, 'out', '.mcp');
  mkdirSync(tmp, { recursive: true });
  const f = path.join(tmp, `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`);
  writeFileSync(f, JSON.stringify(doc));
  const scrs = doc.screens.filter((s) => !s.design?.componentsPage);
  const idx = screen == null ? doc.screens.indexOf(scrs[0]) : doc.screens.findIndex((s, i) => String(i) === String(screen) || s.Name === screen);
  if (idx < 0) throw new Error('Pantalla no encontrada: ' + screen);
  const s = doc.screens[idx];
  const page = await b.newPage({ viewport: { width: s.design.width, height: s.design.height }, deviceScaleFactor: scale });
  try {
    await page.goto(`http://localhost:${port}/app/render.html?doc=/${path.relative(root, f)}&screen=${idx}`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 20000 });
    await page.waitForTimeout(200);
    if (node) {
      let id = null;
      const visit = (n) => {
        if (!id && n.Name === node) id = n.id;
        n.children.forEach(visit);
      };
      visit(s);
      if (!id) throw new Error('No hay ningún nodo llamado ' + node);
      const r = await page.evaluate((nid) => {
        const el = document.querySelector(`.rbx-node[data-id="${nid}"]`);
        const rc = el.getBoundingClientRect();
        return { x: rc.x, y: rc.y, width: rc.width, height: rc.height };
      }, id);
      const m = 12;
      return await page.screenshot({ clip: { x: Math.max(0, r.x - m), y: Math.max(0, r.y - m), width: r.width + 2 * m, height: r.height + 2 * m } });
    }
    return await page.locator('.rbx-screen').screenshot();
  } finally {
    await page.close();
  }
}

// ---------- tools ----------
const docArgs = {
  document: { description: 'Documento RbxUI (objeto o texto JSON). También vale un nodo suelto o un ScreenGui.', type: ['object', 'string'] },
  path: { type: 'string', description: 'Ruta a un archivo .rbxui.json (alternativa a document).' },
};

const TOOLS = [
  {
    name: 'rbxui_guide',
    description: 'Devuelve la guía para diseñar UIs de Roblox con RbxUI: formato JSON (clases y propiedades de Roblox), fuentes permitidas y guía de estilo "Stud Style". Llámala antes de diseñar.',
    inputSchema: { type: 'object', properties: {} },
    run: () => text(readFileSync(path.join(root, 'docs/FORMAT.md'), 'utf8') + '\n\n---\n\n' + readFileSync(path.join(root, 'CLAUDE.md'), 'utf8').split('## Reglas técnicas')[0]),
  },
  {
    name: 'rbxui_render',
    description: 'Renderiza una pantalla (o un nodo concreto) del documento a PNG con el motor de RbxUI, igual que se verá en Roblox. Úsalo para revisar visualmente el diseño e iterar.',
    inputSchema: { type: 'object', properties: { ...docArgs, screen: { type: ['string', 'number'], description: 'Nombre o índice de la pantalla (por defecto la primera).' }, node: { type: 'string', description: 'Name de un nodo para renderizar solo ese elemento (primer plano).' }, scale: { type: 'number', description: 'Escala del PNG (1-3).', default: 1 } } },
    run: async (a) => {
      const { doc, warnings } = loadDoc(a);
      const png = await renderPng(doc, { screen: a.screen, node: a.node, scale: Math.min(3, Math.max(1, a.scale || 1)) });
      const content = [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }];
      if (warnings.length) content.push({ type: 'text', text: 'Avisos de esquema:\n' + warnings.join('\n') });
      return { content };
    },
  },
  {
    name: 'rbxui_validate',
    description: 'Valida el documento: propiedades/clases de Roblox, fuentes oficiales, errores típicos de diseño (texto demasiado grande/pequeño, degradados invisibles, nombres duplicados, contraste…).',
    inputSchema: { type: 'object', properties: docArgs },
    run: (a) => {
      const { doc, warnings } = loadDoc(a);
      const lint = lintDocument(doc);
      const lines = [...warnings.map((w) => 'ESQUEMA: ' + w), ...lint.map((l) => `${l.level.toUpperCase()}: ${l.message}`)];
      return text(lines.length ? lines.join('\n') : 'OK — sin problemas');
    },
  },
  {
    name: 'rbxui_export',
    description: 'Exporta a Roblox. format: "rbxmx" (modelo para Insert from File en StarterGui), "luau" (script para la Command Bar de Studio) o "module" (ModuleScript). Incluye el LocalScript de interacciones si las hay. Si pasas outPath se escribe el archivo.',
    inputSchema: { type: 'object', properties: { ...docArgs, format: { type: 'string', enum: ['rbxmx', 'luau', 'module'], default: 'rbxmx' }, outPath: { type: 'string' }, runtime: { type: 'boolean', default: true } } },
    run: (a) => {
      const { doc } = loadDoc(a);
      const screens = doc.screens.filter((s) => !s.design?.componentsPage);
      const extra = (s) => (a.runtime !== false && hasInteractions(s) ? [{ ClassName: 'LocalScript', Name: 'RbxUIController', source: buildRuntime(s) }] : []);
      const fmt = a.format || 'rbxmx';
      const r = fmt === 'rbxmx' ? exportRbxmx(doc, { screens, extra }) : exportLuau(doc, { screens, extra, target: fmt === 'module' ? 'module' : 'commandbar' });
      const out = r.xml ?? r.code;
      const notes = [`${r.report.count} instancias.`];
      for (const [id, x] of r.report.missingAssets) notes.push(`Imagen sin rbxassetid: ${x.name} (asset:${id}) — súbela a Roblox y pon su ID en assets.${id}.rbxId`);
      if (a.outPath) {
        mkdirSync(path.dirname(path.resolve(a.outPath)), { recursive: true });
        writeFileSync(a.outPath, out);
        return text(`Escrito ${a.outPath}. ${notes.join('\n')}`);
      }
      return text(notes.join('\n') + '\n\n' + out);
    },
  },
  {
    name: 'rbxui_template',
    description: 'Devuelve el JSON de una plantilla para partir de ella. Sin "name" lista las disponibles (piezas del kit y pantallas completas).',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'id de pieza (p.ej. "window", "btn-lime", "card") o de pantalla (p.ej. "inventory", "daily", "rebirth").' } } },
    run: (a) => {
      if (!a.name) return text('Piezas: ' + KIT.map((k) => `${k.id} (${k.name})`).join(', ') + '\nPantallas: ' + SCREEN_TEMPLATES.map((t) => `${t.id} (${t.name})`).join(', '));
      const k = KIT.find((x) => x.id === a.name);
      const t = SCREEN_TEMPLATES.find((x) => x.id === a.name);
      if (!k && !t) throw new Error('Plantilla desconocida: ' + a.name);
      const raw = k ? { screens: [{ ClassName: 'ScreenGui', Name: 'Screen', children: [k.make()] }] } : { screens: [t.make()] };
      const { doc } = normalizeDocument(raw);
      const out = { format: 'rbxui', version: 1, name: (k || t).name, screens: doc.screens.map((s) => ({ ...compactNode(s), design: s.design })) };
      return text(JSON.stringify(out, null, 1));
    },
  },
  {
    name: 'rbxui_import_rbxmx',
    description: 'Convierte un modelo .rbxmx de Roblox Studio (UI guardada con "Save to File") en un documento RbxUI.',
    inputSchema: { type: 'object', properties: { xml: { type: 'string' }, path: { type: 'string' } } },
    run: (a) => {
      const xml = a.xml || readFileSync(a.path, 'utf8');
      const { screens, warnings } = importRbxmx(xml, MiniDOMParser);
      const out = { format: 'rbxui', version: 1, name: 'Importado', screens: screens.map((s) => ({ ...compactNode(s), design: s.design })) };
      return text((warnings.length ? 'Avisos:\n' + warnings.join('\n') + '\n\n' : '') + JSON.stringify(out, null, 1));
    },
  },
  {
    name: 'rbxui_fonts',
    description: 'Lista las 40 familias de fuentes oficiales de Roblox (las únicas permitidas) con sus pesos.',
    inputSchema: { type: 'object', properties: {} },
    run: () => text(FONT_FAMILIES.map((f) => `${f.id} — ${f.name}${f.faces.length ? '' : ' (solo en Roblox; vista previa aproximada)'}`).join('\n')),
  },
];

// ---------- JSON-RPC over stdio ----------
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  const { id, method, params } = msg;
  const reply = (result) => id !== undefined && send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    if (method === 'initialize') return reply({ protocolVersion: params?.protocolVersion || PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'rbxui', version: '0.1.0' } });
    if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return;
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    if (method === 'tools/call') {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return fail(-32602, 'Herramienta desconocida: ' + params?.name);
      try {
        return reply(await tool.run(params.arguments || {}));
      } catch (e) {
        return reply({ content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true });
      }
    }
    return fail(-32601, 'Método no soportado: ' + method);
  } catch (e) {
    return fail(-32603, e.message);
  }
});
rl.on('close', async () => {
  if (browserP) (await browserP).close();
  server?.close();
});
