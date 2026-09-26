# Funciones de Figma en RbxUI Studio

Inventario de las funciones de Figma y su equivalente en RbxUI. Idea clave: RbxUI no convierte un diseño de
Figma a Roblox; **edita directamente instancias de Roblox con la comodidad de Figma**. Por eso algunas funciones
de Figma se *adaptan* a lo que Roblox puede hacer y otras no existen porque Roblox no las soporta. Ponerlas
rompería la exportación, que tiene que ser exacta.

Leyenda: ✅ hecho · 🟡 adaptado o parcial · ❌ no hecho (ver "Cómo puedes ayudar").

## Lienzo y navegación

| Figma | RbxUI | Notas |
|---|---|---|
| Lienzo infinito, zoom (rueda, Ctrl+rueda, atajos), desplazamiento (Espacio, rueda, botón central, mano H) | ✅ | Mayús+1 ver todo, Mayús+2 selección, Mayús+0 100 % |
| Frames de dispositivo (presets) | ✅ | Cada frame es un **ScreenGui**: PC, portátil, Studio, tablet, móvil con notch, consola |
| Páginas | 🟡 | Todas las pantallas en un lienzo, con lista a la izquierda. La página "Componentes" se crea sola |
| Reglas y guías arrastrables | ✅ | Mayús+R. Arrastra desde la regla; los objetos se ajustan a las guías |
| Cuadrícula de píxeles | ✅ | Aparece a partir del 600 % de zoom |
| Layout grids (columnas) | 🟡 | `design.grid = {columns, gutter, margin}` en el JSON. Falta un panel para editarlo |
| Vista de contornos (outline) | ❌ | Poco útil aquí; se puede añadir |
| Barra superior de Roblox, zona segura, controles móviles | ✅ | **Extra de Roblox**: respeta `IgnoreGuiInset`/`ScreenInsets` (58 px) igual que Roblox |
| Previsualizar en otros dispositivos | ✅ | En ▶ Probar: móvil, tablet, PC… con **escalado automático** (UIScale en el LocalScript exportado) |

## Selección y edición

| Figma | RbxUI | Notas |
|---|---|---|
| Clic, Mayús+clic, marco de selección, Ctrl+clic en profundidad, doble clic para entrar | ✅ | Mismo sistema de "alcance" que Figma |
| Mover, desplazar con flechas (Mayús = 10 px), redimensionar (Mayús proporcional, Alt desde el centro), rotar | ✅ | Guarda en Scale u Offset según el modo de unidades |
| Guías inteligentes y ajuste a hermanos, padre y guías | ✅ | Ctrl mientras arrastras = sin ajuste |
| Medir distancias con Alt | ✅ | Hacia el padre al arrastrar y entre objetos al pasar el ratón |
| Alt+arrastrar para duplicar | ✅ | |
| Alinear y distribuir | ✅ | Un solo objeto se alinea con anclas (AnchorPoint + Scale), así se adapta a cualquier pantalla |
| Tidy up | ✅ | Mayús+T |
| Agrupar / desagrupar, frame desde la selección | ✅ | Grupo = Frame transparente (Ctrl+G) o **Folder** (Ctrl+Alt+G) |
| Restricciones (izquierda/derecha/centro/escala/estirar) | ✅ | Se traducen a AnchorPoint + UDim2 Scale/Offset |
| Voltear horizontal/vertical | ❌ | Roblox no puede voltear objetos (solo rotar) |
| Seleccionar capas iguales | ✅ | Ctrl+Mayús+A |
| Copiar/pegar propiedades | ✅ | Ctrl+Alt+C / Ctrl+Alt+V (propiedades y modificadores) |
| Buscar y reemplazar texto, renombrar por lotes | ✅ | Ctrl+F, Ctrl+R (`$n`, `$&`, `$c`) |
| Herramienta Escala (K) | ✅ | Escala tamaños, textos, contornos, radios y espaciados |
| Deshacer/rehacer, historial | ✅ | Menú › Historial de cambios |
| Bloquear, ocultar, capas con arrastrar y soltar, búsqueda | ✅ | "Ocultar" es solo del editor; `Visible` es la propiedad real de Roblox |
| Copiar/pegar entre archivos y pestañas | ✅ | El portapapeles lleva JSON: puedes pegar lo que genere Claude |

## Auto layout y tamaño

| Figma | RbxUI | Notas |
|---|---|---|
| Auto layout vertical/horizontal, gap, padding, alineación | ✅ | UIListLayout + UIPadding (Mayús+A) |
| Wrap | ✅ | `UIListLayout.Wraps` |
| Hug / Fill / Fixed | ✅ | AutomaticSize / UIFlexItem Fill o Scale 1 / Offset |
| Space between/around/evenly | ✅ | HorizontalFlex / VerticalFlex |
| Mínimo/máximo | ✅ | UISizeConstraint |
| Cuadrícula | ✅ | UIGridLayout, además de UIPageLayout (carrusel) |
| Posición absoluta dentro de auto layout | 🟡 | En Roblox se mete el objeto en un Folder (el layout no le afecta) |
| Reordenar arrastrando dentro del layout | ✅ | Cambia `LayoutOrder` |

## Formas, rellenos y efectos

| Figma | RbxUI | Notas |
|---|---|---|
| Rectángulo, elipse, línea | ✅ | Frame, Frame + UICorner 0.5, Frame fino |
| Polígono, estrella, flecha, pluma/vectores, operaciones booleanas | ❌ | Roblox no tiene vectores (Path2D sigue en beta y guarda los puntos en binario) |
| Relleno sólido y degradado lineal/radial/angular | ✅ | BackgroundColor3 + UIGradient (Linear/Radial/Conical, Offset, Scale, TileMode) |
| Degradado diamante | ❌ | No existe en Roblox |
| Varios rellenos por capa | 🟡 | Roblox admite un color y un UIGradient. Solución: Frames apilados |
| Relleno de imagen (fill/fit/crop/tile) | ✅ | ImageLabel ScaleType Stretch/Fit/Crop/Tile/Slice (9-slice), ImageRect para spritesheets |
| Contorno: color, grosor, dentro/centro/fuera, uniones, varios contornos, degradado | ✅ | UIStroke (BorderStrokePosition, LineJoinMode, ZIndex, UIGradient hijo) |
| Contorno por lados o discontinuo | ❌ | Roblox no lo soporta |
| Radio de esquinas, individual | ✅ | UICorner (el radio individual es beta de Roblox; se exporta protegido) |
| Suavizado de esquinas (corner smoothing) | ❌ | No existe en Roblox |
| Sombra paralela | ✅ | UIShadow (blur, offset, spread), además de "sombra dura" de simulador |
| Sombra interior, desenfoque de capa, ruido | ❌ | No existen en Roblox |
| Desenfoque de fondo | 🟡 | Solo pantalla completa (BlurEffect en Lighting) desde las interacciones |
| Opacidad de capa y de grupo | ✅ | Transparencias y CanvasGroup.GroupTransparency |
| Modos de fusión | ❌ | Roblox no tiene blend modes en UI |
| Máscaras | 🟡 | ClipsDescendants (rectangular) y CanvasGroup (respeta esquinas redondeadas) |

## Texto

| Figma | RbxUI | Notas |
|---|---|---|
| Fuentes | ✅ | **Solo las 40 familias oficiales de Roblox**, con pesos y cursiva. 32 incluidas (OFL) |
| Tamaño, interlineado, alineación H/V | ✅ | TextSize (= altura de línea en Roblox, con las métricas reales de cada fuente), LineHeight |
| Ancho/alto automático, fijo, truncar | ✅ | AutomaticSize, TextWrapped, TextScaled, TextTruncate |
| Estilos mixtos en un mismo texto | ✅ | RichText con barra B/I/U/S/color/contorno/tamaño |
| Mayúsculas, versalitas, subrayado, tachado | ✅ | Etiquetas `<uc>`, `<sc>`, `<u>`, `<s>` |
| Espaciado entre letras o párrafos, listas, enlaces | ❌ | Roblox no los soporta |
| Rasgos OpenType | ❌ | Roblox tiene `OpenTypeFeatures`, pero la vista previa no lo simula todavía |

## Componentes, estilos y variables

| Figma | RbxUI | Notas |
|---|---|---|
| Componentes, instancias y overrides | ✅ | Ctrl+Alt+K. El maestro vive en la página "Componentes" (no se exporta) |
| Restablecer o desvincular instancia | ✅ | |
| Variantes | 🟡 | Maestros llamados `Set/Variante` (p. ej. `Botón/Primario`) se agrupan y la instancia cambia de variante desde el inspector |
| Intercambiar instancia (swap) | ✅ | Mantiene posición, AnchorPoint, orden, etc. |
| Propiedades de componente (booleanas, texto, swap anidado) | ❌ | Ver "Cómo puedes ayudar" |
| Estilos de color y de texto enlazados | ✅ | Panel Recursos |
| Variables y modos (tokens, tema claro/oscuro) | ❌ | |
| Librerías de equipo | ❌ | Necesita servidor |

## Prototipado

| Figma | RbxUI | Notas |
|---|---|---|
| Interacciones al hacer clic, pasar el ratón, pulsar tecla o tras un retardo | ✅ | Se exportan como **LocalScript real** (TweenService, UserInputService) |
| Abrir, cerrar y alternar overlays, cerrar la ventana padre | ✅ | Con fondo desenfocado opcional y "cierra las demás" |
| Navegar a otra pantalla | ✅ | Cambia el `Enabled` de los ScreenGui |
| Animaciones: dissolve, move in/out, slide | ✅ | pop (escala), fade, slide en 4 direcciones |
| Smart animate, easing a medida, spring | ❌ | |
| Scroll | ✅ | ScrollingFrame |
| Modo presentación | ✅ | ▶ Probar (F5): mismo comportamiento que el LocalScript |
| Flujos o puntos de inicio, variables o condiciones | ❌ | |

## Exportar, código y archivos

| Figma | RbxUI | Notas |
|---|---|---|
| Exportar PNG | ✅ | Pantalla completa o selección (@2x, fondo transparente) para subirla a Roblox como imagen |
| Exportar SVG, PDF o JPG | ❌ | Roblox no los usa |
| Dev Mode / Inspect | ✅ | Pestaña Código: Luau y JSON en vivo |
| **Exportar a Roblox** | ✅ | `.rbxmx` (arrastrar a Studio), Luau para la Command Bar y ModuleScript, validados con rbx-dom y Lune |
| **Importar desde Roblox** | ✅ | Abre `.rbxmx` guardados desde Studio para editarlos aquí |
| **Sincronización en vivo con Studio** | ✅ | Plugin + `node cli/rbxui.mjs sync` (como Rojo). Ver `docs/LIVE_SYNC.md` |
| Autoguardado | ✅ | IndexedDB, más guardar/abrir `.rbxui.json` |
| App instalable / sin conexión | ✅ | PWA (service worker) |
| Importar `.fig` o SVG | ❌ | Formato cerrado de Figma |
| Multijugador en tiempo real, comentarios, compartir con permisos, ramas | ❌ | Necesitan servidor y cuentas |
| Plugins o widgets | 🟡 | No hay API de plugins. En su lugar: CLI (`cli/rbxui.mjs`) y **servidor MCP** (`cli/mcp.mjs`) para que Claude use el editor |
| Figma AI | ✅ | Claude diseña escribiendo el JSON y revisa el render con la CLI (ver CLAUDE.md) |

---

## ❌ Lo que no he podido hacer (y cómo puedes ayudar)

1. **Verificar en Roblox Studio real.** No tengo acceso a Studio desde la nube. Todo está validado con
   rbx-dom (el parser de Rojo) y con Lune, pero conviene que lo pruebes y compares el editor con Studio
   (lista concreta en `docs/VERIFY_IN_STUDIO.md`). Con capturas de Studio puedo ajustar la vista previa al píxel.
2. **Iconos Stud (pack de gvesster).** No me los podías pasar y su licencia no permite redistribuirlos, así que
   no están incluidos. Se pueden importar al proyecto como imágenes (Recursos › arrastrar la carpeta). Si
   quieres, podemos añadir un "importador de packs" que los etiquete por nombre.
3. **ui-resources.com.** El proxy de la nube bloquea esa web (403), así que no he podido revisarla ni integrar sus
   recursos. Si me pasas los archivos o la estructura de su `index.json`, hago un navegador de recursos dentro
   del editor.
4. **Subida automática de imágenes a Roblox.** Hoy se suben a mano (Asset Manager › Bulk Import) y se pega el ID.
   Para hacerlo automático hace falta una API key de Roblox Open Cloud con permiso de Assets. No me la pases por
   chat: la configuramos como secreto.
5. **Fuentes exclusivas de Roblox** (Builder Sans/Mono/Extended, Zekton, Guru, Highway Gothic, Accanthis,
   Roman Antique). No son libres, así que la vista previa usa una fuente parecida. Puedes cargarlas desde tu
   Studio (Menú › Fuentes de Roblox) o pasármelas para que las incluya si la licencia lo permite (la de Builder
   permite usarla para crear contenido de Roblox).
6. **Propiedades de componente** (booleanas o de texto, como en Figma). Las variantes básicas y el swap ya están.
   Me falta decidir si en Roblox deberían exportarse como atributos y un script que cambie el estado en tiempo
   real (p. ej. botón bloqueado/desbloqueado). Dime cómo lo usarías en tu juego.
7. **Colaboración en tiempo real, comentarios y compartir.** Necesita un servidor con cuentas (p. ej. Supabase o
   Firebase). Si quieres lanzarlo como servicio, habría que decidir hosting y cuentas.
8. **Publicar la web.** El workflow de GitHub Pages está listo (`.github/workflows/pages.yml`). Tienes que
   activarlo una vez en el repositorio: Settings › Pages › Source = "GitHub Actions", y fusionar a `main`.
9. **Probar el plugin de sincronización en vivo.** Ya está hecho (`docs/LIVE_SYNC.md`), pero no lo he podido
   probar dentro de Studio. Si lo publicas en tu cuenta de Roblox, cualquiera podrá instalarlo desde la Creator Store.
10. **Vectores, formas libres y efectos que Roblox no tiene** (sombra interior, blur de capa, blend modes). Solo se
    podrían hacer rasterizando a imagen. Si los quieres, añado "convertir a imagen" automático al exportar.
