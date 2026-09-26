--[[
	RbxUI Sync — Roblox Studio plugin.
	Receives your RbxUI Studio design live (like Rojo): every change you make in the editor
	is rebuilt in StarterGui as real instances.

	1. On your PC: node cli/rbxui.mjs sync          (local server at http://localhost:34872)
	2. In the editor: Menu › "Sincronizar con Studio"
	3. In Studio: Plugins tab › RbxUI › "Sync" (allow the localhost request the first time)
]]

local HttpService = game:GetService("HttpService")
local StarterGui = game:GetService("StarterGui")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local URL = "http://localhost:34872"
local toolbar = plugin:CreateToolbar("RbxUI")
local button = toolbar:CreateButton("Sync", "Sincronizar con RbxUI Studio (localhost:34872)", "rbxasset://textures/ui/GuiImagePlaceholder.png")
button.ClickableWhenViewportHidden = true

local active = false
local lastVersion: string? = nil

local function get(path: string): (boolean, string)
	return pcall(function()
		return HttpService:GetAsync(URL .. path, true)
	end)
end

local function pull()
	local ok, res = get("/version")
	if not ok then
		warn("[RbxUI] No se puede conectar con " .. URL .. " (¿está corriendo `node cli/rbxui.mjs sync`?)")
		return false
	end
	local version = HttpService:JSONDecode(res).version
	if version == lastVersion or version == nil then
		return true
	end
	local ok2, code = get("/luau")
	if not ok2 then
		warn("[RbxUI] Error descargando la UI: " .. tostring(code))
		return false
	end
	local module = Instance.new("ModuleScript")
	module.Name = "RbxUIBuild"
	module.Source = code
	module.Parent = game:GetService("ServerStorage")
	local okReq, Build = pcall(require, module)
	module:Destroy()
	if not okReq then
		warn("[RbxUI] Error en el código recibido: " .. tostring(Build))
		return false
	end
	local recording = ChangeHistoryService:TryBeginRecording("RbxUI Sync")
	for _, build in Build do
		local ok3, gui = pcall(build, nil)
		if ok3 and gui then
			local old = StarterGui:FindFirstChild(gui.Name)
			if old then old:Destroy() end
			gui.Parent = StarterGui
		else
			warn("[RbxUI] Error construyendo una pantalla: " .. tostring(gui))
		end
	end
	if recording then
		ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
	end
	lastVersion = version
	print("[RbxUI] UI actualizada (" .. tostring(version) .. ")")
	return true
end

button.Click:Connect(function()
	active = not active
	button:SetActive(active)
	if active then
		print("[RbxUI] Sync activado")
		task.spawn(function()
			while active do
				pull()
				task.wait(1)
			end
		end)
	else
		print("[RbxUI] Sync desactivado")
	end
end)
