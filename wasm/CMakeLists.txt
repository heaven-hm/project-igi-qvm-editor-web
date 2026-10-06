add_executable(igi_qvm_wasm bindings.cpp)
target_link_libraries(igi_qvm_wasm PRIVATE igi_qvm_core)
target_compile_options(igi_qvm_wasm PRIVATE -fexceptions)
target_link_options(igi_qvm_wasm PRIVATE
    --bind -fexceptions
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createQVM
    -sENVIRONMENT=web,worker,node -sDISABLE_EXCEPTION_CATCHING=0
    -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=268435456
    -sSTACK_SIZE=5242880 -sFILESYSTEM=0 -sDYNAMIC_EXECUTION=0
    -sMALLOC=emmalloc -sABORTING_MALLOC=0)
set_target_properties(igi_qvm_wasm PROPERTIES
    OUTPUT_NAME qvm SUFFIX .mjs
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/web/public/wasm")
