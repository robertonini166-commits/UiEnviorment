# Formato de documento RbxUI (`.rbxui.json`)

RbxUI guarda los diseños **como árboles de instancias de Roblox**. Se usan exactamente los mismos
nombres de clase y de propiedad que en Roblox Studio, así que cualquiera que sepa Roblox (o Claude)
puede leer y escribir este JSON a mano, y la exportación a Roblox es 1:1.

## Estructura

```jsonc
{
  "format": "rbxui",
  "version": 1,
  "name": "Mi juego",
  "screens": [                       // cada pantalla es un ScreenGui
    {
      "ClassName": "ScreenGui",
      "Name": "MainUI",
      "props": { "ResetOnSpawn": false, "ZIndexBehavior": "Sibling", "IgnoreGuiInset": false },
      "design": { "device": "studio", "width": 1280, "height": 720, "x": 0, "y": 0,   // solo editor
                  "autoScale": true,        // el LocalScript escala la UI a otras pantallas (UIScale)
                  "background": "#3A6EA5",  // color de fondo de la vista previa
                  "guides": [{ "axis": "v", "pos": 640 }], "grid": { "columns": 12, "gutter": 16, "margin": 24 } },
      "children": [ /* nodos */ ]
    }
  ],
  "assets": {                        // imágenes locales (vista previa) + su id de Roblox
    "a1": { "name": "coin", "url": "data:image/png;base64,...", "width": 128, "height": 128, "rbxId": "1234567890" }
  },
  "components": {},                  // lo gestiona el editor (maestros en la pantalla "Componentes")
  "styles": { "colors": [{ "id": "s1", "name": "Primario", "value": "#FF7A00" }], "texts": [] }  // estilos enlazados
}
```

## Nodo

```jsonc
{
  "ClassName": "TextButton",         // clase de Roblox
  "Name": "BuyButton",               // Instance.Name (úsalo en scripts: nombres únicos entre hermanos)
  "props": { "Size": [0, 180, 0, 56], "Text": "COMPRAR" },   // propiedades de Roblox
  "children": [ { "ClassName": "UICorner", "props": { "CornerRadius": [0, 8] } } ],
  "interactions": [ { "trigger": "click", "action": "toggle", "target": "ShopWindow", "animation": "pop" } ],
  "buttonFx": { "hover": 1.06, "press": 0.9 },   // animación de botón (UIScale) en el LocalScript
  "editor": { "locked": false, "hidden": false } // solo editor, no se exporta
}
```

- `id` es opcional (se genera solo).
- La zona útil de un ScreenGui empieza **debajo de la barra superior de Roblox (58 px)** salvo que pongas
  `"IgnoreGuiInset": true` o `"ScreenInsets": "None"`, igual que en Roblox.
- Las propiedades también pueden ir en el nivel del nodo (`{"ClassName":"Frame","Size":[...]}`).
- Lo que no pongas toma los **valores por defecto del editor** (Frame blanco sin borde, TextLabel
  Montserrat Bold 24 blanco sin fondo, etc.). El exportador escribe siempre todas las propiedades.

## Tipos de valor

| Tipo Roblox | JSON | Ejemplo |
|---|---|---|
| Color3 | `"#RRGGBB"` (también `[r,g,b]` 0-255 o `"rgb(r,g,b)"`) | `"#FF7A00"` |
| UDim2 | `[xScale, xOffset, yScale, yOffset]` | `[0.5, 0, 1, -20]` |
| UDim | `[scale, offset]` | `[0, 8]` |
| Vector2 | `[x, y]` | `[0.5, 0.5]` |
| Rect | `[minX, minY, maxX, maxY]` | `[16, 16, 48, 48]` |
| Enum | nombre del item | `"Center"`, `"Heavy"`, `"Slice"` |
| ColorSequence | `[[t, "#hex"], ...]` (t de 0 a 1, máx 20) | `[[0,"#FFC04D"],[1,"#FF7A00"]]` |
| NumberSequence | `[[t, valor], ...]` | `[[0,0],[1,1]]` |
| Font | `{ "family": id, "weight": FontWeight, "style": "Normal"/"Italic" }` | `{"family":"Montserrat","weight":"Heavy","style":"Normal"}` |
| ContentId | `"rbxassetid://123"` o `"asset:<id local>"` | `"asset:a1"` |

## Clases soportadas

Contenedores y objetos: `ScreenGui`, `Frame`, `ScrollingFrame`, `CanvasGroup`, `Folder`, `TextLabel`,
`TextButton`, `TextBox`, `ImageLabel`, `ImageButton`, `ViewportFrame`, `VideoFrame`.

Modificadores (hijos que cambian a su padre): `UICorner`, `UIStroke`, `UIGradient`, `UIPadding`, `UIScale`,
`UIShadow`, `UIAspectRatioConstraint`, `UISizeConstraint`, `UITextSizeConstraint`, `UIListLayout`,
`UIGridLayout`, `UIPageLayout`, `UIFlexItem`, `UIDragDetector`.

Los tipos y valores por defecto vienen de la base de datos de reflexión de rbx-dom (API de Roblox
v0.728). Consulta `app/js/core/rbx-api.js` para ver todas las propiedades de cada clase.

## Fuentes (solo las oficiales de Roblox)

`family` debe ser uno de estos ids (`Font.new("rbxasset://fonts/families/<id>.json")`). Cualquier otra
fuente se rechaza, porque en Roblox no existiría. `GothamSSm`/`Gotham` se convierten en `Montserrat`, igual
que hace Roblox.

| Nombre | id | Pesos incluidos para la vista previa |
|---|---|---|
| Accanthis ADF Std | `AccanthisADFStd` | solo Roblox (vista ≈ Merriweather) |
| Amatic SC | `AmaticSC` | 400, 700 |
| Arimo | `Arimo` | 400, 500, 600, 700 |
| Balthazar | `Balthazar` | 400 |
| Bangers | `Bangers` | 400 |
| Builder Extended | `BuilderExtended` | solo Roblox (vista ≈ Michroma) |
| Builder Mono | `BuilderMono` | solo Roblox (vista ≈ Roboto Mono) |
| Builder Sans | `BuilderSans` | solo Roblox (vista ≈ Arimo) |
| Comic Neue Angular | `ComicNeueAngular` | 300, 400, 700 |
| Creepster | `Creepster` | 400 |
| Denk One | `DenkOne` | 400 |
| Fondamento | `Fondamento` | 400 |
| Fredoka One | `FredokaOne` | 400 |
| Grenze Gotisch | `GrenzeGotisch` | 100, 200, 300, 400, 500, 600, 700, 800, 900 |
| Guru | `Guru` | solo Roblox (vista ≈ Merriweather) |
| Highway Gothic | `HighwayGothic` | solo Roblox (vista ≈ Roboto Condensed) |
| Inconsolata | `Inconsolata` | 200, 300, 400, 500, 600, 700, 800, 900 |
| Indie Flower | `IndieFlower` | 400 |
| Josefin Sans | `JosefinSans` | 100, 200, 300, 400, 500, 600, 700 |
| Jura | `Jura` | 300, 400, 500, 600, 700 |
| Kalam | `Kalam` | 300, 400, 700 |
| Luckiest Guy | `LuckiestGuy` | 400 |
| Merriweather | `Merriweather` | 300, 400, 500, 600, 700, 800, 900 |
| Michroma | `Michroma` | 400 |
| Montserrat | `Montserrat` | 100, 200, 300, 400, 500, 600, 700, 800, 900 |
| Nunito | `Nunito` | 200, 300, 400, 500, 600, 700, 800, 900 |
| Oswald | `Oswald` | 200, 300, 400, 500, 600, 700 |
| Patrick Hand | `PatrickHand` | 400 |
| Permanent Marker | `PermanentMarker` | 400 |
| Press Start 2P | `PressStart2P` | 400 |
| Roboto | `Roboto` | 100, 200, 300, 400, 500, 600, 700, 800, 900 |
| Roboto Condensed | `RobotoCondensed` | 100, 200, 300, 400, 500, 600, 700, 800, 900 |
| Roboto Mono | `RobotoMono` | 100, 200, 300, 400, 500, 600, 700 |
| Roman Antique | `RomanAntique` | solo Roblox (vista ≈ Fondamento) |
| Sarpanch | `Sarpanch` | 400, 500, 600, 700, 800, 900 |
| Source Sans Pro | `SourceSansPro` | 200, 300, 400, 600, 700, 900 |
| Special Elite | `SpecialElite` | 400 |
| Titillium Web | `TitilliumWeb` | 200, 300, 400, 600, 700, 900 |
| Ubuntu | `Ubuntu` | 300, 400, 500, 700 |
| Zekton | `Zekton` | solo Roblox (vista ≈ Jura) |

Si un peso no existe en la fuente, Roblox usa el más cercano (y la vista previa también).

## Interacciones (prototipo)

```jsonc
{ "trigger": "click" | "hover",
  "action": "open" | "close" | "toggle" | "closeParent",
  "target": "ShopWindow" | "ShopWindow/Header" | "<id>",   // por nombre, ruta o id
  "animation": "pop" | "fade" | "slideUp" | "slideDown" | "slideLeft" | "slideRight" | "none",
  "duration": 0.22, "blur": true, "exclusive": true }
```

Al exportar se genera un `LocalScript` (`RbxUIController`) dentro del ScreenGui que implementa todo con
TweenService. Las ventanas que se abren con un botón suelen empezar con `"Visible": false`.
