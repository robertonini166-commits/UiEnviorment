-- Compiles Luau files (syntax check). usage: lune run tests/luau-compile.luau <file>...
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local process = require("@lune/process")
local bad = 0
for _, path in process.args do
	local ok, err = pcall(luau.compile, fs.readFile(path))
	if not ok then
		bad += 1
		print("SYNTAX ERROR in " .. path .. ": " .. tostring(err))
	end
end
if bad > 0 then process.exit(1) end
print("OK — " .. #process.args .. " archivo(s) Luau compilan")
