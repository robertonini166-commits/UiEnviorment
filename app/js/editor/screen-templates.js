// Full-screen templates (each returns a ScreenGui tree) built from the Stud Style kit.

import { studWindow, studButton, label, gloss, studs, PALETTE, hudButton, currency, progressBar, toggle, itemCard, rewardTile } from './templates.js';
import { SAMPLE } from './sample.js';

const stroke = (t = 3, mode = 'Border') => ({ ClassName: 'UIStroke', props: { Thickness: t, Color: '#000000', ApplyStrokeMode: mode, LineJoinMode: mode === 'Contextual' ? 'Round' : 'Miter' } });
const grad = ([a, b], rot = 90) => ({ ClassName: 'UIGradient', props: { Color: [[0, a], [1, b]], Rotation: rot } });
const screen = (Name, children, background = '#3A6EA5') => ({ ClassName: 'ScreenGui', Name, props: { ResetOnSpawn: false, ZIndexBehavior: 'Sibling' }, design: { device: 'studio', width: 1280, height: 720, background, autoScale: true }, children });
const fx = (n, hover = 1.06, press = 0.92) => Object.assign(n, { buttonFx: { hover, press } });
const place = (n, props) => Object.assign(n, { props: Object.assign({}, n.props, props) });
const closeWith = (win) => {
  const c = win.children.find((x) => x.Name === 'Header').children.find((x) => x.Name === 'CloseButton');
  c.interactions = [{ trigger: 'click', action: 'closeParent', animation: 'pop' }];
  fx(c, 1.08, 0.9);
  return win;
};
const bodyOf = (win) => win.children.find((c) => c.Name === 'Body');

export const RARITY = [
  ['Común', ['#C9CED6', '#8C939E']], ['Poco común', ['#8CF25E', '#3FB52C']], ['Raro', ['#6FD0FF', '#2C86D6']],
  ['Épico', ['#D08CFF', '#8B3FD6']], ['Legendario', ['#FFD65E', '#FF8A00']], ['Mítico', ['#FF7AA8', '#E0245E']],
];

export function inventoryScreen() {
  const tile = (i) => {
    const [rname, colors] = RARITY[i % RARITY.length];
    return fx({
      ClassName: 'ImageButton', Name: 'Slot' + (i + 1),
      props: { BackgroundColor3: '#FFFFFF', BackgroundTransparency: 0, Image: '', AutoButtonColor: false, LayoutOrder: i },
      children: [grad(colors), stroke(3), ...gloss(), studs(37, 0.6),
        { ClassName: 'ImageLabel', Name: 'Icon', props: { AnchorPoint: [0.5, 0.5], Position: [0.5, 0, 0.45, 0], Size: [0.78, 0, 0.78, 0], BackgroundTransparency: 1, ScaleType: 'Fit', ZIndex: 4 } },
        label('Level', 'Nv ' + (1 + ((i * 7) % 30)), 16, { Position: [0, 5, 0, 3], Size: [0, 60, 0, 16], TextXAlignment: 'Left' }),
        label('Rarity', rname.toUpperCase(), 12, { AnchorPoint: [0.5, 1], Position: [0.5, 0, 1, -3], Size: [1, -6, 0, 14] }, 2)],
    });
  };
  const win = closeWith(studWindow('INVENTARIO', PALETTE.blue, 720, 440));
  win.Name = 'InventoryWindow';
  const side = (name, colors, text, order) => fx(place(studButton(name, colors, text, 186, 52), { AnchorPoint: [0, 0], Position: [0, 0, 0, 0], LayoutOrder: order }), 1.05);
  bodyOf(win).children.push(
    { ClassName: 'ScrollingFrame', Name: 'Grid', props: { Size: [1, -200, 1, 0], BackgroundTransparency: 1, VerticalScrollBarInset: 'ScrollBar', CanvasSize: [0, 0, 0, 0], AutomaticCanvasSize: 'Y', ScrollBarThickness: 6, ScrollBarImageColor3: '#FFFFFF', ScrollBarImageTransparency: 0.3 },
      children: [{ ClassName: 'UIGridLayout', props: { CellSize: [0, 110, 0, 110], CellPadding: [0, 10, 0, 10], SortOrder: 'LayoutOrder', HorizontalAlignment: 'Center' } }, { ClassName: 'UIPadding', props: { PaddingTop: [0, 4] } }, ...Array.from({ length: 15 }, (_, i) => tile(i))] },
    { ClassName: 'Frame', Name: 'Side', props: { AnchorPoint: [1, 0], Position: [1, 0, 0, 0], Size: [0, 186, 1, 0], BackgroundTransparency: 1 },
      children: [{ ClassName: 'UIListLayout', props: { Padding: [0, 10], HorizontalAlignment: 'Center', SortOrder: 'LayoutOrder' } },
        { ClassName: 'Frame', Name: 'Counter', props: { Size: [1, 0, 0, 44], BackgroundColor3: '#FFFFFF', LayoutOrder: 1 }, children: [grad(PALETTE.dark), stroke(3), label('Value', '24 / 50', 24)] },
        side('EquipBest', PALETTE.lime, 'EQUIPAR MEJOR', 2), side('AutoSell', PALETTE.pink, 'VENTA AUTO', 3), side('Trade', PALETTE.orange, 'INTERCAMBIAR', 4)] },
  );
  return screen('InventoryUI', [win], '#4A7A3A');
}

export function dailyScreen() {
  const win = closeWith(studWindow('RECOMPENSA DIARIA', PALETTE.purple, 760, 400));
  win.Name = 'DailyWindow';
  const rewards = [['100', PALETTE.lime], ['250', PALETTE.blue], ['500', PALETTE.purple], ['1K', PALETTE.orange], ['2.5K', PALETTE.pink], ['5K', PALETTE.red], ['¡COFRE!', PALETTE.yellow]];
  const row = { ClassName: 'Frame', Name: 'Days', props: { Size: [1, 0, 0, 150], BackgroundTransparency: 1 },
    children: [{ ClassName: 'UIListLayout', props: { FillDirection: 'Horizontal', Padding: [0, 8], HorizontalFlex: 'Fill', SortOrder: 'LayoutOrder', VerticalAlignment: 'Center' } },
      ...rewards.map(([r, c], i) => {
        const t = rewardTile(i + 1, r, c);
        t.props.LayoutOrder = i;
        t.props.Size = [0, 90, 0, i === 6 ? 150 : 130];
        if (i < 2) t.children.push({ ClassName: 'Frame', Name: 'Claimed', props: { Size: [1, 0, 1, 0], BackgroundColor3: '#000000', BackgroundTransparency: 0.45, ZIndex: 8 }, children: [label('Check', '✓', 40, { ZIndex: 9 })] });
        return t;
      })] };
  const streak = label('Streak', 'Racha: <font color="#FFD93D">3 días</font> · vuelve mañana para más', 22, { RichText: true, Position: [0, 0, 0, 166], Size: [1, 0, 0, 30] });
  const claim = fx(place(studButton('ClaimButton', PALETTE.lime, 'RECLAMAR', 260, 64), { AnchorPoint: [0.5, 1], Position: [0.5, 0, 1, 0] }));
  bodyOf(win).children.push(row, streak, claim);
  return screen('DailyUI', [win], '#3A6EA5');
}

export function rebirthScreen() {
  const win = closeWith(studWindow('RENACER', PALETTE.lime, 640, 420));
  win.Name = 'RebirthWindow';
  const stat = (name, from, to, colors, order) => ({
    ClassName: 'Frame', Name: name, props: { Size: [1, 0, 0, 56], BackgroundColor3: '#FFFFFF', LayoutOrder: order },
    children: [grad(PALETTE.dark), stroke(3), studs(37, 0.85),
      { ClassName: 'Frame', Name: 'Badge', props: { Position: [0, 8, 0.5, 0], AnchorPoint: [0, 0.5], Size: [0, 150, 0, 40], BackgroundColor3: '#FFFFFF', ZIndex: 3 }, children: [grad(colors), stroke(3), ...gloss(4), label('Name', name.toUpperCase(), 18, { ZIndex: 6 })] },
      label('From', from, 24, { Position: [0, 170, 0, 0], Size: [0, 150, 1, 0], TextColor3: '#B8B8B8' }),
      label('Arrow', '➜', 26, { Position: [0, 320, 0, 0], Size: [0, 40, 1, 0] }),
      label('To', to, 28, { Position: [0, 360, 0, 0], Size: [1, -370, 1, 0], TextColor3: '#8CF25E' })],
  });
  bodyOf(win).children.push(
    { ClassName: 'Frame', Name: 'Stats', props: { Size: [1, 0, 0, 190], BackgroundTransparency: 1 }, children: [{ ClassName: 'UIListLayout', props: { Padding: [0, 10], SortOrder: 'LayoutOrder' } }, stat('Dinero', 'x1', 'x2', PALETTE.yellow, 1), stat('Velocidad', 'x1.0', 'x1.5', PALETTE.blue, 2), stat('Suerte', '+0%', '+10%', PALETTE.purple, 3)] },
    place(progressBar(0.8), { Position: [0, 0, 0, 204], Size: [1, 0, 0, 34] }),
    fx(place(studButton('RebirthNow', PALETTE.lime, 'RENACER', 240, 60), { AnchorPoint: [0, 1], Position: [0, 0, 1, 0] })),
    fx(place(studButton('SkipButton', PALETTE.pink, 'SALTAR  R$ 49', 240, 60), { AnchorPoint: [1, 1], Position: [1, 0, 1, 0] })),
  );
  return screen('RebirthUI', [win], '#6B4A9A');
}

export function settingsScreen() {
  const win = closeWith(studWindow('AJUSTES', PALETTE.orange, 520, 420));
  win.Name = 'SettingsWindow';
  const row = (name, on, order) => ({
    ClassName: 'Frame', Name: name.replace(/\W/g, ''), props: { Size: [1, 0, 0, 56], BackgroundColor3: '#FFFFFF', LayoutOrder: order },
    children: [grad(PALETTE.dark), stroke(3), studs(37, 0.88), label('Label', name.toUpperCase(), 22, { Position: [0, 16, 0, 0], Size: [1, -130, 1, 0], TextXAlignment: 'Left' }),
      place(toggle(on), { AnchorPoint: [1, 0.5], Position: [1, -10, 0.5, 0], ZIndex: 4 })],
  });
  bodyOf(win).children.push({ ClassName: 'Frame', Name: 'List', props: { Size: [1, 0, 1, 0], BackgroundTransparency: 1 }, children: [{ ClassName: 'UIListLayout', props: { Padding: [0, 10], SortOrder: 'LayoutOrder' } }, row('Música', true, 1), row('Efectos', true, 2), row('Mostrar daño', false, 3), row('Modo rendimiento', false, 4), row('Notificaciones', true, 5)] });
  return screen('SettingsUI', [win], '#2F6F8F');
}

export function shopScreen() {
  const { screens } = SAMPLE();
  return screens[0];
}

export function hudScreen() {
  const s = SAMPLE().screens[0];
  s.children = s.children.filter((c) => c.Name !== 'ShopWindow');
  s.Name = 'HUD';
  // the shop window isn't part of this template: drop interactions that pointed to it
  const strip = (n) => {
    if (n.interactions) n.interactions = n.interactions.filter((i) => (i.targetName || i.target) !== 'ShopWindow');
    (n.children || []).forEach(strip);
  };
  strip(s);
  return s;
}

export function storeScreen() {
  const win = closeWith(studWindow('TIENDA PREMIUM', PALETTE.pink, 780, 460));
  win.Name = 'PremiumWindow';
  const pass = (name, price, colors, i) => {
    const c = itemCard(name, 'R$ ' + price, colors);
    c.Name = 'Pass' + (i + 1);
    c.props.LayoutOrder = i;
    const buy = c.children.find((x) => x.Name === 'BuyButton');
    buy.children[0] = { ClassName: 'UIGradient', props: { Color: [[0, PALETTE.pink[0]], [1, PALETTE.pink[1]]], Rotation: 90 } };
    fx(buy);
    return c;
  };
  bodyOf(win).children.push({ ClassName: 'Frame', Name: 'Passes', props: { Size: [1, 0, 1, 0], BackgroundTransparency: 1 },
    children: [{ ClassName: 'UIGridLayout', props: { CellSize: [0, 170, 0, 176], CellPadding: [0, 14, 0, 14], HorizontalAlignment: 'Center', VerticalAlignment: 'Center', SortOrder: 'LayoutOrder' } },
      pass('VIP', '299', PALETTE.yellow, 0), pass('x2 Dinero', '149', PALETTE.lime, 1), pass('x2 Suerte', '199', PALETTE.purple, 2), pass('Auto Clic', '99', PALETTE.blue, 3),
      pass('+50 Slots', '79', PALETTE.orange, 4), pass('Pack Inicial', '49', PALETTE.teal, 5), pass('Mascota Épica', '399', PALETTE.red, 6), pass('Saltar Nivel', '25', PALETTE.pink, 7)] });
  return screen('PremiumUI', [win], '#20304A');
}

export const SCREEN_TEMPLATES = [
  { id: 'shop', name: 'Tienda + HUD', make: shopScreen },
  { id: 'inventory', name: 'Inventario', make: inventoryScreen },
  { id: 'daily', name: 'Recompensa diaria', make: dailyScreen },
  { id: 'rebirth', name: 'Renacer (Rebirth)', make: rebirthScreen },
  { id: 'premium', name: 'Tienda premium', make: storeScreen },
  { id: 'settings', name: 'Ajustes', make: settingsScreen },
  { id: 'hud', name: 'Solo HUD', make: hudScreen },
];
