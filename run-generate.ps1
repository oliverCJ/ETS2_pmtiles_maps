<#
.SYNOPSIS
    ETS2/ATS 地图生成脚本

.DESCRIPTION
    将 parser 输出的 JSON 数据生成 PMTiles/GeoJSON 等格式文件。

.PARAMETER Maps
    游戏地图，可多选。可用值：europe（欧卡）、usa（美卡）。
    默认：europe
    示例：-Maps europe,usa

.PARAMETER Commands
    要执行的导出子命令，可多选。
    可用值：map、spritesheet、cities、graph、contours、footprints、achievements
    默认：map
    示例：-Commands map,cities,spritesheet

.PARAMETER Type
    输出格式（仅对支持的命令有效：map、contours、footprints）。
    可用值：pmtiles、geojson、mbtiles（可多选）
    默认：pmtiles
    示例：-Type pmtiles,geojson

.PARAMETER InputDir
    parser 输出的 JSON 数据目录，默认：./data

.PARAMETER OutputDir
    最终文件输出目录，默认：./output

.PARAMETER MaxMemoryMB
    Node.js 最大堆内存（MB），默认：12288（12GB）

.EXAMPLE
    # 只生成欧卡地图
    .\run-generate.ps1 -Maps europe -Commands map

.EXAMPLE
    # 同时生成欧卡��美卡的地图 + 城市数据
    .\run-generate.ps1 -Maps europe,usa -Commands map,cities

.EXAMPLE
    # 生成欧卡完整套件
    .\run-generate.ps1 -Maps europe -Commands map,spritesheet,cities,graph,contours,footprints,achievements
#>

param(
    [string[]]$Maps      = @("europe"),
    [string[]]$Commands  = @("map"),
    [string[]]$Type      = @("pmtiles"),
    [string]  $InputDir  = "./data",
    [string]  $OutputDir = "./output",
    [int]     $MaxMemoryMB = 12288
)

$env:NODE_OPTIONS = "--max-old-space-size=$MaxMemoryMB"

# 需要 -m 参数的命令
$CommandsWithMap = @("map", "cities", "graph", "contours", "footprints", "achievements")

# 需要 -t 参数的命令
$CommandsWithType = @("map", "contours", "footprints")

# spritesheet 不需要 -m，单独处理
$RunSpritesheet = $Commands -contains "spritesheet"
$MapCommands = $Commands | Where-Object { $_ -ne "spritesheet" }

function Run-Command {
    param([string]$Cmd)
    Write-Host ""
    Write-Host ">>> $Cmd" -ForegroundColor Cyan
    Invoke-Expression $Cmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "命令失败，退出码：$LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

# 执行 spritesheet（不需要 -m）
if ($RunSpritesheet) {
    $cmd = "npx tsx packages/clis/generator/index.ts spritesheet -i $InputDir -o $OutputDir"
    Run-Command $cmd
}

# 执行需要 -m 的命令（对每个 map × 每个 command 组合执行）
foreach ($map in $Maps) {
    foreach ($command in $MapCommands) {
        if ($CommandsWithMap -contains $command) {
            $cmd = "npx tsx packages/clis/generator/index.ts $command -m $map -i $InputDir -o $OutputDir"

            if ($CommandsWithType -contains $command) {
                $typeArgs = ($Type | ForEach-Object { "-t $_" }) -join " "
                $cmd += " $typeArgs"
            }

            Run-Command $cmd
        }
    }
}

Write-Host ""
Write-Host "全部完成。" -ForegroundColor Green
