import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument } from '../../app/js/core/model.js';
import { layoutScreen } from '../../app/js/core/layout.js';

const screen = (children, w = 1000, h = 500) => normalizeDocument({ screens: [{ ClassName: 'ScreenGui', Name: 'S', design: { width: w, height: h }, children }] }).doc.screens[0];
const box = (s, name) => {
  const boxes = layoutScreen(s);
  let found = null;
  const visit = (n) => { if (n.Name === name) found = boxes.get(n.id); n.children.forEach(visit); };
  visit(s);
  return found;
};

test('UDim2 position/size with AnchorPoint', () => {
  const s = screen([{ ClassName: 'Frame', Name: 'A', props: { AnchorPoint: [0.5, 0.5], Position: [0.5, 10, 0.5, -20], Size: [0.2, 50, 0, 100] } }]);
  const b = box(s, 'A');
  assert.equal(b.w, 250);
  assert.equal(b.h, 100);
  assert.equal(b.x, 500 + 10 - 125);
  assert.equal(b.y, 250 - 20 - 50);
});

test('SizeConstraint RelativeXX and UIAspectRatioConstraint', () => {
  const s = screen([
    { ClassName: 'Frame', Name: 'XX', props: { Size: [0.1, 0, 0.1, 0], SizeConstraint: 'RelativeXX' } },
    { ClassName: 'Frame', Name: 'AR', props: { Size: [0.5, 0, 0.5, 0] }, children: [{ ClassName: 'UIAspectRatioConstraint', props: { AspectRatio: 1 } }] },
    { ClassName: 'Frame', Name: 'SC', props: { Size: [1, 0, 1, 0] }, children: [{ ClassName: 'UISizeConstraint', props: { MaxSize: [300, 200] } }] },
  ]);
  assert.deepEqual([box(s, 'XX').w, box(s, 'XX').h], [100, 100]);
  assert.deepEqual([box(s, 'AR').w, box(s, 'AR').h], [250, 250]);
  assert.deepEqual([box(s, 'SC').w, box(s, 'SC').h], [300, 200]);
});

test('UIPadding shrinks the children area', () => {
  const s = screen([{ ClassName: 'Frame', Name: 'P', props: { Size: [0, 200, 0, 100] }, children: [
    { ClassName: 'UIPadding', props: { PaddingLeft: [0, 10], PaddingTop: [0, 5], PaddingRight: [0.1, 0], PaddingBottom: [0, 5] } },
    { ClassName: 'Frame', Name: 'C', props: { Size: [1, 0, 1, 0] } },
  ] }]);
  const c = box(s, 'C');
  assert.deepEqual([c.x, c.y, c.w, c.h], [10, 5, 170, 90]);
});

test('UIListLayout vertical with padding, alignment and LayoutOrder', () => {
  const s = screen([{ ClassName: 'Frame', Name: 'L', props: { Size: [0, 300, 0, 300] }, children: [
    { ClassName: 'UIListLayout', props: { Padding: [0, 10], HorizontalAlignment: 'Center', VerticalAlignment: 'Center', SortOrder: 'LayoutOrder' } },
    { ClassName: 'Frame', Name: 'B', props: { Size: [0, 100, 0, 50], LayoutOrder: 2 } },
    { ClassName: 'Frame', Name: 'A', props: { Size: [0, 50, 0, 50], LayoutOrder: 1 } },
  ] }]);
  const a = box(s, 'A'), b = box(s, 'B');
  // total height 110 -> starts at (300-110)/2 = 95
  assert.deepEqual([a.x, a.y], [125, 95]);
  assert.deepEqual([b.x, b.y], [100, 155]);
});

test('UIListLayout horizontal flex Fill distributes space', () => {
  const s = screen([{ ClassName: 'Frame', Name: 'L', props: { Size: [0, 320, 0, 40] }, children: [
    { ClassName: 'UIListLayout', props: { FillDirection: 'Horizontal', Padding: [0, 10], HorizontalFlex: 'Fill' } },
    { ClassName: 'Frame', Name: 'A', props: { Size: [0, 50, 1, 0], LayoutOrder: 1 } },
    { ClassName: 'Frame', Name: 'B', props: { Size: [0, 50, 1, 0], LayoutOrder: 2 } },
    { ClassName: 'Frame', Name: 'C', props: { Size: [0, 50, 1, 0], LayoutOrder: 3 } },
  ] }]);
  const [a, b, c] = ['A', 'B', 'C'].map((n) => box(s, n));
  assert.equal(a.w, 100);
  assert.equal(b.x, 110);
  assert.equal(c.x + c.w, 320);
});

test('UIListLayout wraps to new lines', () => {
  const kids = Array.from({ length: 5 }, (_, i) => ({ ClassName: 'Frame', Name: 'K' + i, props: { Size: [0, 100, 0, 30], LayoutOrder: i } }));
  const s = screen([{ ClassName: 'Frame', Name: 'L', props: { Size: [0, 250, 0, 300] }, children: [
    { ClassName: 'UIListLayout', props: { FillDirection: 'Horizontal', Wraps: true, Padding: [0, 10] } }, ...kids] }]);
  assert.deepEqual([box(s, 'K2').x, box(s, 'K2').y], [0, 40]);
  assert.deepEqual([box(s, 'K4').x, box(s, 'K4').y], [0, 80]);
});

test('UIGridLayout cells, padding, max cells and centering', () => {
  const kids = Array.from({ length: 5 }, (_, i) => ({ ClassName: 'Frame', Name: 'G' + i, props: { LayoutOrder: i } }));
  const s = screen([{ ClassName: 'Frame', Name: 'Grid', props: { Size: [0, 400, 0, 400] }, children: [
    { ClassName: 'UIGridLayout', props: { CellSize: [0, 100, 0, 50], CellPadding: [0, 10, 0, 5], FillDirectionMaxCells: 2, HorizontalAlignment: 'Center' } }, ...kids] }]);
  const g0 = box(s, 'G0'), g1 = box(s, 'G1'), g2 = box(s, 'G2');
  assert.deepEqual([g0.w, g0.h], [100, 50]);
  assert.equal(g0.x, (400 - 210) / 2);
  assert.equal(g1.x - g0.x, 110);
  assert.equal(g2.y, 55);
});

test('Folder children lay out in the folder parent area', () => {
  const s = screen([{ ClassName: 'Frame', Name: 'F', props: { Position: [0, 100, 0, 100], Size: [0, 200, 0, 200] }, children: [
    { ClassName: 'Folder', Name: 'Group', children: [{ ClassName: 'Frame', Name: 'Inner', props: { Position: [0.5, 0, 0.5, 0], Size: [0, 10, 0, 10] } }] }] }]);
  const inner = box(s, 'Inner');
  assert.deepEqual([inner.ax, inner.ay], [200, 200]);
});

test('AutomaticSize grows a container to its children', () => {
  const s = screen([{ ClassName: 'Frame', Name: 'Auto', props: { Size: [0, 50, 0, 50], AutomaticSize: 'XY' }, children: [
    { ClassName: 'Frame', Name: 'Big', props: { Position: [0, 10, 0, 10], Size: [0, 200, 0, 120] } }] }]);
  const a = box(s, 'Auto');
  assert.deepEqual([a.w, a.h], [210, 130]);
});
