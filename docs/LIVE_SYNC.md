# Sincronización en vivo con Roblox Studio

Como Rojo, pero para UI: cada cambio que haces en RbxUI Studio aparece al momento en StarterGui de tu juego,
como instancias reales.

```
Editor (navegador)  ──POST──►  node cli/rbxui.mjs sync (localhost:34872)  ◄──GET cada 1 s──  Plugin RbxUI Sync (Studio)
```

## Configuración (una vez)

1. Instala Node.js 18+ y descarga este repositorio.
2. Genera el plugin y cópialo a tu carpeta de plugins de Roblox:
   ```bash
   node cli/rbxui.mjs plugin
   # Windows: copia out/RbxUISync.rbxmx a %LOCALAPPDATA%\Roblox\Plugins
   # Mac:     copia out/RbxUISync.rbxmx a ~/Documents/Roblox/Plugins
   ```
3. Reinicia Studio. Aparecerá la pestaña **Plugins › RbxUI › Sync**.

## Uso

1. `node cli/rbxui.mjs sync` (déjalo abierto).
2. En el editor: Menú › **Sincronizar con Studio (en vivo)**. Arriba a la derecha aparece "● Studio".
3. En Studio pulsa **Sync** y permite la conexión a `localhost` la primera vez.

Cada cambio reemplaza en StarterGui los ScreenGui con el mismo nombre. Se puede deshacer con Ctrl+Z en Studio.
Las imágenes usan su `rbxassetid`; súbelas antes (panel Recursos).
