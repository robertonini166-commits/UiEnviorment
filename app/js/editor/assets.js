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

  /** Imports many files (e.g. an icon pack folder), sequentially to keep memory low. */
  async addFiles(files) {
    const imgs = [...files].filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
    let n = 0;
    for (const f of imgs) {
      await this.addFile(f);
      n++;
    }
    if (n > 1) toast(`${n} imágenes importadas`);
    return n;
  }

  /** Reads dropped folders recursively (DataTransferItem.webkitGetAsEntry). */
  async filesFromDrop(dt) {
    const out = [];
    const walkEntry = (entry) => new Promise((res) => {
      if (entry.isFile) entry.file((f) => {
        out.push(f);
        res();
      }, res);
      else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readAll = () => reader.readEntries(async (ents) => {
          if (!ents.length) return res();
          for (const e of ents) await walkEntry(e);
          readAll();
        }, res);
        readAll();
      } else res();
    });
    const entries = [...(dt.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (entries.length) for (const e of entries) await walkEntry(e);
    else out.push(...dt.files);
    return out;
  }

  /** Bulk rbxassetid mapping: lines like "Coin = 123456" or "Coin,123456" or "Coin: rbxassetid://123". */
  bulkIds(text) {
    let n = 0;
    const byName = new Map(this.list.map((a) => [a.name.toLowerCase(), a.id]));
    for (const line of String(text).split(/\r?\n/)) {
      const m = line.match(/^\s*(.+?)\s*[=:,;\t]\s*(?:rbxassetid:\/\/)?(\d{3,})\s*$/);
      if (!m) continue;
      const id = byName.get(m[1].toLowerCase().replace(/\.(png|jpe?g|webp|bmp)$/i, ''));
      if (id) {
        this.store.doc.assets[id].rbxId = m[2];
        n++;
      }
    }
    this.store.dirty = true;
    this.store.emit({ doc: true, assets: true });
    return n;
  }

  // ---------- panel ----------
  renderPanel(host) {
    host.innerHTML = '';
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/bmp,image/gif,image/webp', multiple: true, style: { display: 'none' } });
    input.addEventListener('change', async () => {
      await this.addFiles(input.files);
      input.value = '';
    });
    const dirInput = h('input', { type: 'file', multiple: true, webkitdirectory: true, style: { display: 'none' } });
    dirInput.addEventListener('change', async () => {
      await this.addFiles(dirInput.files);
      dirInput.value = '';
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
      await this.addFiles(await this.filesFromDrop(e.dataTransfer));
    });
    dz.append(h('div', { style: { marginTop: '6px' } }, h('a', { href: '#', onclick: (e) => {
      e.preventDefault();
      dirInput.click();
    } }, 'Importar una carpeta entera (packs de iconos)')));
    const list = this.list;
    const missing = list.filter((a) => !a.rbxId).length;
    const zipBtn = h('button', { class: 'icon-btn', title: 'Descargar ZIP para subir a Roblox', html: icon('download') });
    zipBtn.addEventListener('click', () => this.downloadZip(false));
    const idsBtn = h('button', { class: 'icon-btn', title: 'Pegar muchos rbxassetid a la vez', html: icon('link') });
    idsBtn.addEventListener('click', () => this.bulkDialog());
    host.append(h('div', { class: 'section-title' }, `Imágenes (${list.length})`, h('div', { class: 'actions' }, idsBtn, zipBtn)), dz, input, dirInput);
    if (missing) host.append(h('div', { class: 'info-box', style: { margin: '0 10px 10px' } }, `${missing} imagen(es) sin rbxassetid. Súbelas a Roblox (Asset Manager › Bulk Import) y pega los IDs (botón 🔗) para que se exporten.`));
    const q = h('input', { placeholder: 'Buscar imágenes…', value: this.filter || '' });
    q.addEventListener('keydown', (e) => e.stopPropagation());
    q.addEventListener('input', () => {
      this.filter = q.value.toLowerCase();
      for (const el of grid.children) el.style.display = !this.filter || el.dataset.name.includes(this.filter) ? '' : 'none';
    });
    if (list.length > 6) host.append(h('div', { class: 'search' }, q));
    const grid = h('div', { class: 'asset-grid' });
    for (const a of list) {
      const el = h('div', { class: 'asset', draggable: 'true', title: `${a.name} · ${a.width}×${a.height}`, dataset: { name: a.name.toLowerCase() } }, h('img', { src: a.url, alt: '', loading: 'lazy' }), h('div', { class: 'tag ' + (a.rbxId ? 'ok' : 'no') }, a.rbxId ? '✓ ' + a.name : a.name));
      if (this.filter && !a.name.toLowerCase().includes(this.filter)) el.style.display = 'none';
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-rbxui-asset', a.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      el.addEventListener('click', () => this.assetPopover(a, el));
      grid.append(el);
    }
    host.append(grid);
  }

  bulkDialog() {
    const ta = h('textarea', { class: 'txt', style: { height: '220px', fontFamily: 'monospace' }, placeholder: 'Coin = 1234567890\nGem = rbxassetid://987654321\nStar, 555555555' });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    const missing = this.list.filter((a) => !a.rbxId).map((a) => a.name);
    import('./ui.js').then(({ dialog }) => dialog('Pegar rbxassetid en bloque', h('div', { style: { display: 'grid', gap: '8px' } },
      h('div', { class: 'hint' }, 'Una línea por imagen: nombre = id. El nombre es el de la imagen (sin .png). Así puedes asignar decenas de IDs de golpe tras subirlas en Studio (Asset Manager).'),
      ta, missing.length ? h('div', { class: 'hint' }, `Pendientes: ${missing.slice(0, 30).join(', ')}${missing.length > 30 ? '…' : ''}`) : null), [
      { label: 'Cancelar' },
      { label: 'Aplicar', primary: true, action: () => toast(`${this.bulkIds(ta.value)} ID(s) asignados`) },
    ]));
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
