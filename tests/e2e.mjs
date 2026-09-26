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

await step('reparent by dragging into a frame', async () => {
  const r = await app(() => {
    const a = window.rbxui; const s = a.store;
    const scr = a.cmd.addScreen('studio');
    const big = a.cmd.insert('Frame', { parent: scr, props: { Position: [0, 100, 0, 100], Size: [0, 400, 0, 300], BackgroundColor3: '#333333' } });
    const small = a.cmd.insert('Frame', { parent: scr, props: { Position: [0, 700, 0, 150], Size: [0, 80, 0, 80], BackgroundColor3: '#FF0000' } });
    s.select(small.id);
    return { big: big.id, small: small.id };
  });
  await page.waitForTimeout(300);
  const pt = (id, fx, fy) => app(([id, fx, fy]) => { const a = window.rbxui; const p = a.canvas.polyOf(id); const rc = a.canvas.wrap.getBoundingClientRect(); const [x, y] = a.canvas.toScreen(p[0][0] + (p[1][0] - p[0][0]) * fx, p[0][1] + (p[3][1] - p[0][1]) * fy); return [x + rc.left, y + rc.top]; }, [id, fx, fy]);
  const [sx, sy] = await pt(r.small, 0.5, 0.5);
  const [tx, ty] = await pt(r.big, 0.5, 0.5);
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(tx, ty, { steps: 10 }); await page.mouse.up();
  const parent = await app((id) => window.rbxui.store.parentOf(id).id, r.small);
  assert.equal(parent, r.big);
});

await step('alt-drag duplicates', async () => {
  const before = await app(() => window.rbxui.store.allNodes().length);
  const id = await app(() => window.rbxui.store.selection[0]);
  const [sx, sy] = await app((id) => { const a = window.rbxui; const p = a.canvas.polyOf(id); const rc = a.canvas.wrap.getBoundingClientRect(); const [x, y] = a.canvas.toScreen((p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2); return [x + rc.left, y + rc.top]; }, id);
  await page.keyboard.down('Alt');
  await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 60, sy + 10, { steps: 6 }); await page.mouse.up();
  await page.keyboard.up('Alt');
  const after = await app(() => window.rbxui.store.allNodes().length);
  assert.ok(after > before, `${before} -> ${after}`);
});

await step('reorder inside UIListLayout by dragging', async () => {
  const r = await app(() => {
    const a = window.rbxui; const s = a.store; const scr = s.activeScreen;
    const list = a.cmd.insert('Frame', { parent: scr, props: { Position: [0, 900, 0, 100], Size: [0, 200, 0, 400], BackgroundColor3: '#222222' } });
    a.cmd.addModifier('UIListLayout', [list]);
    const ids = ['A', 'B', 'C'].map((n, i) => a.cmd.insert('Frame', { parent: list, props: { Size: [1, 0, 0, 60], LayoutOrder: i }, name: n }).id);
    s.select(ids[0]);
    return ids;
  });
  await page.waitForTimeout(300);
  const c = (id) => app((id) => { const a = window.rbxui; const p = a.canvas.polyOf(id); const rc = a.canvas.wrap.getBoundingClientRect(); const [x, y] = a.canvas.toScreen((p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2); return [x + rc.left, y + rc.top]; }, id);
  const [ax, ay] = await c(r[0]);
  const [cx, cy] = await c(r[2]);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(cx, cy + 12, { steps: 8 }); await page.mouse.up();
  const order = await app((ids) => ids.map((id) => window.rbxui.store.get(id).props.LayoutOrder), r);
  assert.ok(order[0] > order[1] && order[0] > order[2], JSON.stringify(order));
});

await step('paste RbxUI JSON from clipboard text', async () => {
  const n = await app(() => { const a = window.rbxui; a.store.select([]); const before = a.store.activeScreen.children.length; a.cmd.paste(JSON.stringify({ ClassName: 'TextLabel', Name: 'FromClaude', props: { Text: 'Hola', TextSize: 30 } })); return a.store.activeScreen.children.length - before; });
  assert.equal(n, 1);
});

await step('image import via assets API', async () => {
  const ok = await app(async () => {
    const a = window.rbxui;
    const c = document.createElement('canvas'); c.width = 64; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#f00'; g.fillRect(0, 0, 64, 32);
    const id = await a.assets.addDataUrl(c.toDataURL(), 'rojo');
    const node = a.insertImage(id);
    return node && node.props.Image === 'asset:' + id && a.store.doc.assets[id].width === 64;
  });
  assert.ok(ok);
});

await shot('final');
console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\nALL GOOD');
await browser.close();
srv.close();
process.exit(errors.length ? 1 : 0);
