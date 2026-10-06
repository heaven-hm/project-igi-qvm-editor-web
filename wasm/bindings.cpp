#include "api.h"
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <stdexcept>
using emscripten::val;

static val result(const igi::Result& r, size_t bytes = 0) {
    val out = val::object();
    out.set("ok", r.ok);
    out.set("error", r.error);
    out.set("source", r.source);
    val metadata = val::object();
    metadata.set("version", std::to_string(r.metadata.header.ver_major) + "." + std::to_string(r.metadata.header.ver_minor));
    metadata.set("game", r.metadata.header.ver_minor == 7 ? "IGI 2" : "IGI 1");
    metadata.set("instructions", r.metadata.totalInstructions());
    metadata.set("identifiers", r.metadata.identifierCount());
    metadata.set("strings", r.metadata.stringCount());
    metadata.set("size", r.binary.empty() ? bytes : r.binary.size());
    out.set("metadata", metadata);
    // Copy before r is destroyed: never return a dangling view into the WASM heap.
    if (!r.binary.empty()) out.set("binary", val::global("Uint8Array").new_(
        val(emscripten::typed_memory_view(r.binary.size(), r.binary.data()))));
    return out;
}
static val compile(const std::string& source, uint32_t minor) { return result(igi::CompileQSC(source, minor)); }
static val validate(const std::string& source) { return result(igi::ValidateQSC(source)); }
static val binaryOperation(const val& input, bool decompile) {
    const size_t size = input["byteLength"].as<size_t>();
    if (size > QVM_MAX_BYTES) {
        igi::Result r; r.error = "QVM file exceeds the 8 MiB limit"; return result(r);
    }
    std::vector<uint8_t> bytes(size);
    if (size) val(emscripten::typed_memory_view(size, bytes.data())).call<void>("set", input);
    return result(decompile ? igi::DecompileQVM(bytes.data(), size) : igi::InspectQVM(bytes.data(), size), size);
}
static val inspect(const val& input) { return binaryOperation(input, false); }
static val decompile(const val& input) { return binaryOperation(input, true); }
EMSCRIPTEN_BINDINGS(igi_qvm) {
    emscripten::function("compile", &compile);
    emscripten::function("validate", &validate);
    emscripten::function("inspect", &inspect);
    emscripten::function("decompile", &decompile);
}
