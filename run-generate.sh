#!/usr/bin/env bash
# ETS2/ATS 地图生成脚本（Linux/WSL）
#
# 用法：
#   ./run-generate.sh [选项]
#
# 选项：
#   -m <maps>       游戏地图，逗号分隔。可用值：europe、usa。默认：europe
#   -c <commands>   导出子命令，逗号分隔。
#                   可用值：map、spritesheet、cities、graph、contours、footprints、achievements
#                   默认：map
#   -t <types>      输出格式，逗号分隔（仅 map/contours/footprints 支持）。
#                   可用值：pmtiles、geojson、mbtiles。默认：pmtiles
#   -i <dir>        输入目录（parser 输出的 JSON），默认：./data
#   -o <dir>        输出目录，默认：./output
#   -M <mb>         Node.js 最大堆内存（MB），默认：12288
#   -h              显示帮助
#
# 示例：
#   ./run-generate.sh
#   ./run-generate.sh -m usa
#   ./run-generate.sh -m europe,usa
#   ./run-generate.sh -m europe -c map,cities,spritesheet
#   ./run-generate.sh -m europe -c map,contours -t pmtiles,geojson
#   ./run-generate.sh -m europe -c map,spritesheet,cities,graph,contours,footprints,achievements

set -euo pipefail

# 默认参数
MAPS="europe"
COMMANDS="map"
TYPES="pmtiles"
INPUT_DIR="./data"
OUTPUT_DIR="./output"
MAX_MEMORY_MB=12288

usage() {
    sed -n '3,25p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
}

while getopts "m:c:t:i:o:M:h" opt; do
    case $opt in
        m) MAPS="$OPTARG" ;;
        c) COMMANDS="$OPTARG" ;;
        t) TYPES="$OPTARG" ;;
        i) INPUT_DIR="$OPTARG" ;;
        o) OUTPUT_DIR="$OPTARG" ;;
        M) MAX_MEMORY_MB="$OPTARG" ;;
        h) usage ;;
        *) echo "未知参数，使用 -h 查看帮助" >&2; exit 1 ;;
    esac
done

export NODE_OPTIONS="--max-old-space-size=${MAX_MEMORY_MB}"

# 需要 -m 参数的命令
COMMANDS_WITH_MAP="map cities graph contours footprints achievements"
# 需要 -t 参数的命令
COMMANDS_WITH_TYPE="map contours footprints"

# 将逗号分隔转为数组
IFS=',' read -ra MAP_LIST     <<< "$MAPS"
IFS=',' read -ra COMMAND_LIST <<< "$COMMANDS"
IFS=',' read -ra TYPE_LIST    <<< "$TYPES"

# 构建 -t 参数字符串
type_args() {
    local args=""
    for t in "${TYPE_LIST[@]}"; do
        args="$args -t $t"
    done
    echo "$args"
}

contains() {
    local needle="$1"; local haystack="$2"
    [[ " $haystack " == *" $needle "* ]]
}

run_cmd() {
    echo ""
    echo -e "\033[36m>>> $*\033[0m"
    "$@"
}

# 执行 spritesheet（不需要 -m）
if contains "spritesheet" "${COMMAND_LIST[*]}"; then
    run_cmd npx tsx packages/clis/generator/index.ts spritesheet \
        -i "$INPUT_DIR" \
        -o "$OUTPUT_DIR"
fi

# 执行需要 -m 的命令
for map in "${MAP_LIST[@]}"; do
    for command in "${COMMAND_LIST[@]}"; do
        [[ "$command" == "spritesheet" ]] && continue

        if contains "$command" "$COMMANDS_WITH_MAP"; then
            if contains "$command" "$COMMANDS_WITH_TYPE"; then
                run_cmd npx tsx packages/clis/generator/index.ts "$command" \
                    -m "$map" \
                    -i "$INPUT_DIR" \
                    -o "$OUTPUT_DIR" \
                    $(type_args)
            else
                run_cmd npx tsx packages/clis/generator/index.ts "$command" \
                    -m "$map" \
                    -i "$INPUT_DIR" \
                    -o "$OUTPUT_DIR"
            fi
        fi
    done
done

echo ""
echo -e "\033[32m全部完成。\033[0m"
