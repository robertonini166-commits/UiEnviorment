// Starter document shown on first launch: a simulator-style HUD + shop window with
// working interactions (Shop button opens the window, X closes it).

import { studWindow, studButton, itemCard, hudButton, currency, PALETTE, progressBar } from './templates.js';

export function SAMPLE() {
  const shop = studWindow('TIENDA', PALETTE.orange, 600, 400);
  shop.Name = 'ShopWindow';
  shop.props.Visible = true;
  const body = shop.children.find((c) => c.Name === 'Body');
  const cards = [['Espada', '1.2K', PALETTE.red], ['Mascota', '850', PALETTE.blue], ['Poción', '99', PALETTE.lime], ['Cofre', '2.5K', PALETTE.yellow], ['Aura', '5K', PALETTE.purple], ['Trail', '450', PALETTE.pink]];
  body.children.push({
    ClassName: 'ScrollingFrame', Name: 'Items',
    props: { Size: [1, 0, 1, 0], BackgroundTransparency: 1, CanvasSize: [0, 0, 0, 0], AutomaticCanvasSize: 'Y', ScrollBarThickness: 6, ScrollBarImageColor3: '#FFFFFF', ScrollBarImageTransparency: 0.4 },
    children: [
      { ClassName: 'UIGridLayout', props: { CellSize: [0, 170, 0, 150], CellPadding: [0, 12, 0, 12], HorizontalAlignment: 'Center', SortOrder: 'LayoutOrder' } },
      ...cards.map(([n, p, c], i) => {
        const card = itemCard(n, p, c);
        card.Name = 'Card' + (i + 1);
        card.props.LayoutOrder = i;
        return card;
      }),
    ],
  });
  const close = shop.children.find((c) => c.Name === 'Header').children.find((c) => c.Name === 'CloseButton');
  close.interactions = [{ trigger: 'click', action: 'closeParent', animation: 'pop', duration: 0.2 }];
  close.buttonFx = { hover: 1.08, press: 0.9 };

  const hud = {
    ClassName: 'Frame', Name: 'HUDLeft', props: { AnchorPoint: [0, 0.5], Position: [0, 16, 0.5, 0], Size: [0, 84, 0, 280], BackgroundTransparency: 1 },
    children: [{ ClassName: 'UIListLayout', props: { Padding: [0, 12], VerticalAlignment: 'Center', HorizontalAlignment: 'Center', SortOrder: 'LayoutOrder' } },
      ...[['SHOP', PALETTE.orange], ['REBIRTH', PALETTE.lime], ['DAILY', PALETTE.blue]].map(([t, c], i) => {
        const b = hudButton(t, c);
        b.props.LayoutOrder = i;
        b.props.AnchorPoint = [0.5, 0.5];
        b.buttonFx = { hover: 1.06, press: 0.9 };
        return b;
      })],
  };
  const top = currency('12,450');
  top.props.AnchorPoint = [1, 0];
  top.props.Position = [1, -20, 0, 16];
  const xp = progressBar(0.62);
  xp.props.AnchorPoint = [0.5, 1];
  xp.props.Position = [0.5, 0, 1, -18];
  const buy = studButton('PlayButton', PALETTE.pink, 'x2 DINERO', 190, 54, { AnchorPoint: [1, 1], Position: [1, -20, 1, -18] });
  buy.buttonFx = { hover: 1.06, press: 0.9 };
  const doc = {
    format: 'rbxui', version: 1, name: 'Mi juego simulador',
    screens: [{ ClassName: 'ScreenGui', Name: 'MainUI', props: { ResetOnSpawn: false, ZIndexBehavior: 'Sibling' }, design: { device: 'studio', width: 1280, height: 720, background: '#3A6EA5' }, children: [hud, top, xp, buy, shop] }],
  };
  // wire the SHOP button to the window (ids are resolved after normalization by name)
  hud.children[1].interactions = [{ trigger: 'click', action: 'toggle', targetName: 'ShopWindow', animation: 'pop', duration: 0.22, blur: true, exclusive: true }];
  return doc;
}
