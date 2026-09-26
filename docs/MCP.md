# Usar RbxUI desde Claude (servidor MCP)

RbxUI incluye un servidor [MCP](https://modelcontextprotocol.io) para que Claude diseñe interfaces de Roblox
directamente: escribe el diseño en JSON, lo **renderiza y lo mira**, lo valida y lo exporta para Studio.

## Instalación

Necesitas Node 18+ y, para renderizar, Playwright con Chromium:

```bash
git clone <este repo> RbxUI && cd RbxUI
npm install
npx playwright install chromium
```

### Claude Code

```bash
claude mcp add rbxui -- node /ruta/a/RbxUI/cli/mcp.mjs
```

### Claude Desktop

En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rbxui": { "command": "node", "args": ["/ruta/a/RbxUI/cli/mcp.mjs"] }
  }
}
```

## Herramientas

| Herramienta | Qué hace |
|---|---|
| `rbxui_guide` | Formato JSON, fuentes permitidas y guía de estilo. Claude la lee antes de diseñar |
| `rbxui_template` | Lista y devuelve plantillas (piezas del kit y pantallas: inventario, recompensa diaria, rebirth…) |
| `rbxui_render` | PNG de una pantalla o de un nodo (`node`, `scale`), dibujado con el motor de RbxUI |
| `rbxui_validate` | Revisa propiedades de Roblox, fuentes y errores típicos de diseño |
| `rbxui_export` | `.rbxmx`, Luau (Command Bar) o ModuleScript, con el LocalScript de interacciones |
| `rbxui_import_rbxmx` | Convierte una UI guardada desde Studio en documento RbxUI |
| `rbxui_fonts` | Las 40 familias oficiales de Roblox |

Ejemplo de conversación: *"Hazme una tienda de mascotas estilo simulador con 6 huevos y un botón de comprar con
Robux, y expórtala a rbxmx"*. Claude pide una plantilla, la adapta, la renderiza para revisarla, corrige lo que
no le guste y exporta el archivo para arrastrarlo a Studio.
