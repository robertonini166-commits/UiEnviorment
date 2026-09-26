import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument, createNode, compactNode } from '../../app/js/core/model.js';
import { normValue, getPropDef, resolveFontFamily, canParent } from '../../app/js/core/schema.js';
import { parseRichText } from '../../app/js/core/text.js';
import { lintDocument } from '../../app/js/core/lint.js';

test('normalization accepts shorthand values', () => {
  const { doc, warnings } = normalizeDocument({ screens: [{ ClassName: 'ScreenGui', Name: 'S', children: [
    { ClassName: 'TextLabel', Name: 'T', Text: 'hi', TextColor3: [255, 0, 0], FontFace: 'GothamBold', Size: { X: { Scale: 1, Offset: 0 }, Y: { Scale: 0, Offset: 40 } }, TextXAlignment: 'Enum.TextXAlignment.Left' },
  ] }] });
  const t = doc.screens[0].children[0];
  assert.equal(t.props.TextColor3, '#FF0000');
  assert.deepEqual(t.props.FontFace, { family: 'Montserrat', weight: 'Bold', style: 'Normal' });
  assert.deepEqual(t.props.Size, [1, 0, 0, 40]);
  assert.equal(t.props.TextXAlignment, 'Left');
  assert.equal(warnings.length, 0);
});

test('unknown properties / classes produce warnings', () => {
  const { warnings } = normalizeDocument({ screens: [{ ClassName: 'ScreenGui', children: [{ ClassName: 'Frame', props: { Foo: 1 } }, { ClassName: 'Part' }] }] });
  assert.equal(warnings.length, 2);
});

test('CornerRadius shorthand sets the four corners', () => {
  const n = createNode('UICorner', { CornerRadius: [0.5, 0] });
  assert.deepEqual(n.props.TopLeftRadius, [0.5, 0]);
  assert.deepEqual(n.props.BottomRightRadius, [0.5, 0]);
});

test('interaction targets resolve by name and path', () => {
  const { doc } = normalizeDocument({ screens: [{ ClassName: 'ScreenGui', children: [
    { ClassName: 'TextButton', Name: 'Open', interactions: [{ action: 'open', target: 'Win' }, { action: 'close', target: 'Win/Header' }] },
    { ClassName: 'Frame', Name: 'Win', children: [{ ClassName: 'Frame', Name: 'Header' }] },
  ] }] });
  const [btn, win] = doc.screens[0].children;
  assert.equal(btn.interactions[0].target, win.id);
  assert.equal(btn.interactions[1].target, win.children[0].id);
});

test('fonts: only official Roblox families', () => {
  assert.equal(resolveFontFamily('rbxasset://fonts/families/FredokaOne.json'), 'FredokaOne');
  assert.equal(resolveFontFamily('Luckiest Guy'), 'LuckiestGuy');
  assert.equal(resolveFontFamily('Comic Sans MS'), null);
  assert.deepEqual(normValue(getPropDef('TextLabel', 'FontFace'), { family: 'Papyrus' }).family, 'Montserrat');
});

test('parent rules', () => {
  assert.ok(canParent('UIStroke', 'TextLabel'));
  assert.ok(canParent('UIGradient', 'UIStroke'));
  assert.ok(!canParent('Frame', 'UICorner'));
  assert.ok(!canParent('UICorner', 'ScrollingFrame'));
  assert.ok(!canParent('ScreenGui', 'Frame'));
});

test('rich text parsing', () => {
  const base = { family: 'Montserrat', weight: 'Regular', size: 20, color: '#FFFFFF' };
  const segs = parseRichText('A <b>B</b> <font color="#FF0000" size="30">C</font><br/>D &amp; <stroke thickness="2">E</stroke><!-- x -->', base, true);
  const byText = Object.fromEntries(segs.filter((s) => s.text.trim()).map((s) => [s.text.trim(), s.style]));
  assert.equal(byText.B.weight, 'Bold');
  assert.equal(byText.C.color, '#FF0000');
  assert.equal(byText.C.size, 30);
  assert.equal(byText['D &'].weight, 'Regular');
  assert.equal(byText.E.stroke.thickness, 2);
  assert.ok(segs.some((s) => s.text === '\n'));
  assert.ok(!segs.some((s) => s.text.includes('x')));
});

test('compactNode drops default props', () => {
  const n = createNode('Frame', { BackgroundColor3: '#123456' });
  const c = compactNode(n);
  assert.deepEqual(Object.keys(c.props), ['BackgroundColor3']);
});

test('lint catches common mistakes', () => {
  const { doc } = normalizeDocument({ screens: [{ ClassName: 'ScreenGui', children: [
    { ClassName: 'TextLabel', Name: 'Big', props: { TextSize: 150, Text: 'x' } },
    { ClassName: 'Frame', Name: 'Dup' }, { ClassName: 'Frame', Name: 'Dup' },
    { ClassName: 'ScrollingFrame', Name: 'S', children: [{ ClassName: 'UIGradient' }] },
  ] }] });
  const msgs = lintDocument(doc).map((l) => l.message).join('\n');
  assert.match(msgs, /TextSize 150/);
  assert.match(msgs, /Dup/);
});
