// Generates tests/fixtures/shop.json — a "Stud Style" shop window built only with Roblox instances.
import { writeFileSync } from 'node:fs';
const F = (family, weight) => ({ family, weight, style: 'Normal' });
const stroke = (t = 3, mode = 'Contextual', extra = {}) => ({ ClassName: 'UIStroke', props: Object.assign({ Thickness: t, Color: '#000000', ApplyStrokeMode: mode, LineJoinMode: 'Miter' }, extra) });
const grad = (a, b, rot = 90) => ({ ClassName: 'UIGradient', props: { Color: [[0, a], [1, b]], Rotation: rot } });
const label = (Name, Text, size, props = {}, kids = []) => ({ ClassName: 'TextLabel', Name, props: Object.assign({ Text, TextSize: size, FontFace: F('Montserrat', 'Heavy'), TextColor3: '#FFFFFF', BackgroundTransparency: 1 }, props), children: [stroke(size > 20 ? 3 : 2), ...kids] });
const gloss = () => ({ ClassName: 'Frame', Name: 'Gloss', props: { Size: [1, 0, 0.48, 0], BackgroundColor3: '#FFFFFF', BackgroundTransparency: 0.78, ZIndex: 2 } });
const colors = [['#FF5E5E', '#D62C2C', 'Espada', '1.2K'], ['#5EC8FF', '#2C86D6', 'Mascota', '850'], ['#8CF25E', '#3FB52C', 'Poción', '99'], ['#FFD25E', '#E5A21A', 'Cofre', '2.5K'], ['#C77DFF', '#8B3FD6', 'Aura', '5K'], ['#FF8FD2', '#E0479E', 'Trail', '450']];
const card = ([a, b, name, price], i) => ({
  ClassName: 'Frame', Name: 'Card' + (i + 1), props: { BackgroundColor3: '#FFFFFF', LayoutOrder: i },
  children: [grad(a, b), stroke(3, 'Border'), gloss(),
    { ClassName: 'Frame', Name: 'IconSlot', props: { AnchorPoint: [0.5, 0], Position: [0.5, 0, 0, 12], Size: [0, 84, 0, 84], BackgroundColor3: '#000000', BackgroundTransparency: 0.75, ZIndex: 3 }, children: [{ ClassName: 'UICorner', props: { CornerRadius: [0.5, 0] } }] },
    label('ItemName', name, 20, { Position: [0, 0, 0, 100], Size: [1, 0, 0, 24], ZIndex: 3 }),
    { ClassName: 'TextButton', Name: 'BuyButton', props: { AnchorPoint: [0.5, 1], Position: [0.5, 0, 1, -8], Size: [1, -20, 0, 34], BackgroundColor3: '#FFFFFF', Text: price + ' R$', TextSize: 20, FontFace: F('Montserrat', 'Heavy'), TextColor3: '#FFFFFF', ZIndex: 3 },
      children: [grad('#B8FF5E', '#5ED42C'), stroke(2, 'Border'), stroke(2, 'Contextual')] },
  ],
});
const doc = {
  name: 'Shop test',
  screens: [{ ClassName: 'ScreenGui', Name: 'ShopUI', design: { width: 1280, height: 720, background: '#3A6EA5' }, children: [
    { ClassName: 'Frame', Name: 'ShopWindow', props: { AnchorPoint: [0.5, 0.5], Position: [0.5, 0, 0.5, 0], Size: [0, 640, 0, 440], BackgroundColor3: '#FFFFFF' },
      children: [grad('#31333B', '#292B32'), stroke(4, 'Border'), { ClassName: 'UIShadow', props: { BlurRadius: [0, 24], Offset: [0, 0, 0, 10], Transparency: 0.5 } },
        { ClassName: 'Frame', Name: 'Header', props: { Size: [1, 0, 0, 58], BackgroundColor3: '#FFFFFF' }, children: [grad('#FFC04D', '#FF7A00'), stroke(3, 'Border'), gloss(),
          label('Title', 'TIENDA', 34, { Position: [0, 20, 0, 0], Size: [1, -90, 1, 0], TextXAlignment: 'Left', ZIndex: 3 }),
          { ClassName: 'TextButton', Name: 'CloseButton', props: { AnchorPoint: [1, 0.5], Position: [1, -10, 0.5, 0], Size: [0, 42, 0, 42], BackgroundColor3: '#FF3B3B', Text: 'X', TextSize: 28, FontFace: F('Montserrat', 'Heavy'), TextColor3: '#FFFFFF', ZIndex: 3 }, children: [stroke(3, 'Border', { Color: '#FF9F1C' }), stroke(3, 'Contextual')] }] },
        { ClassName: 'ScrollingFrame', Name: 'Items', props: { Position: [0, 18, 0, 76], Size: [1, -36, 1, -94], BackgroundTransparency: 1, CanvasSize: [0, 0, 0, 0], ScrollBarThickness: 6, AutomaticCanvasSize: 'Y' },
          children: [{ ClassName: 'UIGridLayout', props: { CellSize: [0, 186, 0, 166], CellPadding: [0, 14, 0, 14], HorizontalAlignment: 'Center' } }, ...colors.map(card)] },
      ] },
    { ClassName: 'Frame', Name: 'HUD', props: { Position: [0, 16, 0.5, 0], AnchorPoint: [0, 0.5], Size: [0, 90, 0, 300], BackgroundTransparency: 1 }, children: [
      { ClassName: 'UIListLayout', props: { Padding: [0, 12], VerticalAlignment: 'Center', HorizontalAlignment: 'Center' } },
      ...[['Shop', '#FFB23E', '#FF7A00'], ['Rebirth', '#7DF25E', '#2FB52C'], ['Daily', '#5EC8FF', '#2C86D6']].map(([n, a, b], i) => ({ ClassName: 'TextButton', Name: n + 'Button', props: { Size: [0, 84, 0, 84], BackgroundColor3: '#FFFFFF', Text: n.toUpperCase(), TextSize: 16, FontFace: F('Montserrat', 'Heavy'), TextColor3: '#FFFFFF', TextYAlignment: 'Bottom', LayoutOrder: i, Rotation: i === 1 ? -6 : 0 }, children: [grad(a, b), stroke(3, 'Border'), stroke(2, 'Contextual'), { ClassName: 'UIPadding', props: { PaddingBottom: [0, 6] } }, gloss()] })) ] },
    label('Coins', '<font color="#FFD93D">$</font> 12,450', 36, { RichText: true, Position: [1, -20, 0, 20], AnchorPoint: [1, 0], Size: [0, 260, 0, 44], TextXAlignment: 'Right' }),
  ] }],
};
writeFileSync(new URL('./shop.json', import.meta.url), JSON.stringify(doc, null, 1));
console.log('ok');
