# RbxUI Studio — guía para Claude

Editor web tipo Figma para interfaces de **Roblox**, con exportación 1:1 a Roblox Studio.
El modelo de datos **es** el árbol de instancias de Roblox (mismas clases y propiedades), así que lo que
se ve en el editor es lo que se exporta. Lee `docs/FORMAT.md` (formato JSON) antes de diseñar.

## Comandos

```bash
npm install                                   # solo instala playwright (para render/tests)
node cli/rbxui.mjs serve 5170                 # editor en http://localhost:5170
npm test                                      # tests unitarios (layout, modelo, exportadores)
npm run e2e                                   # test del editor con ratón/teclado reales (Playwright)
node cli/rbxui.mjs render doc.json --out out/x.png [--screen Nombre] [--scale 2]
node cli/rbxui.mjs validate doc.json          # esquema + revisión de diseño + rbx-dom si está compilado
node cli/rbxui.mjs export doc.json --format rbxmx|luau|module
node cli/rbxui.mjs import ui.rbxmx --out doc.json
node cli/rbxui.mjs fonts                      # las 40 familias oficiales de Roblox
node tests/mcp.test.mjs                       # prueba el servidor MCP (cli/mcp.mjs)
```

Servidor MCP para usuarios de Claude: `cli/mcp.mjs` (ver `docs/MCP.md`).

Validación fuerte (opcional, ya usada en CI local): `tools/rbxcheck` (Rust, rbx-dom = el parser de Rojo)
comprueba que el `.rbxmx` es válido para Roblox; `lune run tests/luau-check.luau x.luau x.rbxmx` ejecuta el
Luau exportado en una emulación de Roblox y verifica que crea exactamente las mismas instancias.

## Cómo diseñar una UI (flujo para Claude)

1. Escribe el diseño como JSON (`docs/FORMAT.md`) o con los constructores del kit
   (`app/js/editor/templates.js`: `studWindow`, `studButton`, `itemCard`, `hudButton`, `currency`…) y las
   pantallas completas de `app/js/editor/screen-templates.js` (inventario, diaria, rebirth, premium, ajustes).
   Pon `design.autoScale: true` si usas tamaños en px: el LocalScript escala la UI en móviles.
2. `node cli/rbxui.mjs render diseño.json --out out/diseño.png` y **mira el PNG** (herramienta Read).
   Compara con las referencias; itera hasta que se vea bien.
3. `node cli/rbxui.mjs validate diseño.json` → sin errores.
4. Exporta (`--format rbxmx`) o abre el JSON en el editor (Archivo › Abrir) para retocar a mano.

## Estilo por defecto: "Stud Style" (lo que quiere el dueño del proyecto)

Referencia: "Stud Style RNG" de WangUI. Reglas (obligatorias salvo que te pidan otra cosa):

- Esquinas **rectas** (sin UICorner) salvo botones redondeados puntuales. Contorno negro (`UIStroke`
  Border, 3-4 px, `LineJoinMode: Miter`).
- Brillo tipo cristal en toda pieza de color: `UIGradient` vertical (claro→oscuro) + hijos `Gloss`
  (mitad superior blanca con transparencia ~0.8), `Shine` (línea blanca arriba) y `Bevel` (franja oscura
  abajo). Ver `gloss()` en templates.js.
- Studs en todo lo de color: `ImageLabel` "Studs" con `ScaleType: Tile`, `TileSize` 37 px, transparencia
  ~0.55 (textura propia generada por código: `makeStudTexture`). Más grande = demasiado.
- Ventanas: cuerpo carbón igual en todas (`#31333B → #292B32`), **color solo en la cabecera** (50 px,
  icono 40 + título 26 px), X roja cuadrada.
- Texto blanco con `UIStroke` negro (Contextual), **Montserrat Heavy**. Nunca fuentes que no sean de Roblox.
- Paleta variada pero controlada (ver `PALETTE`): lima = comprar/acción, rosa = Robux/saltar, rojo = cerrar.
  Nada pastel, nada de fondos blancos.
- Iconos grandes (70-85 % del contenedor) y quietos. Animación solo en ventanas (apertura ~0.2 s, `pop`)
  y botones (`buttonFx` hover 1.06 / pulsar 0.9).
- Pocos textos. Precio con el logo oficial de Robux (imagen), nunca dibujado.
- Errores ya criticados (no repetir): fuentes/SVG propios feos, todo muy redondeado, azul marino repetido,
  todo con fondo, demasiado texto, blanco/pastel/poco vivo, studs enormes o diminutos, cabecera del mismo
  color que el cuerpo, iconos animados.

## Reglas técnicas (invariantes del motor)

- El documento solo contiene clases/propiedades que existen en Roblox (`app/js/core/rbx-api.js`, generado
  con `tools/build-api.py` desde rbx-dom). No inventes efectos que Roblox no pueda reproducir.
- Fuentes: solo las 40 familias oficiales (`app/js/core/fonts-data.js`, generado con `tools/build-fonts.py`).
  `TextSize` en Roblox = altura de línea; el renderer convierte con las métricas reales de cada fuente.
- `UIGradient` **multiplica** el color del padre (y también tiñe el texto si el padre es un TextLabel/Button):
  deja `BackgroundColor3` en blanco para colores exactos y pon el texto en un TextLabel hijo.
- Los hijos siempre se dibujan encima del padre (`ZIndexBehavior: Sibling`).
- Imágenes: en el documento pueden ser `asset:<id>` (vista previa local); para Roblox hace falta su
  `rbxId` (subirlas con Asset Manager › Bulk Import). El exportador avisa de las que faltan.
- Todo cambio de lógica de layout/render/export necesita test en `tests/unit/` y pasar `npm test` y
  `npm run e2e`. Si tocas exportadores, valida con `rbxcheck` y Lune.

## Código

- JavaScript ES modules sin build ni dependencias en runtime. `app/js/core/` es puro (funciona en Node y
  navegador); `app/js/editor/` es la UI; `app/js/export/` los exportadores.
- Textos de la interfaz en español.
- Lista de funciones de Figma y su estado: `docs/FIGMA_PARITY.md` (mantenla al día).
