// Image assets: import (drop/paste/pick), rbxassetid mapping, panel UI.
// Local images live in doc.assets as data URLs for preview; on export each one maps to
// the rbxassetid you get after uploading it to Roblox (Asset Manager > Bulk Import).

import { newId } from '../core/types.js';
import { h, popover, textInput, toast, download } from './ui.js';
import { icon } from './icons.js';
import { makeZip } from './zip.js';

export class Assets {
  constructor(app) {
    this.app = app;
    this.store = app.store;
  }

  get list() {
    return Object.entries(this.store.doc.assets || {}).map(([id, a]) => ({ id, ...a }));
  }

  resolve(contentId) {
    const s = String(contentId || '');
    const assets = this.store.doc.assets || {};
    if (s.startsWith('asset:')) {
      const a = assets[s.slice(6)];
      return a ? { id: s.slice(6), ...a } : null;
    }
    const m = s.match(/(\d{3,})/);
    if (m) {
      const e = Object.entries(assets).find(([, a]) => String(a.rbxId || '').replace(/\D/g, '') === m[1]);
      if (e) return { id: e[0], ...e[1] };
    }
    return null;
  }

  async addFile(file) {
    const url = await readAsDataURL(file);
    return this.addDataUrl(url, file.name.replace(/\.[^.]+$/, ''));
  }

  async addDataUrl(url, name = 'imagen', extra = {}) {
    const { width, height } = await imageSize(url);
    // de-duplicate identical images
    const existing = this.list.find((a) => a.url === url);
    if (existing) return existing.id;
    const id = newId('a');
    this.store.doc.assets[id] = { name, url, width, height, rbxId: '', ...extra };
    this.store.dirty = true;
    this.store.emit({ doc: true, assets: true });
    return id;
  }

  setRbxId(id, rbxId) {
    const a = this.store.doc.assets[id];
    if (!a) return;
    a.rbxId = String(rbxId || '').replace(/\D/g, '');
    this.store.dirty = true;
    this.store.emit({ doc: true, assets: true });
  }

  remove(id) {
    delete this.store.doc.assets[id];
    this.store.dirty = true;
    this.store.emit({ doc: true, assets: true });
  }

  usage(id) {
    const out = [];
    for (const n of this.store.allNodes()) {
      for (const k of ['Image', 'HoverImage', 'PressedImage']) if (n.props?.[k] === 'asset:' + id) out.push(n);
    }
    return out;
  }

  /** ZIP with every local image (for Roblox Studio Asset Manager > Bulk Import) + a manifest. */
  async downloadZip(onlyMissing = false) {
    const files = [];
    const used = new Set();
    for (const a of this.list) {
      if (onlyMissing && a.rbxId) continue;
      let base = safeName(a.name) || a.id;
      while (used.has(base)) base += '_';
      used.add(base);
      const [, mime, b64] = a.url.match(/^data:([^;]+);base64,(.*)$/) || [];
      if (!b64) continue;
      const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/bmp' ? 'bmp' : mime === 'image/tga' ? 'tga' : 'png';
      files.push({ name: `${base}.${ext}`, data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) });
    }
    if (!files.length) return toast('No hay imágenes pendientes');
    const manifest = this.list.map((a) => ({ file: safeName(a.name), assetKey: 'asset:' + a.id, rbxassetid: a.rbxId || null, size: [a.width, a.height] }));
    files.push({ name: 'rbxui-manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
    download(`${safeName(this.store.doc.name) || 'rbxui'}-imagenes.zip`, makeZip(files), 'application/zip');
  }

  // ---------- panel ----------
  renderPanel(host) {
    host.innerHTML = '';
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/bmp,image/gif,image/webp', multiple: true, style: { display: 'none' } });
    input.addEventListener('change', async () => {
      for (const f of input.files) await this.addFile(f);
      input.value = '';
    });
    const dz = h('div', { class: 'dropzone' }, 'Arrastra imágenes aquí o ', h('a', { href: '#', onclick: (e) => {
      e.preventDefault();
      input.click();
    } }, 'elige archivos'), h('div', { class: 'hint', style: { marginTop: '4px' } }, 'PNG recomendado (máx. 1024×1024 en Roblox). También puedes pegar con Ctrl+V.'));
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('over');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.remove('over');
      for (const f of e.dataTransfer.files) if (f.type.startsWith('image/')) await this.addFile(f);
    });
    const list = this.list;
    const missing = list.filter((a) => !a.rbxId).length;
    const zipBtn = h('button', { class: 'icon-btn', title: 'Descargar ZIP para subir a Roblox', html: icon('download') });
    zipBtn.addEventListener('click', () => this.downloadZip(false));
    host.append(h('div', { class: 'section-title' }, `Imágenes (${list.length})`, h('div', { class: 'actions' }, zipBtn)), dz, input);
    if (missing) host.append(h('div', { class: 'info-box', style: { margin: '0 10px 10px' } }, `${missing} imagen(es) sin rbxassetid. Súbelas a Roblox (Asset Manager › Bulk Import) y pega el ID en cada una para que se exporten.`));
    const grid = h('div', { class: 'asset-grid' });
    for (const a of list) {
      const el = h('div', { class: 'asset', draggable: 'true', title: `${a.name} · ${a.width}×${a.height}` }, h('img', { src: a.url, alt: '' }), h('div', { class: 'tag ' + (a.rbxId ? 'ok' : 'no') }, a.rbxId ? '✓ ' + a.name : a.name));
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-rbxui-asset', a.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      el.addEventListener('click', () => this.assetPopover(a, el));
      grid.append(el);
    }
    host.append(grid);
  }

  assetPopover(a, anchor) {
    const uses = this.usage(a.id);
    const body = h('div', { style: { padding: '10px', width: '260px', display: 'grid', gap: '8px' } },
      h('img', { src: a.url, style: { maxWidth: '100%', maxHeight: '140px', justifySelf: 'center', background: '#222', borderRadius: '4px' } }),
      h('div', { class: 'field col' }, h('label', {}, 'Nombre'), textInput(a.name, (v) => {
        this.store.doc.assets[a.id].name = v;
        this.store.emit({ doc: true, assets: true });
      })),
      h('div', { class: 'field col' }, h('label', {}, 'rbxassetid (tras subirla a Roblox)'), textInput(a.rbxId, (v) => this.setRbxId(a.id, v), { placeholder: 'p.ej. 1234567890' })),
      h('div', { class: 'hint' }, `${a.width}×${a.height}px · usada en ${uses.length} objeto(s)${a.width > 1024 || a.height > 1024 ? ' · ⚠ Roblox la reducirá a 1024px' : ''}`),
    );
    const useBtn = h('button', { class: 'btn small' }, 'Usar en la selección');
    useBtn.addEventListener('click', () => {
      const ids = this.store.selectedNodes().filter((n) => n.ClassName === 'ImageLabel' || n.ClassName === 'ImageButton').map((n) => n.id);
      if (ids.length) this.app.cmd.setProp(ids, 'Image', 'asset:' + a.id);
      else this.app.insertImage(a.id);
      pop.close();
    });
    const del = h('button', { class: 'btn small danger' }, 'Eliminar');
    del.addEventListener('click', () => {
      if (uses.length && !confirm(`Se usa en ${uses.length} objeto(s). ¿Eliminar igualmente?`)) return;
      this.remove(a.id);
      pop.close();
    });
    body.append(h('div', { style: { display: 'flex', gap: '6px' } }, useBtn, del));
    const pop = popover(body, anchor, { side: 'right' });
  }
}

export function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function imageSize(url) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => res({ width: 0, height: 0 });
    img.src = url;
  });
}

export const safeName = (s) => String(s || '').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
