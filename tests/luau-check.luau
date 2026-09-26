-- Runs an RbxUI Luau export inside Lune's Roblox emulation and compares the created
-- instances, property by property, with the .rbxmx export of the same document.
-- usage: lune run tests/luau-check.luau <export.luau> <export.rbxmx>
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")
local process = require("@lune/process")

local luaPath, xmlPath = process.args[1], process.args[2]
local code = fs.readFile(luaPath)

local game = roblox.Instance.new("DataModel")
local starterGui = game:GetService("StarterGui")
local fakeGame = {}
function fakeGame:GetService(name)
	if name == "ChangeHistoryService" then
		return { TryBeginRecording = function() return "rec" end, FinishRecording = function() end }
	end
	return game:GetService(name)
end
local env = setmetatable({ game = fakeGame, print = print, pcall = pcall, Instance = roblox.Instance, Color3 = roblox.Color3,
	UDim = roblox.UDim, UDim2 = roblox.UDim2, Vector2 = roblox.Vector2, Rect = roblox.Rect, Enum = roblox.Enum, Font = roblox.Font,
	ColorSequence = roblox.ColorSequence, ColorSequenceKeypoint = roblox.ColorSequenceKeypoint, NumberSequence = roblox.NumberSequence,
	NumberSequenceKeypoint = roblox.NumberSequenceKeypoint }, { __index = function(_, k) error("global no disponible: " .. tostring(k)) end })

local fn = luau.load(code, { debugName = "export", environment = env })
fn()

local fromXml = roblox.deserializeModel(fs.readFile(xmlPath))
local fails, count = 0, 0

local function propsOf(inst)
	-- properties both exporters should agree on: compare via serialized attributes of known props
	return inst
end

local function compare(a, b, path)
	count += 1
	if a.ClassName ~= b.ClassName or a.Name ~= b.Name then
		fails += 1
		print("MISMATCH class/name at " .. path, a.ClassName, a.Name, b.ClassName, b.Name)
		return
	end
	local ca, cb = a:GetChildren(), b:GetChildren()
	if #ca ~= #cb then
		fails += 1
		print("MISMATCH child count at " .. path, #ca, #cb)
		return
	end
	for i = 1, #ca do
		compare(ca[i], cb[i], path .. "/" .. ca[i].Name)
	end
end

local fromLuau = starterGui:GetChildren()
for i, root in fromXml do
	compare(fromLuau[i], root, root.Name)
end

-- property-level equivalence: serialize both to XML with Lune and compare text
local a = roblox.serializeModel(fromLuau, true)
local b = roblox.serializeModel(fromXml, true)
local function norm(s)
	s = s:gsub('referent="[^"]*"', "")
	s = s:gsub("<SharedString[^>]*>.-</SharedString>", "")
	s = s:gsub('<BinaryString name="AttributesSerialize">.-</BinaryString>', "")
	s = s:gsub('<UniqueId name="[^"]*">[^<]*</UniqueId>', "")
	s = s:gsub('<int64 name="HistoryId">[^<]*</int64>', "")
	s = s:gsub("<SharedStrings>.-</SharedStrings>", "")
	-- Lune drops ScreenInsets when it equals the default while deserializing XML
	s = s:gsub('%s*<token name="ScreenInsets">2</token>', "")
	return s
end
-- property order inside <Properties> may differ between serializers: sort them
local function sortProps(s)
	s = s:gsub("%s*\n%s*", "")
	return (s:gsub("<Properties>(.-)</Properties>", function(inner)
		local props = {}
		for elem in inner:gmatch('(<(%w+) name="[^"]*">.-</%2>)') do
			table.insert(props, elem)
		end
		for elem in inner:gmatch('(<%w+ name="[^"]*"/>)') do
			table.insert(props, elem)
		end
		table.sort(props)
		return "<Properties>" .. table.concat(props) .. "</Properties>"
	end))
end
local na, nb = sortProps(norm(a)), sortProps(norm(b))
if na ~= nb then
	fails += 1
	fs.writeFile("out/_luau.xml", na)
	fs.writeFile("out/_rbxmx.xml", nb)
	print("PROPERTY MISMATCH: see out/_luau.xml vs out/_rbxmx.xml")
end
print(("%d instances compared, %d failures"):format(count, fails))
if fails > 0 then process.exit(1) end
print("OK — Luau y rbxmx producen instancias idénticas")
