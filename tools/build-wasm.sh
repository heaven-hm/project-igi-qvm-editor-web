#!/usr/bin/env bash
set -euo pipefail
QVM_PROJECT_ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
QVM_EMSDK_PATH=${EMSDK:-"$QVM_PROJECT_ROOT/.tools/emsdk"}
if [[ -f "$QVM_EMSDK_PATH/.emscripten" ]]; then
    export EMSDK="$QVM_EMSDK_PATH"
    export EM_CONFIG="$QVM_EMSDK_PATH/.emscripten"
    export PATH="$QVM_EMSDK_PATH/upstream/emscripten:$PATH"
elif [[ -f "$QVM_EMSDK_PATH/emsdk_env.sh" ]]; then
    source "$QVM_EMSDK_PATH/emsdk_env.sh" >/dev/null 2>&1
fi
if ! command -v emcmake >/dev/null 2>&1; then
    echo 'Emscripten is required. Run bash tools/setup-emsdk.sh or set EMSDK.' >&2
    exit 1
fi
emcmake cmake -S "$QVM_PROJECT_ROOT" -B "$QVM_PROJECT_ROOT/build-wasm" -DCMAKE_BUILD_TYPE=Release
cmake --build "$QVM_PROJECT_ROOT/build-wasm" --parallel
