#!/usr/bin/env bash
set -euo pipefail
QVM_PROJECT_ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
QVM_EMSDK_PATH=${EMSDK:-"$QVM_PROJECT_ROOT/.tools/emsdk"}
if [[ ! -f "$QVM_EMSDK_PATH/emsdk" ]]; then
    git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$QVM_EMSDK_PATH"
fi
"$QVM_EMSDK_PATH/emsdk" install 4.0.23
"$QVM_EMSDK_PATH/emsdk" activate 4.0.23
echo 'Emscripten 4.0.23 ready. Run bash tools/build-wasm.sh.'
