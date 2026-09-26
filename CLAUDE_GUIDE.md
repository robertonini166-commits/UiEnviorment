# Guide: designing Roblox UIs with Claude and RbxUI Studio

This guide is for anyone with Claude who wants to build Roblox interfaces (shops, inventories, HUDs, daily
rewards…) and bring them into Roblox Studio **exactly as designed**. Every text, frame and stroke arrives as a
separate instance you can animate.

Claude writes the design. RbxUI draws it so Claude can check it, then exports it to Roblox. You can touch it up
by hand in the editor if you want.

> The editor's interface is currently in Spanish. Where this guide mentions a button or panel, the Spanish
> label is shown in **bold** followed by its meaning, e.g. **Exportar a Roblox** (Export to Roblox).

---

## 1. Choose how you'll work

| You have… | Best option | What Claude can do |
|---|---|---|
| **Claude Code** (terminal, desktop app or web) | [Option A](#option-a-claude-code-recommended) | Everything: design, **look at the PNG**, fix, validate and export the `.rbxmx` |
| **Claude Desktop** | [Option B](#option-b-claude-desktop-with-mcp) | The same, through the MCP server |
| Only **claude.ai** (chat) | [Option C](#option-c-claudeai-chat-only) | Write the JSON; you paste it into the editor and export |

### Option A: Claude Code (recommended)

```bash
git clone https://github.com/robertonini166-commits/UiEnviorment RbxUI
cd RbxUI
npm install                  # installs Playwright (so Claude can see its designs as PNGs)
claude
```

Claude Code reads [`CLAUDE.md`](CLAUDE.md) automatically when it opens the folder. It already knows the
format, the style and the commands. Just ask for what you want (see [example requests](#3-example-requests)).

If Playwright can't find a browser, run `npx playwright install chromium`.

### Option B: Claude Desktop with MCP

1. Clone the repo and install as in option A.
2. Add the server to `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "rbxui": { "command": "node", "args": ["/path/to/RbxUI/cli/mcp.mjs"] }
     }
   }
   ```

3. Restart Claude Desktop. You'll see the `rbxui_*` tools: guide, templates, render, validate, export,
   import and fonts. Details in [docs/MCP.md](docs/MCP.md).

In Claude Code you can also add it with `claude mcp add rbxui -- node /path/to/RbxUI/cli/mcp.mjs`.

### Option C: claude.ai chat only

1. Open the editor: run `node cli/rbxui.mjs serve` and go to http://localhost:5170, or use the published
   site if there is one.
2. Paste the [chat prompt](#5-prompt-for-the-claudeai-chat) below into the chat, then ask for your design.
3. Copy the JSON Claude gives you, click on the editor canvas and press **Ctrl+V**. It appears as a new
   screen. You can also save it as `my-ui.json` and drag it onto the editor.
4. Adjust whatever you like, then press **Exportar a Roblox** (Export to Roblox).

With this option Claude can't see the result. If something looks wrong, take a screenshot of the editor and
send it to Claude.

---

## 2. Bringing it into Roblox Studio

| Format | How to import it |
|---|---|
| **`.rbxmx`** (recommended) | In Studio's Explorer: right-click **StarterGui › Insert from File…** |
| **Luau (Command Bar)** | Studio › **View › Command Bar**, paste the code and press Enter. The UI is created in StarterGui; Ctrl+Z undoes it |
| **ModuleScript** | Builds the UI from code: `require(module).ScreenName(player.PlayerGui)` |

If the design has buttons that open or close windows, a `LocalScript` called `RbxUIController` is exported
too. It plays the animations with TweenService.

**Images.** Images you add in the editor only exist on your computer. To use them in Roblox:
1. Upload them in Studio with **View › Asset Manager › Bulk Import**.
2. Copy each `rbxassetid`.
3. Paste it into the editor's **Recursos** (Assets) panel before exporting.

The exporter warns you about any images that are still missing.

**Live sync.** Every change can appear instantly in Studio; see [docs/LIVE_SYNC.md](docs/LIVE_SYNC.md).

---

## 3. Example requests

Copy and adapt:

- *"Make me a simulator-style pet shop with 6 eggs in a grid, coin prices and a buy-with-Robux button.
  Render it, review it and export it as rbxmx."*
- *"Build my game's HUD: coins and gems in the top left, SHOP, INVENTORY and REBIRTH buttons on the left,
  and make each button open its window with a pop animation."*
- *"Start from the daily reward template and change it to 7 days with purple and gold colors."*
- *"Import `MyUI.rbxmx` (I saved it from Studio with Save to File), give it the Stud Style and send it back."*
- *"This is a screenshot of the UI I want [image]. Recreate it as closely as possible."*

Tips:

- Say **how many screens/windows** you want and **what opens what**.
- Give references, such as screenshots of games or [ui-resources.com](https://ui-resources.com/).
- When something isn't right, be specific: *"bigger title"*, *"remove the bottom text"*, *"green button,
  not blue"*.

---

## 4. Instructions for Claude

> This section is written for Claude. If you use Claude Code inside the repo, it already has it in `CLAUDE.md`.

### Workflow

1. **Start from a template** whenever possible:
   - Pieces: `window`, `window-blue`, `btn-lime`, `btn-pink`, `btn-red`, `btn-round`, `card`, `hud`,
     `currency`, `progress`, `tabs`, `toggle`, `title`, `notification`, `reward`, `panel`.
   - Screens: `shop`, `inventory`, `daily`, `rebirth`, `premium`, `settings`, `hud`.
   - With MCP, call `rbxui_template {name}`.
   - In the repo, use the builders in `app/js/editor/templates.js` (`studWindow`, `studButton`,
     `robuxButton`, `itemCard`, `hudButton`, `currency`, `gloss`, `studs`…) and
     `app/js/editor/screen-templates.js`.
2. Write the document as JSON ([docs/FORMAT.md](docs/FORMAT.md)).
3. **Render it and look at the PNG** before showing it.
   - Run `node cli/rbxui.mjs render ui.json --out out/ui.png` (or `rbxui_render`) and open it with your
     image-reading tool.
   - Iterate until it looks right: alignment, margins, text that doesn't get cut off, contrast.
4. **Validate** with `node cli/rbxui.mjs validate ui.json` (or `rbxui_validate`). It must finish with no
   errors.
5. **Export** with `node cli/rbxui.mjs export ui.json --format rbxmx --out out/ui.rbxmx` (or `rbxui_export`),
   then explain to the user how to import it (section 2).

### Rules that must never be broken

- Only **real Roblox classes and properties**, with their exact names. No effects Roblox can't reproduce
  (backdrop blur, CSS shadows, SVG masks…).
- Only the **40 official Roblox fonts** (`rbxui_fonts` / `node cli/rbxui.mjs fonts`). The default is
  `Montserrat`, weight `Heavy`.
- **`UIGradient` multiplies** the parent's color. Leave `BackgroundColor3: "#FFFFFF"` on the piece that has
  the gradient, and put the text in a child `TextLabel`; otherwise the gradient tints the text too.
- The usable area starts **58 px below** Roblox's top bar, unless you set `IgnoreGuiInset: true`.
- **Unique names among siblings** (`ShopWindow`, `BuyButton`…), because game scripts rely on them.
- Windows opened by a button start with `"Visible": false`. They open through an interaction:
  `{"trigger":"click","action":"toggle","target":"ShopWindow","animation":"pop"}`.
- If you use pixel sizes, set `design.autoScale: true` so the UI scales on phones.
- The Robux logo is **an image**: an empty `ImageLabel` named `RobuxIcon` where the user will put the id.
  Never draw it by hand.

### Default style ("Stud Style")

Unless the user asks for something else:

- **Square** corners and a **black** outline (`UIStroke` Border, 3-4 px, `LineJoinMode: Miter`).
- **Glassy shine** on colored pieces: a vertical light→dark `UIGradient` plus `Gloss`, `Shine`, `Reflex` and
  `Bevel` (use `gloss()`).
- **Studs** on colored pieces: an `ImageLabel` with `Image: "asset:studs"`, `ScaleType: Tile`, `TileSize`
  37 px and transparency ~0.55.
- Windows:
  - **Charcoal body** (`#31333B → #292B32`).
  - **Color only in the header**: 50 px tall, with a 40 px icon and a 26 px title.
  - A square red X.
- **White** text with a black `UIStroke` (`ApplyStrokeMode: Contextual`).
- Colors with meaning: **lime** = buy/action, **pink** = Robux, **red** = close.
  - No pastels and no white backgrounds.
  - Don't keep reusing navy blue.
- Little text.
- Icons are big (70-85 % of their slot) and still.
- Animation only on:
  - opening windows (`pop`, ~0.2 s);
  - buttons (`buttonFx` hover 1.06 / press 0.9).

Palette (`PALETTE`, light → dark pairs):

| | | | |
|---|---|---|---|
| lime `#B8FF5E → #43C22C` | pink `#FF8AD0 → #E0479E` | red `#FF5B5B → #C81E1E` | orange `#FFC04D → #FF7A00` |
| blue `#6FD0FF → #2C86D6` | purple `#D08CFF → #8B3FD6` | yellow `#FFE45E → #F2A900` | teal `#5EF2D8 → #1BA88F` |

### Format cheat sheet

| Roblox type | In JSON |
|---|---|
| Color3 | `"#FF7A00"` |
| UDim2 | `[xScale, xOffset, yScale, yOffset]` → `[0.5, 0, 1, -20]` |
| UDim | `[scale, offset]` → `[0, 8]` |
| Vector2 | `[0.5, 0.5]` |
| Enum | the item name: `"Center"`, `"Heavy"`, `"Tile"` |
| ColorSequence | `[[0, "#FFC04D"], [1, "#FF7A00"]]` |
| NumberSequence | `[[0, 0], [1, 1]]` |
| Font | `{"family": "Montserrat", "weight": "Heavy", "style": "Normal"}` |
| Image | `"rbxassetid://123"` or `"asset:<local id>"` |

Modifiers go as **children** of the object they modify: `UICorner`, `UIStroke`, `UIGradient`, `UIPadding`,
`UIListLayout`, `UIGridLayout`, `UIScale`, `UIShadow`, `UIAspectRatioConstraint`…

### Minimal valid example

A shop window with an orange header and a buy button. It passes `validate` and exports as 15 instances.

```json
{
  "format": "rbxui", "version": 1, "name": "Example",
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
              "props": { "Text": "SHOP", "TextSize": 26, "FontFace": { "family": "Montserrat", "weight": "Heavy", "style": "Normal" },
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
              "props": { "Text": "BUY", "TextSize": 24, "FontFace": { "family": "Montserrat", "weight": "Heavy", "style": "Normal" },
                         "TextColor3": "#FFFFFF", "BackgroundTransparency": 1, "Size": [1, 0, 1, 0], "ZIndex": 5 },
              "children": [{ "ClassName": "UIStroke", "props": { "Thickness": 2, "Color": "#000000", "ApplyStrokeMode": "Contextual", "LineJoinMode": "Round" } }] }
          ] }
      ]
    }]
  }]
}
```

For the full look (shine, studs, shadow, red X), use the templates instead of writing everything by hand.

---

## 5. Prompt for the claude.ai chat

If you only use the chat, paste this at the start of the conversation, then ask for your design:

```text
You will design Roblox interfaces for the RbxUI Studio editor. Reply with a single JSON block in
this format: {"format":"rbxui","version":1,"name":"...","screens":[ScreenGui...]}.
Each node is {"ClassName","Name","props":{...},"children":[...]} using REAL Roblox classes and
properties. Types: Color3 "#RRGGBB"; UDim2 [xs,xo,ys,yo]; UDim [s,o]; Vector2 [x,y]; enums by name;
ColorSequence [[t,"#hex"],...]; Font {"family":"Montserrat","weight":"Heavy","style":"Normal"}.
Modifiers (UICorner, UIStroke, UIGradient, UIPadding, UIListLayout, UIGridLayout, UIScale,
UIShadow...) go as children. Each ScreenGui has "design":{"device":"studio","width":1280,
"height":720,"autoScale":true,"background":"#3A6EA5"}.
Rules: official Roblox fonts only; UIGradient multiplies the parent's color, so set
BackgroundColor3 "#FFFFFF" on pieces with a gradient and put text in a child TextLabel; the usable
area starts 58 px below the top bar; unique names among siblings; windows opened by a button start
with "Visible":false and the button gets "interactions":[{"trigger":"click","action":"toggle",
"target":"WindowName","animation":"pop"}]; buttons get "buttonFx":{"hover":1.06,"press":0.9}.
"Stud Style": square corners, black UIStroke Border 3-4 px with LineJoinMode Miter, vertical
light→dark gradient on everything colored, windows with a #31333B→#292B32 body and color only in
the 50 px header, white Montserrat Heavy text with a black Contextual UIStroke, lime = buy, pink =
Robux, red = close, no pastels or white backgrounds, little text.
```

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| `render` fails with a browser error | Run `npm install`, then `npx playwright install chromium` |
| In Studio the UI sits lower than in the editor | That's Roblox's top bar (58 px). The editor shows it too; if you don't want it, set `IgnoreGuiInset: true` |
| Images come out empty in Studio | Their `rbxassetid` is missing: upload them with Asset Manager › Bulk Import and paste the ids into **Recursos** (Assets) |
| A gradient doesn't show | The parent has a transparent background (`BackgroundTransparency: 1`) or isn't white. `validate` warns about it |
| Text takes the gradient's color | The text is on the same object as the `UIGradient`: move it to a child `TextLabel` |
| I can't download the `.rbxmx` | You're in an embedded view (e.g. a Claude artifact). Use **Copiar código** (Copy code) and the Command Bar, or open the editor locally |
| The UI looks huge or tiny on phones | Turn on `design.autoScale: true` or use scale sizes (`[0.3, 0, 0.4, 0]`) |

More documentation (in Spanish):
- [docs/FORMAT.md](docs/FORMAT.md): full format.
- [docs/MCP.md](docs/MCP.md): MCP server.
- [docs/LIVE_SYNC.md](docs/LIVE_SYNC.md): live sync with Studio.
- [docs/FIGMA_PARITY.md](docs/FIGMA_PARITY.md): which Figma features exist and which are missing.
- [docs/VERIFY_IN_STUDIO.md](docs/VERIFY_IN_STUDIO.md): how to check in Studio that the export is exact.
