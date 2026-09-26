// Export dialog: .rbxmx (drag into Studio), Luau (command bar / ModuleScript), project JSON,
// PNG preview, images ZIP. Explains exactly how to bring the UI into Roblox Studio.

import { exportRbxmx } from '../export/rbxmx.js';
import { exportLuau } from '../export/luau.js';
import { buildRuntime, hasInteractions } from '../export/runtime.js';
import { h, dialog, download, copyText, toast, checkbox } from './ui.js';
import { safeName } from './assets.js';
import { lintDocument } from '../core/lint.js';

export function openExportDialog(app, preset) {
  const s = app.store;
  const doc = s.doc;
  const screens = doc.screens.filter((x) => !x.design?.componentsPage);
  const chosen = new Set(screens.map((x) => x.id));
  let format = preset || localStorage.getItem('rbxui.exportFormat') || 'rbxmx';
  let withRuntime = true;
  const body = h('div');
  const cards = [
    ['rbxmx', 'Modelo .rbxmx', 'Arrastra el archivo a Roblox Studio. Recomendado.'],
    ['luau', 'Script para la barra de comandos', 'Pega en View › Command Bar y pulsa Enter: crea la UI en StarterGui.'],
    ['module', 'ModuleScript (Luau)', 'Función Build.Screen(parent) para crear la UI desde código.'],
    ['json', 'Proyecto RbxUI (.json)', 'Para guardar, compartir o que Claude lo edite.'],
    ['png', 'Imagen PNG', 'Captura de cada pantalla (vista previa).'],
  ];
  const render = () => {
    body.innerHTML = '';
    const cardEls = h('div', { class: 'cards' }, cards.map(([k, t, d]) => {
      const c = h('div', { class: 'card-opt' + (format === k ? ' on' : '') }, h('b', {}, t), h('span', {}, d));
      c.addEventListener('click', () => {
        format = k;
        localStorage.setItem('rbxui.exportFormat', k);
        render();
      });
      return c;
    }));
    body.append(cardEls);
    body.append(h('h4', {}, 'Pantallas'));
    body.append(h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } }, screens.map((sc) => checkbox(`${sc.Name} (${sc.design.width}×${sc.design.height})`, chosen.has(sc.id), (v) => {
      v ? chosen.add(sc.id) : chosen.delete(sc.id);
    }))));
    const inter = screens.some((sc) => hasInteractions(sc));
    if (inter && ['rbxmx', 'luau', 'module'].includes(format)) {
      body.append(h('div', { style: { marginTop: '8px' } }, checkbox('Incluir LocalScript con las interacciones (abrir/cerrar ventanas, animaciones de botones)', withRuntime, (v) => (withRuntime = v))));
    }
    // lint + assets report
    const lint = lintDocument(doc, { screens: screens.filter((x) => chosen.has(x.id)) });
    const missing = Object.entries(doc.assets || {}).filter(([id, a]) => !a.rbxId && usedIn(doc, id));
    if (missing.length && format !== 'json' && format !== 'png') {
      const zipBtn = h('button', { class: 'btn small' }, 'Descargar imágenes (.zip)');
      zipBtn.addEventListener('click', () => app.assets.downloadZip(true));
      body.append(h('div', { class: 'warn-box' }, h('b', {}, `${missing.length} imagen(es) sin subir a Roblox. `), 'Se exportarán vacías hasta que pongas su rbxassetid (panel Recursos). Pasos: descarga el ZIP › en Studio abre View › Asset Manager › Bulk Import › copia cada ID y pégalo en la imagen.', h('div', { style: { marginTop: '6px' } }, zipBtn)));
    }
    if (lint.length) body.append(h('div', { class: 'info-box' }, h('b', {}, 'Revisión automática: '), h('ul', {}, lint.slice(0, 8).map((l) => h('li', {}, l.message)))));
    body.append(h('h4', {}, 'Cómo importarlo en Roblox Studio'));
    const steps = {
      rbxmx: ['Abre tu juego en Roblox Studio.', 'En el Explorer, clic derecho en StarterGui › "Insert from File…" y elige el .rbxmx (o arrástralo a la ventana de Studio y muévelo a StarterGui).', 'Listo: cada Frame, TextLabel, UIStroke, UIGradient… es una instancia editable y animable.'],
      luau: ['Abre tu juego en Roblox Studio.', 'View › Command Bar.', 'Pega el script y pulsa Enter. Se crea (o reemplaza) la UI en StarterGui. Se puede deshacer con Ctrl+Z.'],
      module: ['Crea un ModuleScript (p.ej. en ReplicatedStorage) y pega el código.', 'Desde un LocalScript: require(modulo).NombrePantalla(player.PlayerGui)'],
      json: ['Guarda el archivo. Puedes abrirlo luego con Archivo › Abrir, o dárselo a Claude para que lo edite.'],
      png: ['Se descarga una imagen por pantalla (útil para enseñar el diseño).'],
    }[format];
    body.append(h('ol', {}, steps.map((t) => h('li', {}, t))));
  };
  render();
  const doExport = async (copy = false) => {
    const sel = screens.filter((x) => chosen.has(x.id));
    if (!sel.length) return toast('Elige al menos una pantalla', 'err');
    const base = safeName(doc.name) || 'RbxUI';
    const extra = (scr) => (withRuntime && hasInteractions(scr) ? [{ ClassName: 'LocalScript', Name: 'RbxUIController', source: buildRuntime(scr) }] : []);
    if (format === 'rbxmx') {
      const { xml, report } = exportRbxmx(doc, { screens: sel, extra });
      download(`${base}.rbxmx`, xml, 'application/xml');
      toast(`Exportadas ${report.count} instancias`);
    } else if (format === 'luau' || format === 'module') {
      const { code, report } = exportLuau(doc, { screens: sel, target: format === 'module' ? 'module' : 'commandbar', extra });
      if (copy) {
        await copyText(code);
        toast(`Copiado (${report.count} instancias). Pégalo en la Command Bar de Studio.`);
      } else download(`${base}.luau`, code, 'text/plain');
    } else if (format === 'json') {
      download(`${base}.rbxui.json`, JSON.stringify(doc, null, 1), 'application/json');
    } else if (format === 'png') {
      for (const sc of sel) {
        const blob = await app.screenshot(sc);
        if (blob) download(`${base}-${safeName(sc.Name)}.png`, blob, 'image/png');
      }
    }
    return false;
  };
  const buttons = [
    { label: 'Cerrar' },
    { label: 'Copiar código', action: () => {
      if (format !== 'luau' && format !== 'module') {
        format = 'luau';
        render();
      }
      return doExport(true);
    } },
    { label: 'Exportar', primary: true, action: () => doExport(false) },
  ];
  dialog('Exportar a Roblox', body, buttons, { width: '780px' });
}

function usedIn(doc, id) {
  let used = false;
  const visit = (n) => {
    for (const k of ['Image', 'HoverImage', 'PressedImage']) if (n.props?.[k] === 'asset:' + id) used = true;
    n.children?.forEach(visit);
  };
  doc.screens.forEach(visit);
  return used;
}
