$env:NODE_OPTIONS="--max-old-space-size=12288"

npx tsx packages/clis/parser/index.ts `
  -g "D:/SteamLibrary/steamapps/common/Euro Truck Simulator 2" `
  -o ./data
