// Built-in UI kit ("Stud Style" simulator look). Every template is a plain Roblox
// instance tree (Frames, TextLabels, UIStroke, UIGradient...), so it exports 1:1.

export const PALETTE = {
  lime: ['#B8FF5E', '#43C22C'], pink: ['#FF8AD0', '#E0479E'], red: ['#FF5B5B', '#C81E1E'], orange: ['#FFC04D', '#FF7A00'],
  blue: ['#6FD0FF', '#2C86D6'], purple: ['#D08CFF', '#8B3FD6'], yellow: ['#FFE45E', '#F2A900'], teal: ['#5EF2D8', '#1BA88F'],
  body: ['#31333B', '#292B32'], dark: ['#23252B', '#1B1C21'],
};

const F = (weight = 'Heavy', family = 'Montserrat') => ({ family, weight, style: 'Normal' });
// Border strokes use Miter (square corners, Stud Style); text outlines use Round (no spikes on sharp glyphs).
const stroke = (t = 3, mode = 'Border', color = '#000000', extra = {}) => ({ ClassName: 'UIStroke', props: { Thickness: t, Color: color, ApplyStrokeMode: mode, LineJoinMode: mode === 'Contextual' ? 'Round' : 'Miter', ...extra } });
const grad = ([a, b], rot = 90) => ({ ClassName: 'UIGradient', props: { Color: [[0, a], [1, b]], Rotation: rot } });
const corner = (r) => ({ ClassName: 'UICorner', props: { CornerRadius: Array.isArray(r) ? r : [0, r] } });

/**
 * "Glass" look of the Stud Style (all real Roblox instances):
 *  Gloss   upper half lighter, hard cut at 48 %
 *  Shine   thin white line at the top
 *  Reflex  two diagonal reflections at 112° (white frame + UIGradient transparency bands)
 *  Bevel   dark strip at the bottom
 */
export function gloss(z = 2, { reflex = true } = {}) {
  const out = [
    { ClassName: 'Frame', Name: 'Gloss', props: { Size: [1, 0, 0.48, 0], BackgroundColor3: '#FFFFFF', BackgroundTransparency: 0.8, ZIndex: z } },
    { ClassName: 'Frame', Name: 'Shine', props: { Size: [1, 0, 0, 2], BackgroundColor3: '#FFFFFF', BackgroundTransparency: 0.35, ZIndex: z } },
    { ClassName: 'Frame', Name: 'Bevel', props: { AnchorPoint: [0, 1], Position: [0, 0, 1, 0], Size: [1, 0, 0, 4], BackgroundColor3: '#000000', BackgroundTransparency: 0.72, ZIndex: z } },
  ];
  if (reflex) {
    out.push({
      ClassName: 'Frame', Name: 'Reflex', props: { Size: [1, 0, 1, 0], BackgroundColor3: '#FFFFFF', BackgroundTransparency: 0, ZIndex: z },
      children: [{ ClassName: 'UIGradient', props: { Rotation: 112, Color: [[0, '#FFFFFF'], [1, '#FFFFFF']],
        Transparency: [[0, 1], [0.2, 1], [0.21, 0.82], [0.27, 0.82], [0.28, 1], [0.31, 1], [0.32, 0.9], [0.35, 0.9], [0.36, 1], [1, 1]] } }],
    });
  }
  return out;
}

/** Thin light rim inside colored pieces ("reborde interior claro fino"). */
export const innerRim = (t = 1.5, transparency = 0.55) => ({ ClassName: 'UIStroke', Name: 'InnerRim', props: { Thickness: t, Color: '#FFFFFF', Transparency: transparency, ApplyStrokeMode: 'Border', BorderStrokePosition: 'Inner', LineJoinMode: 'Miter', ZIndex: 2 } });

/** Black drop shadow for big titles: a sibling TextLabel placed behind, 3px lower. */
export function textShadow(lbl, dy = 3) {
  const shadow = JSON.parse(JSON.stringify(lbl));
  shadow.Name = lbl.Name + 'Shadow';
  const P = shadow.props;
  const pos = P.Position || [0, 0, 0, 0];
  P.Position = [pos[0], pos[1], pos[2], pos[3] + dy];
  P.TextColor3 = '#000000';
  P.TextTransparency = 0.35;
  P.ZIndex = (lbl.props.ZIndex ?? 5) - 1;
  shadow.children = (shadow.children || []).map((c) => (c.ClassName === 'UIStroke' ? { ...c, props: { ...c.props, Transparency: 0.35 } } : c));
  return shadow;
}

export const studs = (tile = 37, transparency = 0.55, z = 2) => ({
  ClassName: 'ImageLabel', Name: 'Studs',
  props: { Size: [1, 0, 1, 0], BackgroundTransparency: 1, Image: 'asset:studs', ScaleType: 'Tile', TileSize: [0, tile, 0, tile], ImageTransparency: transparency, ZIndex: z },
});

export function label(Name, Text, size, props = {}, strokeT = null) {
  return {
    ClassName: 'TextLabel', Name,
    props: { Text, TextSize: size, FontFace: F(), TextColor3: '#FFFFFF', BackgroundTransparency: 1, Size: [1, 0, 1, 0], ZIndex: 5, ...props },
    children: [stroke(strokeT ?? (size >= 24 ? 3 : 2), 'Contextual')],
  };
}

/** Stud-style button: TextButton (no own text) + gradient + stroke + gloss + studs + child label. */
export function studButton(name, colors, text, w = 180, hgt = 56, extra = {}) {
  return {
    ClassName: 'TextButton', Name: name,
    props: { Size: [0, w, 0, hgt], BackgroundColor3: '#FFFFFF', Text: '', AutoButtonColor: false, AnchorPoint: [0.5, 0.5], Position: [0.5, 0, 0.5, 0], ...extra },
    children: [grad(colors), stroke(2.5), innerRim(), ...gloss(), studs(37, 0.55), label('Label', text, Math.round(hgt * 0.42))],
  };
}

/** Pink Robux button with the price badge in the corner (the Robux logo is an image you add). */
export function robuxButton(text = 'SALTAR', price = '49', w = 200, hgt = 56) {
  const b = studButton('RobuxButton', PALETTE.pink, text, w, hgt);
  b.children.push({
    ClassName: 'Frame', Name: 'PriceBadge', props: { AnchorPoint: [1, 0], Position: [1, 8, 0, -12], Size: [0, 74, 0, 26], BackgroundColor3: '#FFFFFF', ZIndex: 7 },
    children: [grad(PALETTE.dark), stroke(2), innerRim(1, 0.7),
      { ClassName: 'ImageLabel', Name: 'RobuxIcon', props: { AnchorPoint: [0, 0.5], Position: [0, 5, 0.5, 0], Size: [0, 18, 0, 18], BackgroundTransparency: 1, ScaleType: 'Fit', ZIndex: 8 } },
      label('Price', price, 16, { Position: [0, 24, 0, 0], Size: [1, -28, 1, 0], TextXAlignment: 'Left', ZIndex: 8 }, 2)],
  });
  return b;
}

export function studWindow(title = 'TIENDA', colors = PALETTE.orange, w = 560, hgt = 380) {
  return {
    ClassName: 'Frame', Name: title.charAt(0) + title.slice(1).toLowerCase().replace(/\s+/g, '') + 'Window',
    props: { AnchorPoint: [0.5, 0.5], Position: [0.5, 0, 0.5, 0], Size: [0, w, 0, hgt], BackgroundColor3: '#FFFFFF' },
    children: [
      grad(PALETTE.body), stroke(4), studs(37, 0.85, 1),
      { ClassName: 'UIShadow', props: { Color: '#000000', Transparency: 0.45, BlurRadius: [0, 0], Offset: [0, 0, 0, 8], ZIndex: -1 } },
      {
        ClassName: 'Frame', Name: 'Header', props: { Size: [1, 0, 0, 50], BackgroundColor3: '#FFFFFF', ZIndex: 3 },
        children: [grad(colors), stroke(3), ...gloss(4), studs(56, 0.55, 4),
          { ClassName: 'Frame', Name: 'IconSlot', props: { Position: [0, 10, 0.5, 0], AnchorPoint: [0, 0.5], Size: [0, 40, 0, 40], BackgroundTransparency: 1, ZIndex: 5 } },
          textShadow(label('Title', title, 26, { Position: [0, 58, 0, 0], Size: [1, -120, 1, 0], TextXAlignment: 'Left', ZIndex: 6 })),
          label('Title', title, 26, { Position: [0, 58, 0, 0], Size: [1, -120, 1, 0], TextXAlignment: 'Left', ZIndex: 6 }),
          closeButton()],
      },
      { ClassName: 'Frame', Name: 'Body', props: { Position: [0, 0, 0, 50], Size: [1, 0, 1, -50], BackgroundTransparency: 1, ZIndex: 2 }, children: [{ ClassName: 'UIPadding', props: { PaddingTop: [0, 14], PaddingBottom: [0, 14], PaddingLeft: [0, 14], PaddingRight: [0, 14] } }] },
    ],
  };
}

export function closeButton() {
  return {
    ClassName: 'TextButton', Name: 'CloseButton',
    props: { AnchorPoint: [1, 0.5], Position: [1, -8, 0.5, 0], Size: [0, 38, 0, 38], BackgroundColor3: '#FFFFFF', Text: '', AutoButtonColor: false, ZIndex: 6 },
    children: [grad(PALETTE.red), stroke(2.5, 'Border', '#000000'), { ClassName: 'UIStroke', Name: 'OrangeRim', props: { Thickness: 2, Color: '#FF9F1C', ApplyStrokeMode: 'Border', BorderStrokePosition: 'Inner', LineJoinMode: 'Miter', ZIndex: 2 } }, ...gloss(7, { reflex: false }), label('X', 'X', 24, { ZIndex: 8 })],
  };
}

export function itemCard(name = 'Espada', price = '1.2K', colors = PALETTE.blue) {
  return {
    ClassName: 'Frame', Name: 'ItemCard', props: { Size: [0, 150, 0, 180], BackgroundColor3: '#FFFFFF' },
    children: [grad(colors), stroke(2.5), innerRim(), ...gloss(), studs(37, 0.55),
      { ClassName: 'ImageLabel', Name: 'Icon', props: { AnchorPoint: [0.5, 0], Position: [0.5, 0, 0, 10], Size: [0.7, 0, 0.7, 0], SizeConstraint: 'RelativeXX', BackgroundTransparency: 1, Image: '', ScaleType: 'Fit', ZIndex: 4 } },
      label('ItemName', name, 20, { Position: [0, 0, 1, -72], Size: [1, 0, 0, 24] }),
      { ...studButton('BuyButton', PALETTE.lime, price, 0, 34, { AnchorPoint: [0.5, 1], Position: [0.5, 0, 1, -8], Size: [1, -18, 0, 34], ZIndex: 5 }) },
    ],
  };
}

export function hudButton(text = 'SHOP', colors = PALETTE.orange) {
  return {
    ClassName: 'ImageButton', Name: text.charAt(0) + text.slice(1).toLowerCase() + 'Button',
    props: { Size: [0, 78, 0, 78], BackgroundColor3: '#FFFFFF', BackgroundTransparency: 0, Image: '', AutoButtonColor: false },
    children: [grad(colors), stroke(2.5), innerRim(), ...gloss(), studs(37, 0.55),
      { ClassName: 'ImageLabel', Name: 'Icon', props: { AnchorPoint: [0.5, 0.5], Position: [0.5, 0, 0.44, 0], Size: [0.72, 0, 0.72, 0], BackgroundTransparency: 1, ScaleType: 'Fit', ZIndex: 4 } },
      label('Label', text, 15, { AnchorPoint: [0.5, 1], Position: [0.5, 0, 1, 4], Size: [1, 8, 0, 20] }),
    ],
  };
}

export function currency(amount = '12,450', colors = PALETTE.yellow) {
  return {
    ClassName: 'Frame', Name: 'Currency', props: { Size: [0, 220, 0, 46], BackgroundColor3: '#FFFFFF' },
    children: [grad(PALETTE.dark), stroke(3), studs(37, 0.8),
      { ClassName: 'Frame', Name: 'IconBg', props: { Position: [0, -10, 0.5, 0], AnchorPoint: [0, 0.5], Size: [0, 54, 0, 54], BackgroundColor3: '#FFFFFF', ZIndex: 3 }, children: [grad(colors), stroke(3), ...gloss(4), label('Symbol', '$', 26, { ZIndex: 6 })] },
      label('Amount', amount, 26, { Position: [0, 54, 0, 0], Size: [1, -64, 1, 0], TextXAlignment: 'Left' }),
      { ...studButton('AddButton', PALETTE.lime, '+', 34, 34, { AnchorPoint: [1, 0.5], Position: [1, -6, 0.5, 0], ZIndex: 5 }) },
    ],
  };
}

export function progressBar(pct = 0.62, colors = PALETTE.lime) {
  return {
    ClassName: 'Frame', Name: 'ProgressBar', props: { Size: [0, 320, 0, 34], BackgroundColor3: '#1B1C21' },
    children: [stroke(3),
      { ClassName: 'Frame', Name: 'Fill', props: { Size: [pct, 0, 1, 0], BackgroundColor3: '#FFFFFF', ZIndex: 2 }, children: [grad(colors), ...gloss(3)] },
      label('Value', `${Math.round(pct * 100)}%`, 20, { ZIndex: 6 }),
    ],
  };
}

export function tabs(names = ['Items', 'Mascotas', 'Pases'], colors = PALETTE.blue) {
  return {
    ClassName: 'Frame', Name: 'Tabs', props: { Size: [0, 420, 0, 44], BackgroundTransparency: 1 },
    children: [{ ClassName: 'UIListLayout', props: { FillDirection: 'Horizontal', Padding: [0, 8], HorizontalFlex: 'Fill', SortOrder: 'LayoutOrder' } },
      ...names.map((n, i) => ({ ...studButton('Tab' + (i + 1), i === 0 ? colors : PALETTE.body, n.toUpperCase(), 120, 44, { AnchorPoint: [0, 0], Position: [0, 0, 0, 0], LayoutOrder: i }) }))],
  };
}

export function toggle(on = true) {
  return {
    ClassName: 'TextButton', Name: 'Toggle', props: { Size: [0, 86, 0, 40], BackgroundColor3: '#FFFFFF', Text: '', AutoButtonColor: false },
    children: [grad(on ? PALETTE.lime : PALETTE.red), stroke(3), ...gloss(),
      { ClassName: 'Frame', Name: 'Knob', props: { AnchorPoint: [on ? 1 : 0, 0.5], Position: [on ? 1 : 0, on ? -5 : 5, 0.5, 0], Size: [0, 30, 0, 30], BackgroundColor3: '#FFFFFF', ZIndex: 4 }, children: [stroke(3), grad(['#FFFFFF', '#D5D5D5'])] },
      label('State', on ? 'ON' : 'OFF', 16, { Position: [on ? 0 : 0.35, on ? 8 : 0, 0, 0], Size: [0.6, 0, 1, 0], ZIndex: 5 }),
    ],
  };
}

export function title(text = '¡NUEVO!', colors = PALETTE.yellow) {
  return {
    ClassName: 'TextLabel', Name: 'Title',
    props: { Text: text, TextSize: 56, FontFace: F('Heavy'), TextColor3: '#FFFFFF', BackgroundTransparency: 1, Size: [0, 360, 0, 70], Rotation: -3 },
    children: [grad(colors), stroke(5, 'Contextual')],
  };
}

export function notification(text = '¡Has conseguido 500 monedas!') {
  return {
    ClassName: 'Frame', Name: 'Notification', props: { Size: [0, 380, 0, 64], BackgroundColor3: '#FFFFFF' },
    children: [grad(PALETTE.dark), stroke(3), studs(37, 0.85),
      { ClassName: 'Frame', Name: 'Accent', props: { Size: [0, 10, 1, 0], BackgroundColor3: '#FFFFFF', ZIndex: 2 }, children: [grad(PALETTE.lime)] },
      label('Message', text, 20, { Position: [0, 24, 0, 0], Size: [1, -36, 1, 0], TextXAlignment: 'Left', TextWrapped: true }),
    ],
  };
}

export function rewardTile(day = 1, reward = '100', colors = PALETTE.purple) {
  return {
    ClassName: 'Frame', Name: 'Day' + day, props: { Size: [0, 110, 0, 130], BackgroundColor3: '#FFFFFF' },
    children: [grad(colors), stroke(3), ...gloss(), studs(37, 0.55),
      label('Day', `DÍA ${day}`, 18, { Position: [0, 0, 0, 6], Size: [1, 0, 0, 22] }),
      { ClassName: 'ImageLabel', Name: 'Icon', props: { AnchorPoint: [0.5, 0.5], Position: [0.5, 0, 0.5, 4], Size: [0, 56, 0, 56], BackgroundTransparency: 1, ScaleType: 'Fit', ZIndex: 4 } },
      label('Reward', reward, 22, { AnchorPoint: [0, 1], Position: [0, 0, 1, -6], Size: [1, 0, 0, 26] }),
    ],
  };
}

export function darkPanel(w = 300, hgt = 200) {
  return { ClassName: 'Frame', Name: 'Panel', props: { Size: [0, w, 0, hgt], BackgroundColor3: '#FFFFFF' }, children: [grad(PALETTE.body), stroke(3), studs(37, 0.85)] };
}

export function roundedButton(text = 'JUGAR', colors = PALETTE.lime) {
  return {
    ClassName: 'TextButton', Name: 'PlayButton', props: { Size: [0, 220, 0, 64], BackgroundColor3: '#FFFFFF', Text: '', AutoButtonColor: false },
    children: [corner(14), grad(colors), stroke(4), { ClassName: 'UIShadow', props: { Color: '#000000', Transparency: 0.5, BlurRadius: [0, 0], Offset: [0, 0, 0, 6], ZIndex: -1 } }, label('Label', text, 30)],
  };
}

export const KIT = [
  { id: 'window', name: 'Ventana', make: () => studWindow('TIENDA', PALETTE.orange) },
  { id: 'window-blue', name: 'Ventana azul', make: () => studWindow('INVENTARIO', PALETTE.blue) },
  { id: 'btn-lime', name: 'Botón comprar', make: () => studButton('BuyButton', PALETTE.lime, 'COMPRAR') },
  { id: 'btn-pink', name: 'Botón Robux', make: () => robuxButton('SALTAR', '49') },
  { id: 'btn-red', name: 'Botón cerrar', make: () => closeButton() },
  { id: 'btn-round', name: 'Botón redondeado', make: () => roundedButton() },
  { id: 'card', name: 'Tarjeta de item', make: () => itemCard() },
  { id: 'hud', name: 'Botón HUD', make: () => hudButton() },
  { id: 'currency', name: 'Divisa', make: () => currency() },
  { id: 'progress', name: 'Barra de progreso', make: () => progressBar() },
  { id: 'tabs', name: 'Pestañas', make: () => tabs() },
  { id: 'toggle', name: 'Interruptor', make: () => toggle() },
  { id: 'title', name: 'Título', make: () => title() },
  { id: 'notification', name: 'Notificación', make: () => notification() },
  { id: 'reward', name: 'Recompensa diaria', make: () => rewardTile() },
  { id: 'panel', name: 'Panel oscuro', make: () => darkPanel() },
];

/** Procedural stud tile (our own art; free to redistribute). Returns a PNG data URL. */
export function makeStudTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size * 0.27, cx = size / 2, cy = size / 2;
  // subtle cast shadow (bottom-right) and highlight (top-left); stud body mostly transparent
  // so the parent's color shows through (Roblox has no overlay blend, only alpha).
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath();
  g.arc(cx + size * 0.035, cy + size * 0.045, r, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  const body = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  body.addColorStop(0, 'rgba(255,255,255,0.75)');
  body.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  body.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = body;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = size * 0.012;
  g.beginPath();
  g.arc(cx, cy, r * 0.97, Math.PI * 0.9, Math.PI * 1.6);
  g.stroke();
  return c.toDataURL('image/png');
}

/** Built-in kit images (our own art), available to every document as `asset:<key>`. */
export const KIT_ASSETS = { studs: { name: 'Studs', file: 'app/img/kit/studs.png', width: 128, height: 128 } };

/** Ensures kit assets used by templates exist in the document (as data URLs so they travel with it). */
export async function ensureKitAssets(app) {
  const doc = app.store.doc;
  const map = {};
  for (const [key, k] of Object.entries(KIT_ASSETS)) {
    if (!doc.assets[key]) {
      const url = new URL('../../' + k.file.replace(/^app\//, ''), import.meta.url).href;
      const blob = await (await fetch(url)).blob();
      const data = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(blob);
      });
      doc.assets[key] = { name: k.name, url: data, width: k.width, height: k.height, rbxId: '', kit: key };
      app.store.emit({ doc: true, assets: true });
    }
    map[key] = key;
  }
  return map;
}

/** Replaces "asset:studs" placeholders with real asset ids. */
export function bindKitAssets(tree, map) {
  const visit = (n) => {
    for (const k of ['Image']) if (n.props?.[k] && String(n.props[k]).startsWith('asset:') && map[String(n.props[k]).slice(6)]) n.props[k] = 'asset:' + map[String(n.props[k]).slice(6)];
    (n.children || []).forEach(visit);
  };
  visit(tree);
  return tree;
}
