// Generates the LocalScript that brings prototype interactions to life inside Roblox:
// buttons that open/close/toggle windows with animations (TweenService), hover/press
// feedback via UIScale, optional background blur. Pure data + a small generic engine.

import { luaString } from './luau.js';
import { walk } from '../core/model.js';

export function hasInteractions(screen) {
  let any = false;
  walk(screen, (n) => {
    if (n.interactions?.length || n.buttonFx) any = true;
  });
  return any;
}

/** Path of names from the ScreenGui to a node. */
function pathTo(screen, id) {
  const out = [];
  const visit = (n, acc) => {
    if (n.id === id) {
      out.push(...acc);
      return true;
    }
    for (const c of n.children) if (visit(c, [...acc, c.Name])) return true;
    return false;
  };
  visit(screen, []);
  return out;
}

const luaPath = (p) => `{${p.map(luaString).join(', ')}}`;

export function buildRuntime(screen) {
  const actions = [];
  const fx = [];
  walk(screen, (n) => {
    if (n.buttonFx) fx.push(`\t{ path = ${luaPath(pathTo(screen, n.id))}, hover = ${n.buttonFx.hover ?? 1.06}, press = ${n.buttonFx.press ?? 0.9} },`);
    for (const it of n.interactions || []) {
      const tp = it.target && it.action !== 'navigate' ? pathTo(screen, it.target) : null;
      if (it.target && tp && !tp.length) continue;
      if (it.action === 'navigate' && !it.screen) continue;
      actions.push(`\t{ path = ${luaPath(pathTo(screen, n.id))}, trigger = ${luaString(it.trigger || 'click')}, action = ${luaString(it.action || 'toggle')}, target = ${tp ? luaPath(tp) : 'nil'}, anim = ${luaString(it.animation || 'pop')}, time = ${Number(it.duration ?? 0.22)}, blur = ${it.blur ? 'true' : 'false'}, exclusive = ${it.exclusive === false ? 'false' : 'true'}, key = ${luaString(it.key || 'E')}, delay = ${Number(it.delay ?? 3)}, screen = ${it.screen ? luaString(it.screen) : 'nil'} },`);
    }
  });
  return `--!strict
-- RbxUIController — generado por RbxUI Studio.
-- Da vida a las interacciones diseñadas en el editor (abrir/cerrar ventanas con animación,
-- efecto hover/pulsar en botones). Puedes editarlo libremente.

local TweenService = game:GetService("TweenService")
local Lighting = game:GetService("Lighting")
local UserInputService = game:GetService("UserInputService")
local gui = script.Parent

local BUTTON_FX = {
${fx.join('\n')}
}

local ACTIONS = {
${actions.join('\n')}
}

local function find(path: {string}): Instance?
	local obj: Instance = gui
	for _, name in path do
		local nextObj = obj:WaitForChild(name, 5)
		if not nextObj then
			warn("[RbxUI] No se encontró " .. table.concat(path, "/"))
			return nil
		end
		obj = nextObj
	end
	return obj
end

local function scaleOf(obj: Instance): UIScale
	local s = obj:FindFirstChildOfClass("UIScale")
	if not s then
		s = Instance.new("UIScale")
		s.Name = "RbxUIScale"
		s.Parent = obj
	end
	return s :: UIScale
end

-- transparency snapshot so fades return to the designed values
local TRANSPARENCY_PROPS = { "BackgroundTransparency", "TextTransparency", "TextStrokeTransparency", "ImageTransparency", "Transparency", "GroupTransparency", "ScrollBarImageTransparency" }
local originals: {[Instance]: {[string]: number}} = {}
local function snapshot(root: Instance)
	if originals[root] then return end
	local map = {}
	for _, d in { root, table.unpack(root:GetDescendants()) } do
		for _, prop in TRANSPARENCY_PROPS do
			local ok, v = pcall(function() return (d :: any)[prop] end)
			if ok and typeof(v) == "number" then
				map[d] = map[d] or {}
				map[d][prop] = v
			end
		end
	end
	originals[root] = map :: any
end
local function fade(root: Instance, toVisible: boolean, t: number)
	snapshot(root)
	for inst, props in (originals[root] :: any) do
		for prop, v in props do
			if toVisible then
				(inst :: any)[prop] = 1
				TweenService:Create(inst, TweenInfo.new(t), { [prop] = v }):Play()
			else
				TweenService:Create(inst, TweenInfo.new(t), { [prop] = 1 }):Play()
			end
		end
	end
end

local blur: BlurEffect? = nil
local openCount = 0
local function setBlur(on: boolean)
	if on then
		openCount += 1
		if not blur then
			blur = Instance.new("BlurEffect")
			blur.Name = "RbxUIBlur"
			blur.Size = 0
			blur.Parent = Lighting
		end
		TweenService:Create(blur :: BlurEffect, TweenInfo.new(0.2), { Size = 16 }):Play()
	else
		openCount = math.max(0, openCount - 1)
		if blur and openCount == 0 then
			TweenService:Create(blur, TweenInfo.new(0.2), { Size = 0 }):Play()
		end
	end
end

local opened: {[GuiObject]: {blur: boolean}} = {}
local busy: {[GuiObject]: boolean} = {}
local homePos: {[GuiObject]: UDim2} = {}

local function show(win: GuiObject, anim: string, t: number, useBlur: boolean)
	if busy[win] or win.Visible then return end
	busy[win] = true
	homePos[win] = homePos[win] or win.Position
	win.Position = homePos[win]
	win.Visible = true
	if anim == "pop" then
		local s = scaleOf(win)
		s.Scale = 0.6
		TweenService:Create(s, TweenInfo.new(t, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
	elseif anim == "fade" then
		fade(win, true, t)
	elseif anim:sub(1, 5) == "slide" then
		local off = ({ slideUp = UDim2.fromScale(0, 0.35), slideDown = UDim2.fromScale(0, -0.35), slideLeft = UDim2.fromScale(0.35, 0), slideRight = UDim2.fromScale(-0.35, 0) })[anim] or UDim2.new()
		win.Position = homePos[win] + off
		TweenService:Create(win, TweenInfo.new(t, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Position = homePos[win] }):Play()
	end
	opened[win] = { blur = useBlur }
	if useBlur then setBlur(true) end
	task.delay(t, function() busy[win] = nil end)
end

local function hide(win: GuiObject, anim: string, t: number)
	if busy[win] or not win.Visible then return end
	busy[win] = true
	local info = opened[win]
	opened[win] = nil
	if info and info.blur then setBlur(false) end
	if anim == "pop" then
		TweenService:Create(scaleOf(win), TweenInfo.new(t * 0.8, Enum.EasingStyle.Back, Enum.EasingDirection.In), { Scale = 0.6 }):Play()
	elseif anim == "fade" then
		fade(win, false, t)
	elseif anim:sub(1, 5) == "slide" then
		homePos[win] = homePos[win] or win.Position
		local off = ({ slideUp = UDim2.fromScale(0, 0.35), slideDown = UDim2.fromScale(0, -0.35), slideLeft = UDim2.fromScale(0.35, 0), slideRight = UDim2.fromScale(-0.35, 0) })[anim] or UDim2.new()
		TweenService:Create(win, TweenInfo.new(t, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { Position = homePos[win] + off }):Play()
	end
	task.delay(anim == "none" and 0 or t, function()
		win.Visible = false
		if anim == "pop" then scaleOf(win).Scale = 1 end
		if anim == "fade" and originals[win] then
			for inst, props in (originals[win] :: any) do
				for prop, v in props do (inst :: any)[prop] = v end
			end
		end
		if homePos[win] then win.Position = homePos[win] end
		busy[win] = nil
	end)
end

local function run(a)
	if a.action == "navigate" then
		local other = gui.Parent and gui.Parent:FindFirstChild(a.screen)
		if other and other:IsA("ScreenGui") then
			other.Enabled = true
			gui.Enabled = false
		else
			warn("[RbxUI] No se encontró la pantalla " .. tostring(a.screen))
		end
		return
	end
	local target = a.target and find(a.target) :: GuiObject?
	if a.action == "closeParent" then
		-- close the nearest ancestor window that this runtime opened (or any visible Frame ancestor)
		local btn = find(a.path)
		local p = btn and btn.Parent
		while p and p ~= gui do
			if p:IsA("GuiObject") and (opened[p :: GuiObject] or p.Parent == gui) then
				hide(p :: GuiObject, a.anim, a.time)
				return
			end
			p = p.Parent
		end
		return
	end
	if not target then return end
	if a.action == "open" or (a.action == "toggle" and not target.Visible) then
		if a.exclusive then
			for win in opened do
				if win ~= target then hide(win, a.anim, a.time) end
			end
		end
		show(target, a.anim, a.time, a.blur)
	elseif a.action == "close" or a.action == "toggle" then
		hide(target, a.anim, a.time)
	end
end

for _, a in ACTIONS do
	task.spawn(function()
		local obj = find(a.path)
		if not obj or not obj:IsA("GuiObject") then return end
		if a.trigger == "click" and obj:IsA("GuiButton") then
			(obj :: GuiButton).Activated:Connect(function() run(a) end)
		elseif a.trigger == "hover" then
			(obj :: GuiObject).MouseEnter:Connect(function() run(a) end)
		elseif a.trigger == "key" then
			local code = (Enum.KeyCode :: any)[a.key]
			UserInputService.InputBegan:Connect(function(input, processed)
				if not processed and input.KeyCode == code and gui.Enabled then run(a) end
			end)
		elseif a.trigger == "delay" then
			task.delay(a.delay, function() run(a) end)
		end
	end)
end

for _, f in BUTTON_FX do
	task.spawn(function()
		local obj = find(f.path)
		if not obj or not obj:IsA("GuiButton") then return end
		local btn = obj :: GuiButton
		local s = scaleOf(btn)
		local info = TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
		local hovering = false
		btn.MouseEnter:Connect(function() hovering = true; TweenService:Create(s, info, { Scale = f.hover }):Play() end)
		btn.MouseLeave:Connect(function() hovering = false; TweenService:Create(s, info, { Scale = 1 }):Play() end)
		btn.MouseButton1Down:Connect(function() TweenService:Create(s, info, { Scale = f.press }):Play() end)
		btn.MouseButton1Up:Connect(function() TweenService:Create(s, info, { Scale = hovering and f.hover or 1 }):Play() end)
	end)
end
`;
}
