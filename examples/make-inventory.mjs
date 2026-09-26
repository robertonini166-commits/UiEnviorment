// Example: building a simulator Inventory screen programmatically with the kit builders.
// node examples/make-inventory.mjs && node cli/rbxui.mjs render examples/inventory.json
import { writeFileSync } from 'node:fs';
import { studWindow, studButton, label, gloss, studs, PALETTE } from '../app/js/editor/templates.js';

const RARITY = [
  ['Común', ['#C9CED6', '#8C939E']], ['Poco común', ['#8CF25E', '#3FB52C']], ['Raro', ['#6FD0FF', '#2C86D6']],
  ['Épico', ['#D08CFF', '#8B3FD6']], ['Legendario', ['#FFD65E', '#FF8A00']], ['Mítico', ['#FF7AA8', '#E0245E']],
];
const stroke = (t = 3, mode = 'Border') => ({ ClassName: 'UIStroke', props: { Thickness: t, Color: '#000000', ApplyStrokeMode: mode, LineJoinMode: mode === 'Contextual' ? 'Round' : 'Miter' } });
const grad = ([a, b]) => ({ ClassName: 'UIGradient', props: { Color: [[0, a], [1, b]], Rotation: 90 } });

const tile = (i) => {
  const [rname, colors] = RARITY[i % RARITY.length];
  return {
    ClassName: 'ImageButton', Name: 'Slot' + (i + 1),
    props: { BackgroundColor3: '#FFFFFF', BackgroundTransparency: 0, Image: '', AutoButtonColor: false, LayoutOrder: i },
    buttonFx: { hover: 1.06, press: 0.92 },
    children: [grad(colors), stroke(3), ...gloss(), studs(37, 0.6),
      { ClassName: 'ImageLabel', Name: 'Icon', props: { AnchorPoint: [0.5, 0.5], Position: [0.5, 0, 0.45, 0], Size: [0.78, 0, 0.78, 0], BackgroundTransparency: 1, ScaleType: 'Fit', ZIndex: 4 } },
      label('Level', 'Nv ' + (1 + ((i * 7) % 30)), 16, { AnchorPoint: [0, 0], Position: [0, 5, 0, 3], Size: [0, 60, 0, 16], TextXAlignment: 'Left' }),
      label('Rarity', rname.toUpperCase(), 12, { AnchorPoint: [0.5, 1], Position: [0.5, 0, 1, -3], Size: [1, -6, 0, 14] }, 2),
      ...(i === 2 ? [{ ClassName: 'Frame', Name: 'Equipped', props: { AnchorPoint: [1, 0], Position: [1, -4, 0, 4], Size: [0, 22, 0, 22], BackgroundColor3: '#FFFFFF', ZIndex: 6 }, children: [grad(PALETTE.lime), stroke(2), label('Check', '✓', 16, { ZIndex: 7 })] }] : []),
    ],
  };
};

const win = studWindow('INVENTARIO', PALETTE.blue, 720, 440);
win.Name = 'InventoryWindow';
const body = win.children.find((c) => c.Name === 'Body');
body.children.push(
  {
    ClassName: 'ScrollingFrame', Name: 'Grid',
    props: { Size: [1, -200, 1, 0], BackgroundTransparency: 1, VerticalScrollBarInset: 'ScrollBar', CanvasSize: [0, 0, 0, 0], AutomaticCanvasSize: 'Y', ScrollBarThickness: 6, ScrollBarImageColor3: '#FFFFFF', ScrollBarImageTransparency: 0.3 },
    children: [{ ClassName: 'UIGridLayout', props: { CellSize: [0, 110, 0, 110], CellPadding: [0, 10, 0, 10], SortOrder: 'LayoutOrder', HorizontalAlignment: 'Center' } }, { ClassName: 'UIPadding', props: { PaddingTop: [0, 4], PaddingLeft: [0, 4] } }, ...Array.from({ length: 15 }, (_, i) => tile(i))],
  },
  {
    ClassName: 'Frame', Name: 'Side', props: { AnchorPoint: [1, 0], Position: [1, 0, 0, 0], Size: [0, 186, 1, 0], BackgroundTransparency: 1 },
    children: [
      { ClassName: 'UIListLayout', props: { Padding: [0, 10], HorizontalAlignment: 'Center', SortOrder: 'LayoutOrder' } },
      { ClassName: 'Frame', Name: 'Counter', props: { Size: [1, 0, 0, 44], BackgroundColor3: '#FFFFFF', LayoutOrder: 1 }, children: [grad(PALETTE.dark), stroke(3), label('Value', '24 / 50', 24)] },
      { ...studButton('EquipBest', PALETTE.lime, 'EQUIPAR MEJOR', 186, 52), props: { ...studButton('x', PALETTE.lime, '', 186, 52).props, AnchorPoint: [0, 0], Position: [0, 0, 0, 0], LayoutOrder: 2 }, buttonFx: { hover: 1.05, press: 0.92 } },
      { ...studButton('AutoSell', PALETTE.pink, 'VENTA AUTO', 186, 52), props: { ...studButton('x', PALETTE.pink, '', 186, 52).props, AnchorPoint: [0, 0], Position: [0, 0, 0, 0], LayoutOrder: 3 }, buttonFx: { hover: 1.05, press: 0.92 } },
      { ...studButton('Trade', PALETTE.orange, 'INTERCAMBIAR', 186, 52), props: { ...studButton('x', PALETTE.orange, '', 186, 52).props, AnchorPoint: [0, 0], Position: [0, 0, 0, 0], LayoutOrder: 4 }, buttonFx: { hover: 1.05, press: 0.92 } },
    ],
  },
);
// the close button closes this window
const close = win.children.find((c) => c.Name === 'Header').children.find((c) => c.Name === 'CloseButton');
close.interactions = [{ trigger: 'click', action: 'closeParent', animation: 'pop' }];
close.buttonFx = { hover: 1.08, press: 0.9 };

const doc = {
  format: 'rbxui', version: 1, name: 'Inventario',
  screens: [{ ClassName: 'ScreenGui', Name: 'InventoryUI', props: { ResetOnSpawn: false, ZIndexBehavior: 'Sibling' }, design: { device: 'studio', width: 1280, height: 720, background: '#4A7A3A' }, children: [win] }],
};
writeFileSync(new URL('./inventory.json', import.meta.url), JSON.stringify(doc, null, 1));
console.log('examples/inventory.json');
