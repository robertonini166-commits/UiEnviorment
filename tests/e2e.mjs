// End-to-end smoke test of the editor with real mouse/keyboard events.
import { chromium } from 'playwright';
import { serve } from '../cli/serve.mjs';
import assert from 'node:assert/strict';

const srv = await serve(0);
const port = srv.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
await page.goto(`http://localhost:${port}/index.html?fresh=1`);
await page.waitForFunction(() => window.rbxui);
await page.waitForTimeout(1500);
const app = (fn, arg) => page.evaluate(fn, arg);
const shot = (n) => page.screenshot({ path: `/tmp/claude-0/shots/e2e-${n}.png` });
const step = async (name, fn) => {
  try { await fn(); console.log('✓', name); } catch (e) { console.log('✗', name, e.message); errors.push(name + ': ' + e.message); await shot('fail-' + name.replace(/\W+/g, '_')); }
};

// new empty screen to work on
await step('add screen', async () => {
  await app(() => { window.rbxui.cmd.addScreen('studio'); });
  await page.waitForTimeout(300);
  const n = await app(() => window.rbxui.store.doc.screens.length);
  assert.equal(n, 2);
});
const screenRect = async () => app(() => {
  const a = window.rbxui; const scr = a.store.activeScreen; const r = a.canvas.wrap.getBoundingClientRect();
  const [x, y] = a.canvas.toScreen(scr.design.x, scr.design.y); return { x: x + r.left, y: y + r.top, z: a.store.view.zoom, id: scr.id };
});

await step('draw frame with F tool', async () => {
  const s = await screenRect();
  await page.keyboard.press('f');
  await page.mouse.move(s.x + 100 * s.z, s.y + 100 * s.z);
  await page.mouse.down();
  await page.mouse.move(s.x + 300 * s.z, s.y + 250 * s.z, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const r = await app(() => { const n = window.rbxui.store.selectedNodes()[0]; return n && { cls: n.ClassName, size: n.props.Size, pos: n.props.Position }; });
  assert.equal(r.cls, 'Frame');
  assert.ok(Math.abs(r.size[1] - 200) <= 2 && Math.abs(r.size[3] - 150) <= 2, 'size ' + r.size);
});

await step('move frame by drag', async () => {
  const s = await screenRect();
  const before = await app(() => window.rbxui.store.selectedNodes()[0].props.Position);
  await page.mouse.move(s.x + 200 * s.z, s.y + 175 * s.z);
  await page.mouse.down();
  await page.mouse.move(s.x + 260 * s.z, s.y + 205 * s.z, { steps: 6 });
  await page.mouse.up();
  const after = await app(() => window.rbxui.store.selectedNodes()[0].props.Position);
  assert.ok(Math.abs(after[1] - before[1] - 60) <= 7, `dx ${after[1] - before[1]}`);
  assert.ok(Math.abs(after[3] - before[3] - 30) <= 7, `dy ${after[3] - before[3]}`);
});

await step('resize via SE handle', async () => {
  const b = await app(() => { const a = window.rbxui; const id = a.store.selection[0]; const p = a.canvas.polyOf(id); const r = a.canvas.wrap.getBoundingClientRect(); const [x, y] = a.canvas.toScreen(p[2][0], p[2][1]); return { x: x + r.left, y: y + r.top, size: a.store.get(id).props.Size }; });
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.mouse.move(b.x + 40, b.y + 20, { steps: 5 });
  await page.mouse.up();
  const size = await app(() => window.rbxui.store.selectedNodes()[0].props.Size);
  const z = (await screenRect()).z;
  assert.ok(Math.abs(size[1] - b.size[1] - 40 / z) < 8, `w ${size[1]} vs ${b.size[1]}`);
});

await step('undo / redo', async () => {
  const s0 = await app(() => window.rbxui.store.selectedNodes()[0]?.props.Size);
  await page.keyboard.press('Control+z');
  const s1 = await app(() => { const a = window.rbxui; const n = a.store.activeScreen.children[0]; return n?.props.Size; });
  assert.notDeepEqual(s0, s1);
  await page.keyboard.press('Control+Shift+z');
  const s2 = await app(() => window.rbxui.store.activeScreen.children[0]?.props.Size);
  assert.deepEqual(s0, s2);
});

await step('text tool creates label and edits text', async () => {
  const s = await screenRect();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await page.mouse.click(s.x + 700 * s.z, s.y + 400 * s.z);
  await page.waitForTimeout(200);
  await page.keyboard.type('Hola Roblox');
  await page.keyboard.press('Control+Enter');
  const t = await app(() => { const n = window.rbxui.store.selectedNodes()[0]; return n && [n.ClassName, n.props.Text]; });
  assert.deepEqual(t, ['TextLabel', 'Hola Roblox']);
});

await step('inspector renders for each class', async () => {
  const classes = ['Frame', 'TextLabel', 'TextButton', 'TextBox', 'ImageLabel', 'ImageButton', 'ScrollingFrame', 'CanvasGroup', 'ViewportFrame', 'VideoFrame'];
  for (const c of classes) {
    await app((c) => { const a = window.rbxui; a.store.select([]); a.cmd.insert(c, { parent: a.store.activeScreen }); }, c);
    await page.waitForTimeout(80);
  }
  const n = await app(() => document.querySelectorAll('#right-body .insp-section').length);
  assert.ok(n > 3);
});

await step('add modifiers via command', async () => {
  await app(() => { const a = window.rbxui; const f = a.store.activeScreen.children.find((c) => c.ClassName === 'Frame'); a.store.select(f.id); for (const m of ['UICorner', 'UIStroke', 'UIGradient', 'UIPadding', 'UIListLayout', 'UIShadow', 'UIScale', 'UIAspectRatioConstraint']) a.cmd.addModifier(m); });
  await page.waitForTimeout(200);
  const kinds = await app(() => window.rbxui.store.selectedNodes()[0].children.map((c) => c.ClassName));
  assert.ok(kinds.includes('UICorner') && kinds.includes('UIGradient') && kinds.includes('UIListLayout'));
});

await step('group / ungroup', async () => {
  await app(() => { const a = window.rbxui; const kids = a.store.activeScreen.children.filter((c) => c.ClassName === 'TextLabel' || c.ClassName === 'TextButton').map((c) => c.id); a.store.select(kids); });
  await page.keyboard.press('Control+g');
  const g = await app(() => { const n = window.rbxui.store.selectedNodes()[0]; return [n.ClassName, n.children.length]; });
  assert.equal(g[0], 'Frame');
  assert.ok(g[1] >= 2);
  await page.keyboard.press('Control+Shift+g');
  const u = await app(() => window.rbxui.store.selection.length);
  assert.ok(u >= 2);
});

await step('copy / paste / duplicate / delete', async () => {
  const before = await app(() => window.rbxui.store.activeScreen.children.length);
  await app(() => { const a = window.rbxui; a.store.select(a.store.activeScreen.children[0].id); });
  await page.keyboard.press('Control+d');
  const after = await app(() => window.rbxui.store.activeScreen.children.length);
  assert.equal(after, before + 1);
  await page.keyboard.press('Delete');
  assert.equal(await app(() => window.rbxui.store.activeScreen.children.length), before);
});

await step('kit insert', async () => {
  await app(async () => { const a = window.rbxui; const { KIT } = await import('./app/js/editor/templates.js'); for (const k of KIT) await a.insertKit(k); });
  await page.waitForTimeout(500);
});

await step('select every node (inspector stress)', async () => {
  const count = await app(async () => { const a = window.rbxui; const ids = a.store.allNodes().map((n) => n.id); for (const id of ids) { a.store.select(id); } return ids.length; });
  assert.ok(count > 50);
});

await step('right tabs render', async () => {
  for (const t of ['Prototipo', 'Código', 'Diseño']) { await page.click(`#right-tabs button:has-text("${t}")`); await page.waitForTimeout(150); }
  for (const t of ['Recursos', 'Kit', 'Capas']) { await page.click(`#left-tabs button:has-text("${t}")`); await page.waitForTimeout(300); }
});

await step('export dialog', async () => {
  await page.keyboard.press('Control+e');
  await page.waitForTimeout(300);
  const ok = await page.isVisible('.dialog');
  assert.ok(ok);
  await page.keyboard.press('Escape');
});

await step('exports run in page', async () => {
  const r = await app(async () => { const { exportRbxmx } = await import('./app/js/export/rbxmx.js'); const { exportLuau } = await import('./app/js/export/luau.js'); const { buildRuntime } = await import('./app/js/export/runtime.js'); const d = window.rbxui.store.doc; return [exportRbxmx(d).report.count, exportLuau(d).code.length, buildRuntime(d.screens[0]).length]; });
  assert.ok(r[0] > 50 && r[1] > 1000 && r[2] > 1000);
});

await step('play mode', async () => {
  await app(() => { const a = window.rbxui; a.store.activeScreenId = a.store.doc.screens[0].id; a.prototype.play(); });
  await page.waitForTimeout(600);
  await shot('play');
  await page.keyboard.press('Escape');
});

await step('component create + sync', async () => {
  const r = await app(() => {
    const a = window.rbxui; const s = a.store;
    const scr = s.doc.screens[1]; const n = scr.children.find((c) => c.ClassName === 'Frame');
    s.select(n.id); a.components.createFromSelection();
    const cid = n.editor.componentId; const master = a.components.masterOf(cid);
    a.components.insertInstance(cid, scr);
    a.cmd.setProp([master.id], 'BackgroundColor3', '#FF0000');
    const insts = a.components.instances(cid);
    return insts.map((i) => i.props.BackgroundColor3);
  });
  assert.ok(r.length >= 2 && r.every((c) => c === '#FF0000'), JSON.stringify(r));
});

await shot('final');
console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\nALL GOOD');
await browser.close();
srv.close();
process.exit(errors.length ? 1 : 0);
