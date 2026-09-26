import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { normalizeDocument } from '../../app/js/core/model.js';
import { exportRbxmx } from '../../app/js/export/rbxmx.js';
import { exportLuau, luaString } from '../../app/js/export/luau.js';
import { buildRuntime } from '../../app/js/export/runtime.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/shop.json', import.meta.url)));

test('rbxmx contains every instance with typed properties', () => {
  const { doc } = normalizeDocument(fixture);
  const { xml, report } = exportRbxmx(doc);
  assert.ok(xml.startsWith('<roblox'));
  assert.equal((xml.match(/<Item /g) || []).length, report.count);
  assert.match(xml, /<Font name="FontFace"><Family><url>rbxasset:\/\/fonts\/families\/Montserrat\.json<\/url><\/Family><Weight>900<\/Weight><Style>Normal<\/Style><\/Font>/);
  assert.match(xml, /<UDim2 name="Size"><XS>0<\/XS><XO>640<\/XO><YS>0<\/YS><YO>440<\/YO><\/UDim2>/);
  assert.match(xml, /<token name="ApplyStrokeMode">1<\/token>/);
  assert.match(xml, /<ColorSequence name="Color">0 /);
});

test('local images without rbxassetid are reported, not exported as data URLs', () => {
  const { doc } = normalizeDocument({ assets: { a1: { name: 'coin', url: 'data:image/png;base64,AAAA', width: 10, height: 10 } }, screens: [{ ClassName: 'ScreenGui', children: [{ ClassName: 'ImageLabel', Name: 'Coin', props: { Image: 'asset:a1' } }] }] });
  const { xml, report } = exportRbxmx(doc);
  assert.ok(!xml.includes('data:image'));
  assert.ok(report.missingAssets.has('a1'));
  doc.assets.a1.rbxId = '123456';
  assert.match(exportRbxmx(doc).xml, /rbxassetid:\/\/123456/);
});

test('luau strings are escaped', () => {
  assert.equal(luaString('a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
});

test('luau export guards beta properties with pcall', () => {
  const { doc } = normalizeDocument({ screens: [{ ClassName: 'ScreenGui', children: [{ ClassName: 'Frame', children: [{ ClassName: 'UICorner', props: { CornerRadius: [0, 8], TopLeftRadius: [0, 0] } }] }] }] });
  const { code } = exportLuau(doc);
  assert.match(code, /pcall\(function\(\) i\d+\.TopLeftRadius = UDim\.new\(0, 0\)/);
});

test('runtime script lists interactions', () => {
  const { doc } = normalizeDocument({ screens: [{ ClassName: 'ScreenGui', children: [
    { ClassName: 'TextButton', Name: 'Open', interactions: [{ action: 'toggle', target: 'Win', animation: 'pop' }], buttonFx: { hover: 1.1, press: 0.9 } },
    { ClassName: 'Frame', Name: 'Win', props: { Visible: false } },
  ] }] });
  const src = buildRuntime(doc.screens[0]);
  assert.match(src, /path = \{"Open"\}, trigger = "click", action = "toggle", target = \{"Win"\}/);
  assert.match(src, /hover = 1.1, press = 0.9/);
});

// Validation with the real Roblox serializers (skipped when the tools are missing)
const rbxcheck = new URL('../../tools/rbxcheck/target/release/rbxcheck', import.meta.url).pathname;
const lune = (() => { try { execFileSync('lune', ['--version']); return true; } catch { return false; } })();

test('rbxmx validates with rbx-dom (Rojo) and Luau builds identical instances (Lune)', { skip: !existsSync(rbxcheck) && !lune }, () => {
  const { doc } = normalizeDocument(fixture);
  mkdirSync('out', { recursive: true });
  const { xml } = exportRbxmx(doc, { extra: () => [{ ClassName: 'LocalScript', Name: 'RbxUIController', source: '-- test' }] });
  writeFileSync('out/test.rbxmx', xml);
  writeFileSync('out/test.luau', exportLuau(doc, { extra: () => [{ ClassName: 'LocalScript', Name: 'RbxUIController', source: '-- test' }] }).code);
  if (existsSync(rbxcheck)) assert.match(execFileSync(rbxcheck, ['out/test.rbxmx'], { encoding: 'utf8' }), /OK/);
  if (lune) assert.match(execFileSync('lune', ['run', 'tests/luau-check.luau', 'out/test.luau', 'out/test.rbxmx'], { encoding: 'utf8' }), /OK/);
});

test('rbxmx round trip (export -> import -> export) is lossless', async () => {
  const { importRbxmx } = await import('../../app/js/export/import-rbxmx.js');
  const { MiniDOMParser } = await import('../../app/js/core/minixml.js');
  const { doc } = normalizeDocument(fixture);
  const a = exportRbxmx(doc).xml;
  const { screens, warnings } = importRbxmx(a, MiniDOMParser);
  assert.equal(warnings.length, 0);
  const b = exportRbxmx({ ...doc, screens }).xml;
  const strip = (x) => x.replace(/ referent="[^"]*"/g, '');
  assert.equal(strip(b), strip(a));
});

test('every screen template normalizes, lints clean and exports', async () => {
  const { SCREEN_TEMPLATES } = await import('../../app/js/editor/screen-templates.js');
  const { lintDocument } = await import('../../app/js/core/lint.js');
  for (const t of SCREEN_TEMPLATES) {
    const { doc, warnings } = normalizeDocument({ screens: [t.make()] });
    assert.deepEqual(warnings, [], t.id);
    assert.deepEqual(lintDocument(doc).filter((l) => l.level === 'error'), [], t.id);
    const { xml } = exportRbxmx(doc);
    if (existsSync(rbxcheck)) {
      writeFileSync(`out/tpl-${t.id}.rbxmx`, xml);
      assert.match(execFileSync(rbxcheck, [`out/tpl-${t.id}.rbxmx`], { encoding: 'utf8' }), /OK/);
    }
  }
});
