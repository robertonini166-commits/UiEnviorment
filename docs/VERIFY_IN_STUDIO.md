# Comprobaciones pendientes en Roblox Studio

Desde la nube no puedo abrir Roblox Studio. Las exportaciones ya están validadas con las herramientas de la
comunidad (rbx-dom/Rojo leen el `.rbxmx` sin errores y Lune ejecuta el Luau y crea las mismas instancias).
Aun así, hay detalles de **cómo dibuja Roblox** que he implementado según la documentación oficial y conviene
comparar con Studio. Si encuentras diferencias, haz una captura de Studio y otra del editor y las ajusto.

Cómo probar: Exportar › `.rbxmx` › en Studio, StarterGui › Insert from File. Pon la ventana de juego a
1280×720 (Test › Device › "Custom 1280×720"), o el tamaño de la pantalla que diseñaste, y compara.

| # | Qué comprobar | Cómo lo hace el editor | Riesgo |
|---|---|---|---|
| 1 | **Tamaño del texto** | `TextSize` = altura de línea (ascent + descent de la fuente). Montserrat sale ~18 % más pequeño que en CSS (coincide con el ×1.25 que habías medido antes) | Medio |
| 2 | Posición vertical del texto y `LineHeight` > 1 | Primera línea con su altura; las siguientes avanzan `TextSize × LineHeight` | Medio |
| 3 | `UIGradient` con `Rotation` ≠ 0/90/180 | Se calcula en el espacio normalizado del objeto y los extremos tocan las esquinas | Medio |
| 4 | `UIGradient` Radial y Conical | Radial: radio (ancho + alto) / 4. Conical: empieza a la derecha y gira en sentido horario | Medio |
| 5 | `UIStroke` Outer con `LineJoinMode` Round en esquinas rectas | Esquina exterior redondeada con radio = grosor | Bajo |
| 6 | `UIStroke.StrokeSizingMode = ScaledSize` | Grosor × min(ancho, alto) (en texto, × TextSize) | Alto (sin datos) |
| 7 | `UIShadow` (BlurRadius, Spread) | Blur gaussiano con desviación = BlurRadius / 2 | Medio |
| 8 | Barra superior: altura de 58 px | `ScreenInsets = CoreUISafeInsets` deja 58 px arriba | Bajo |
| 9 | `UIScale` junto con `Rotation` | Escala alrededor del AnchorPoint y rota alrededor del centro | Bajo |
| 10 | `TextScaled` | Tamaño entero más grande (1-100) que cabe con ajuste de líneas | Bajo |
| 11 | `AutomaticSize` en textos con `TextWrapped` | Usa el ancho actual y crece en alto | Bajo |
| 12 | `UIListLayout` con Flex (Fill, SpaceBetween…) y `Wraps` | Implementado según la documentación de flex | Bajo |
| 13 | `CanvasGroup.GroupColor3` | No se simula el tinte (solo la transparencia) | Bajo |
| 14 | El LocalScript de interacciones | Revisado con el compilador de Luau; conviene probarlo con Play | Medio |
| 15 | Radios individuales de UICorner (beta) | Necesitan activar "New UI Capabilities" en las betas de Studio | Bajo |

También ayuda una **captura del juego** como fondo del editor (panel de la pantalla › "Usar captura del juego
como fondo"): así se diseña encima del juego real.
