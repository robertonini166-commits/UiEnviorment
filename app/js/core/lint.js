// Design/export checks ("revisión automática"). Pure: works in the browser and in Node (CLI).

import { walk } from './model.js';
import { isGuiObject, isText, FONT_BY_ID } from './schema.js';
import { contrastRatio } from './types.js';
import { DEVICES } from './model.js';

export function lintDocument(doc, { screens } = {}) {
  const out = [];
  const add = (level, node, message) => out.push({ level, id: node?.id, name: node?.Name, message });
  for (const scr of screens || doc.screens) {
    walk(scr, (n, parent) => {
      if (parent) {
        const same = parent.children.filter((c) => c.Name === n.Name);
        if (same.length > 1 && same[0] === n && (n.interactions?.length || isGuiObject(n.ClassName))) {
          add('warn', n, `${parent.Name} tiene ${same.length} hijos llamados "${n.Name}". Ponles nombres únicos para que los scripts los encuentren.`);
        }
      }
      const P = n.props || {};
      if (isText(n.ClassName)) {
        if (P.TextSize > 100) add('error', n, `${n.Name}: TextSize ${P.TextSize} > 100 (máximo de Roblox).`);
        if (!P.TextScaled && P.TextSize < 9 && (P.Text || '').trim()) add('warn', n, `${n.Name}: texto de ${P.TextSize}px, ilegible en móvil (mínimo recomendado 12-14).`);
        const fam = FONT_BY_ID[P.FontFace?.family];
        if (!fam) add('error', n, `${n.Name}: fuente "${P.FontFace?.family}" no es de Roblox.`);
        if (P.BackgroundTransparency < 0.3 && P.TextTransparency < 0.5 && !n.children.some((c) => c.ClassName === 'UIStroke' || c.ClassName === 'UIGradient')) {
          const cr = contrastRatio(P.TextColor3, P.BackgroundColor3);
          if (cr < 2.5) add('warn', n, `${n.Name}: poco contraste entre texto y fondo (${cr.toFixed(1)}:1).`);
        }
      }
      if (n.ClassName === 'UIGradient') {
        if ((P.Color?.length || 0) > 20 || (P.Transparency?.length || 0) > 20) add('error', n, `${parent?.Name}: UIGradient con más de 20 puntos (límite de Roblox).`);
        if (parent && (parent.ClassName === 'ScrollingFrame' || parent.ClassName === 'TextBox')) add('warn', n, `${parent.Name}: Roblox no aplica UIGradient a ${parent.ClassName}.`);
      }
      if (n.ClassName === 'UICorner' && parent?.ClassName === 'ScrollingFrame') add('warn', n, `${parent.Name}: UICorner no funciona en ScrollingFrame (usa un Frame padre con ClipsDescendants).`);
      for (const k of ['Image', 'HoverImage', 'PressedImage']) {
        const v = P[k];
        if (v && String(v).startsWith('asset:')) {
          const a = doc.assets?.[String(v).slice(6)];
          if (!a) add('error', n, `${n.Name}.${k}: imagen local que ya no existe.`);
        }
      }
      if (isGuiObject(n.ClassName) && parent?.ClassName === 'ScreenGui' && P.Size) {
        const [xs, xo, ys, yo] = P.Size;
        const phone = DEVICES.phone;
        if (xs === 0 && ys === 0 && (xo > phone.width || yo > phone.height)) {
          add('info', n, `${n.Name}: tamaño fijo ${xo}×${yo}px, más grande que un móvil (${phone.width}×${phone.height}). Considera Scale o UIScale/UIAspectRatioConstraint.`);
        }
      }
    });
  }
  return out;
}
