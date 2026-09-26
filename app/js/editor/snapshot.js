// PNG snapshot of a screen: renders it offscreen and rasterizes the DOM through an
// SVG <foreignObject>, with every font used embedded as data URLs.

import { ScreenRenderer } from '../core/renderer.js';
import { FONT_FAMILIES, cssFamily, previewFamily } from '../core/fonts.js';
import { walk } from '../core/model.js';

const cache = new Map();
async function toDataUrl(url) {
  if (cache.has(url)) return cache.get(url);
  const blob = await (await fetch(url)).blob();
  const data = await new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(blob);
  });
  cache.set(url, data);
  return data;
}

export async function renderScreenPng(app, scr, scale = 1) {
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0' });
  document.body.append(host);
  const r = new ScreenRenderer(host, { doc: app.store.doc, mode: 'preview' });
  r.render(scr);
  await new Promise((res) => setTimeout(res, 50));
  await document.fonts.ready;
  r.render(scr);
  // fonts used
  const fams = new Set();
  walk(scr, (n) => {
    if (n.props?.FontFace) fams.add(n.props.FontFace.family);
  });
  let css = await (await fetch(new URL('../../css/rbx.css', import.meta.url))).text();
  for (const id of fams) {
    const fam = previewFamily(id);
    for (const face of fam.faces) {
      const url = new URL('../../fonts/' + face.file, import.meta.url).href;
      const data = await toDataUrl(url);
      css += `@font-face{font-family:"${cssFamily(id)}";src:url(${data});font-weight:${face.weight};font-style:${face.style === 'Italic' ? 'italic' : 'normal'}}`;
    }
  }
  void FONT_FAMILIES;
  const W = scr.design.width, H = scr.design.height;
  const bg = scr.design.background || '#3A6EA5';
  const html = new XMLSerializer().serializeToString(r.root);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}"><foreignObject width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;background:${bg}"><style>${css}</style>${html}</div></foreignObject></svg>`;
  r.destroy();
  host.remove();
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  c.getContext('2d').drawImage(img, 0, 0);
  return await new Promise((res) => c.toBlob(res, 'image/png'));
}
