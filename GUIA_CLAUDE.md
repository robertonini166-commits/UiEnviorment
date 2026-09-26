# Guía: diseñar UIs de Roblox con Claude y RbxUI Studio

Esta guía es para cualquiera que tenga Claude y quiera crear interfaces de Roblox (tiendas, inventarios, HUD,
recompensas…) que luego se lleven a Roblox Studio **exactamente iguales**, con cada texto, marco y contorno como
una instancia separada que puedes animar.

Claude escribe el diseño, RbxUI lo dibuja para que se pueda revisar y lo exporta a Roblox. Tú lo retocas a mano
en el editor si quieres.

---

## 1. Elige cómo vas a trabajar

| Tienes… | Mejor opción | Qué puede hacer Claude |
|---|---|---|
| **Claude Code** (terminal, app de escritorio o web) | [Opción A](#opción-a-claude-code-recomendada) | Todo: diseña, **mira el PNG**, corrige, valida y exporta el `.rbxmx` |
| **Claude Desktop** | [Opción B](#opción-b-claude-desktop-con-mcp) | Lo mismo mediante el servidor MCP |
| Solo **claude.ai** (chat) | [Opción C](#opción-c-solo-el-chat-de-claudeai) | Escribe el JSON; tú lo pegas en el editor y exportas |

### Opción A: Claude Code (recomendada)

```bash
git clone https://github.com/robertonini166-commits/UiEnviorment RbxUI
cd RbxUI
npm install                  # instala Playwright (para que Claude pueda ver sus diseños como PNG)
claude
```

Claude Code lee [`CLAUDE.md`](CLAUDE.md) solo al abrir la carpeta, así que ya conoce el formato, el estilo y
los comandos. Pídele directamente lo que quieres (ver [ejemplos de peticiones](#3-ejemplos-de-peticiones)).

Si Playwright no encuentra el navegador: `npx playwright install chromium`.

### Opción B: Claude Desktop con MCP

Clona el repo e instala como en la opción A. Después añade el servidor en `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rbxui": { "command": "node", "args": ["/ruta/a/RbxUI/cli/mcp.mjs"] }
  }
}
```

Reinicia Claude Desktop. Verás las herramientas `rbxui_*` (guía, plantillas, render, validar, exportar,
importar, fuentes). Detalles en [docs/MCP.md](docs/MCP.md).

(En Claude Code también puedes añadirlo con `claude mcp add rbxui -- node /ruta/a/RbxUI/cli/mcp.mjs`.)

### Opción C: solo el chat de claude.ai

1. Abre el editor: `node cli/rbxui.mjs serve` → http://localhost:5170 (o la web publicada, si la hay).
2. Copia en el chat el [prompt para el chat](#5-prompt-para-el-chat-de-claudeai) de más abajo y pide tu
   diseño.
3. Copia el JSON que te dé Claude, haz clic en el lienzo del editor y pulsa **Ctrl+V**: aparece como una
   pantalla nueva. También puedes guardarlo como `mi-ui.json` y arrastrarlo al editor.
4. Retoca lo que quieras y pulsa **Exportar a Roblox**.

En esta opción Claude no puede ver cómo queda, así que haz tú una captura del editor y pásasela si algo no
se ve bien.

---

## 2. Llevarlo a Roblox Studio

| Formato | Cómo se importa |
|---|---|
| **`.rbxmx`** (recomendado) | En el Explorer de Studio: clic derecho en **StarterGui › Insert from File…** |
| **Luau (Command Bar)** | Studio › **View › Command Bar**, pega el código y pulsa Enter. Crea la UI en StarterGui (Ctrl+Z la deshace) |
| **ModuleScript** | Para crear la UI desde código: `require(modulo).NombrePantalla(player.PlayerGui)` |

Si el diseño tiene botones que abren o cierran ventanas, se exporta también un `LocalScript`
(`RbxUIController`) con las animaciones hechas con TweenService.

**Imágenes**: las que añades en el editor solo existen en tu ordenador. Súbelas en Studio con
**View › Asset Manager › Bulk Import**, copia cada `rbxassetid` y pégalo en el panel **Recursos** del editor
antes de exportar. El exportador avisa de las que faltan.

**Sincronización en vivo** (cada cambio aparece al momento en Studio): ver [docs/LIVE_SYNC.md](docs/LIVE_SYNC.md).

---

## 3. Ejemplos de peticiones

Copia y adapta:

- *"Hazme una tienda de mascotas estilo simulador con 6 huevos en cuadrícula, precio en monedas y un botón
  de comprar con Robux. Renderízala, revísala y expórtala a rbxmx."*
- *"Crea el HUD de mi juego: monedas y gemas arriba a la izquierda, botones TIENDA, INVENTARIO y REBIRTH a
  la izquierda, y que cada botón abra su ventana con animación pop."*
- *"Parte de la plantilla de recompensa diaria y cámbiala a 7 días con colores morado y dorado."*
- *"Importa `MiUI.rbxmx` (la guardé desde Studio con Save to File), ponle estilo Stud y devuélvemela."*
- *"Esta es una captura de la UI que quiero [imagen]. Recréala lo más parecida posible."*

Consejos:

- Di **cuántas pantallas/ventanas** quieres y **qué abre qué**.
- Da referencias (capturas de juegos, [ui-resources.com](https://ui-resources.com/)).
- Si algo no te gusta, sé concreto: *"el título más grande"*, *"quita el texto de abajo"*, *"el botón
  verde, no azul"*.

---

## 4. Instrucciones para Claude

> Esta sección está escrita para Claude. Si usas Claude Code dentro del repo, ya la tiene en `CLAUDE.md`.

### Flujo de trabajo

1. **Parte de una plantilla** siempre que se pueda:
   - Piezas: `window`, `window-blue`, `btn-lime`, `btn-pink`, `btn-red`, `btn-round`, `card`, `hud`,
     `currency`, `progress`, `tabs`, `toggle`, `title`, `notification`, `reward`, `panel`.
   - Pantallas: `shop`, `inventory`, `daily`, `rebirth`, `premium`, `settings`, `hud`.
   - Con MCP: `rbxui_template {name}`. En el repo: los constructores de `app/js/editor/templates.js`
     (`studWindow`, `studButton`, `robuxButton`, `itemCard`, `hudButton`, `currency`, `gloss`, `studs`…) y
     `app/js/editor/screen-templates.js`.
2. Escribe el documento en JSON ([docs/FORMAT.md](docs/FORMAT.md)).
3. **Renderiza y mira el PNG** antes de enseñarlo. Usa `node cli/rbxui.mjs render ui.json --out out/ui.png`
   (o `rbxui_render`) y ábrelo con la herramienta de leer imágenes. Itera hasta que se vea bien: alineación,
   márgenes, texto que no se corte, contraste.
4. **Valida**: `node cli/rbxui.mjs validate ui.json` (o `rbxui_validate`) debe terminar sin errores.
5. **Exporta**: `node cli/rbxui.mjs export ui.json --format rbxmx --out out/ui.rbxmx` (o `rbxui_export`).
   Explica al usuario cómo importarlo (sección 2).

### Reglas que no se pueden romper

- Solo **clases y propiedades reales de Roblox** (con sus nombres exactos). Nada de efectos que Roblox no
  pueda reproducir (desenfoques de fondo, sombras CSS, máscaras SVG…).
- Solo las **40 fuentes oficiales de Roblox** (`rbxui_fonts` / `node cli/rbxui.mjs fonts`). Por defecto,
  `Montserrat` peso `Heavy`.
- **`UIGradient` multiplica** el color del padre: deja `BackgroundColor3: "#FFFFFF"` en la pieza con degradado.
  Pon el texto en un `TextLabel` hijo; si no, el degradado también lo tiñe.
- La zona útil empieza **58 px por debajo** de la barra superior de Roblox, salvo que pongas
  `IgnoreGuiInset: true`.
- **Nombres únicos entre hermanos** (`ShopWindow`, `BuyButton`…): los scripts del juego los usan.
- Las ventanas que se abren con un botón empiezan con `"Visible": false` y se abren con una interacción
  (`{"trigger":"click","action":"toggle","target":"ShopWindow","animation":"pop"}`).
- Si usas tamaños en píxeles, pon `design.autoScale: true` para que la UI se escale en móviles.
- El logo de Robux es **una imagen** (`ImageLabel` vacío `RobuxIcon` donde el usuario pondrá el id), nunca
  dibujado a mano.

### Estilo por defecto ("Stud Style")

Salvo que el usuario pida otra cosa:

- Esquinas **rectas** y contorno **negro** (`UIStroke` Border, 3-4 px, `LineJoinMode: Miter`).
- Piezas de color con **brillo tipo cristal**: `UIGradient` vertical claro→oscuro + `Gloss`, `Shine`,
  `Reflex`, `Bevel` (usa `gloss()`), y **studs** (`ImageLabel` `Image: "asset:studs"`, `ScaleType: Tile`,
  `TileSize` 37 px, transparencia ~0.55).
- Ventanas con **cuerpo carbón** (`#31333B → #292B32`) y **color solo en la cabecera** (50 px, icono 40 +
  título 26 px) y una X roja cuadrada.
- Texto **blanco** con `UIStroke` negro (`ApplyStrokeMode: Contextual`).
- Colores con significado: **lima** = comprar/acción, **rosa** = Robux, **rojo** = cerrar. Nada pastel ni
  fondos blancos; no repetir el azul marino.
- Pocos textos, iconos grandes (70-85 % de su hueco) y quietos. Animación solo al abrir ventanas (`pop`,
  ~0.2 s) y en botones (`buttonFx` hover 1.06 / pulsar 0.9).

Paleta (`PALETTE`, pares claro → oscuro):

| | | | |
|---|---|---|---|
| lime `#B8FF5E → #43C22C` | pink `#FF8AD0 → #E0479E` | red `#FF5B5B → #C81E1E` | orange `#FFC04D → #FF7A00` |
| blue `#6FD0FF → #2C86D6` | purple `#D08CFF → #8B3FD6` | yellow `#FFE45E → #F2A900` | teal `#5EF2D8 → #1BA88F` |

### Chuleta del formato

| Tipo de Roblox | En el JSON |
|---|---|
| Color3 | `"#FF7A00"` |
| UDim2 | `[xScale, xOffset, yScale, yOffset]` → `[0.5, 0, 1, -20]` |
| UDim | `[scale, offset]` → `[0, 8]` |
| Vector2 | `[0.5, 0.5]` |
| Enum | el nombre: `"Center"`, `"Heavy"`, `"Tile"` |
| ColorSequence | `[[0, "#FFC04D"], [1, "#FF7A00"]]` |
| NumberSequence | `[[0, 0], [1, 1]]` |
| Font | `{"family": "Montserrat", "weight": "Heavy", "style": "Normal"}` |
| Imagen | `"rbxassetid://123"` o `"asset:<id local>"` |

Los modificadores (`UICorner`, `UIStroke`, `UIGradient`, `UIPadding`, `UIListLayout`, `UIGridLayout`,
`UIScale`, `UIShadow`, `UIAspectRatioConstraint`…) van como **hijos** del objeto que modifican.

### Ejemplo mínimo válido

Una ventana de tienda con cabecera naranja y botón de comprar (pasa `validate` y se exporta con 15
instancias):

```json
{
  "format": "rbxui", "version": 1, "name": "Ejemplo",
  "screens": [{
    "ClassName": "ScreenGui", "Name": "ShopUI",
    "props": { "ResetOnSpawn": false, "ZIndexBehavior": "Sibling" },
    "design": { "device": "studio", "width": 1280, "height": 720, "autoScale": true, "background": "#3A6EA5" },
    "children": [{
      "ClassName": "Frame", "Name": "ShopWindow",
      "props": { "AnchorPoint": [0.5, 0.5], "Position": [0.5, 0, 0.5, 0], "Size": [0, 420, 0, 260], "BackgroundColor3": "#FFFFFF" },
      "children": [
        { "ClassName": "UIGradient", "props": { "Color": [[0, "#31333B"], [1, "#292B32"]], "Rotation": 90 } },
        { "ClassName": "UIStroke", "props": { "Thickness": 4, "Color": "#000000", "ApplyStrokeMode": "Border", "LineJoinMode": "Miter" } },
        { "ClassName": "Frame", "Name": "Header",
          "props": { "Size": [1, 0, 0, 50], "BackgroundColor3": "#FFFFFF", "ZIndex": 3 },
          "children": [
            { "ClassName": "UIGradient", "props": { "Color": [[0, "#FFC04D"], [1, "#FF7A00"]], "Rotation": 90 } },
            { "ClassName": "UIStroke", "props": { "Thickness": 3, "Color": "#000000", "ApplyStrokeMode": "Border", "LineJoinMode": "Miter" } },
            { "ClassName": "TextLabel", "Name": "Title",
              "props": { "Text": "TIENDA", "TextSize": 26, "FontFace": { "family": "Montserrat", "weight": "Heavy", "style": "Normal" },
                         "TextColor3": "#FFFFFF", "BackgroundTransparency": 1, "Position": [0, 16, 0, 0], "Size": [1, -32, 1, 0],
                         "TextXAlignment": "Left", "ZIndex": 5 },
              "children": [{ "ClassName": "UIStroke", "props": { "Thickness": 3, "Color": "#000000", "ApplyStrokeMode": "Contextual", "LineJoinMode": "Round" } }] }
          ] },
        { "ClassName": "TextButton", "Name": "BuyButton",
          "props": { "AnchorPoint": [0.5, 1], "Position": [0.5, 0, 1, -24], "Size": [0, 200, 0, 56], "BackgroundColor3": "#FFFFFF", "Text": "", "AutoButtonColor": false },
          "buttonFx": { "hover": 1.06, "press": 0.9 },
          "children": [
            { "ClassName": "UIGradient", "props": { "Color": [[0, "#B8FF5E"], [1, "#43C22C"]], "Rotation": 90 } },
            { "ClassName": "UIStroke", "props": { "Thickness": 2.5, "Color": "#000000", "ApplyStrokeMode": "Border", "LineJoinMode": "Miter" } },
            { "ClassName": "TextLabel", "Name": "Label",
              "props": { "Text": "COMPRAR", "TextSize": 24, "FontFace": { "family": "Montserrat", "weight": "Heavy", "style": "Normal" },
                         "TextColor3": "#FFFFFF", "BackgroundTransparency": 1, "Size": [1, 0, 1, 0], "ZIndex": 5 },
              "children": [{ "ClassName": "UIStroke", "props": { "Thickness": 2, "Color": "#000000", "ApplyStrokeMode": "Contextual", "LineJoinMode": "Round" } }] }
          ] }
      ]
    }]
  }]
}
```

Para el look completo (brillo, studs, sombra, X roja) usa las plantillas en vez de escribirlo todo a mano.

---

## 5. Prompt para el chat de claude.ai

Si solo usas el chat, pega esto al empezar la conversación (y después pide tu diseño):

```text
Vas a diseñar interfaces de Roblox para el editor RbxUI Studio. Responde con un único bloque JSON
con este formato: {"format":"rbxui","version":1,"name":"...","screens":[ScreenGui...]}.
Cada nodo es {"ClassName","Name","props":{...},"children":[...]} con clases y propiedades REALES de
Roblox. Tipos: Color3 "#RRGGBB"; UDim2 [xs,xo,ys,yo]; UDim [s,o]; Vector2 [x,y]; enums por nombre;
ColorSequence [[t,"#hex"],...]; Font {"family":"Montserrat","weight":"Heavy","style":"Normal"}.
Los modificadores (UICorner, UIStroke, UIGradient, UIPadding, UIListLayout, UIGridLayout, UIScale,
UIShadow...) van como hijos. Cada ScreenGui lleva "design":{"device":"studio","width":1280,
"height":720,"autoScale":true,"background":"#3A6EA5"}.
Reglas: solo fuentes oficiales de Roblox; UIGradient multiplica el color del padre, así que pon
BackgroundColor3 "#FFFFFF" en las piezas con degradado y el texto en un TextLabel hijo; la zona útil
empieza 58 px bajo la barra superior; nombres únicos entre hermanos; ventanas que abre un botón con
"Visible":false y en el botón "interactions":[{"trigger":"click","action":"toggle",
"target":"NombreVentana","animation":"pop"}]; botones con "buttonFx":{"hover":1.06,"press":0.9}.
Estilo "Stud Style": esquinas rectas, UIStroke negro Border 3-4 px con LineJoinMode Miter,
degradado vertical claro→oscuro en todo lo de color, ventanas con cuerpo #31333B→#292B32 y color
solo en la cabecera de 50 px, texto blanco Montserrat Heavy con UIStroke negro Contextual, lima =
comprar, rosa = Robux, rojo = cerrar, nada pastel ni fondos blancos, pocos textos.
```

---

## 6. Problemas frecuentes

| Problema | Solución |
|---|---|
| `render` falla con un error de navegador | `npm install` y luego `npx playwright install chromium` |
| En Studio la UI sale más abajo que en el editor | Es la barra superior de Roblox (58 px). En el editor también se ve; si no la quieres, `IgnoreGuiInset: true` |
| Las imágenes salen vacías en Studio | Falta su `rbxassetid`: súbelas con Asset Manager › Bulk Import y pega los ids en **Recursos** |
| Un degradado no se ve | El padre tiene fondo transparente (`BackgroundTransparency: 1`) o no es blanco. `validate` lo avisa |
| El texto sale del color del degradado | El texto está en el mismo objeto que el `UIGradient`: muévelo a un `TextLabel` hijo |
| No puedo descargar el `.rbxmx` | Estás en una vista incrustada (p. ej. un artifact de Claude). Usa **Copiar código** y la Command Bar, o abre el editor en local |
| La UI se ve enorme o diminuta en el móvil | Activa `design.autoScale: true` o usa tamaños en escala (`[0.3, 0, 0.4, 0]`) |

Más documentación:
- [docs/FORMAT.md](docs/FORMAT.md): formato completo.
- [docs/MCP.md](docs/MCP.md): servidor MCP.
- [docs/LIVE_SYNC.md](docs/LIVE_SYNC.md): sincronización con Studio.
- [docs/FIGMA_PARITY.md](docs/FIGMA_PARITY.md): qué funciones de Figma hay y cuáles faltan.
- [docs/VERIFY_IN_STUDIO.md](docs/VERIFY_IN_STUDIO.md): cómo comprobar en Studio que la exportación es exacta.
