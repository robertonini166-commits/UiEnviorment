// Drives the MCP server over stdio like Claude would.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const p = spawn('node', ['cli/mcp.mjs'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '';
const waiting = new Map();
p.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    const m = JSON.parse(line);
    waiting.get(m.id)?.(m);
  }
});
let nextId = 1;
const call = (method, params) => new Promise((res) => {
  const id = nextId++;
  waiting.set(id, res);
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});

const init = await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
assert.equal(init.result.serverInfo.name, 'rbxui');
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const list = await call('tools/list', {});
console.log('tools:', list.result.tools.map((t) => t.name).join(', '));
const tpl = await call('tools/call', { name: 'rbxui_template', arguments: { name: 'daily' } });
const doc = JSON.parse(tpl.result.content[0].text);
assert.equal(doc.screens[0].Name, 'DailyUI');
const val = await call('tools/call', { name: 'rbxui_validate', arguments: { document: doc } });
console.log('validate:', val.result.content[0].text.split('\n')[0]);
const ren = await call('tools/call', { name: 'rbxui_render', arguments: { document: doc, node: 'ClaimButton', scale: 2 } });
assert.equal(ren.result.content[0].type, 'image');
writeFileSync('/tmp/claude-0/shots/mcp-render.png', Buffer.from(ren.result.content[0].data, 'base64'));
const exp = await call('tools/call', { name: 'rbxui_export', arguments: { document: doc, format: 'luau' } });
assert.match(exp.result.content[0].text, /Instance\.new\("ScreenGui"\)/);
assert.match(exp.result.content[0].text, /RbxUIController/);
const bad = await call('tools/call', { name: 'rbxui_render', arguments: {} });
assert.equal(bad.result.isError, true);
console.log('MCP OK');
p.stdin.end();
