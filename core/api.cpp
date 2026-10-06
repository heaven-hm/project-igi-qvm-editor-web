#include "api.h"
#include "qsc_lexer.h"
#include "qsc_parser.h"
#include "qvm_compiler.h"
#include "qvm_decompiler.h"
#include "semantics.h"
#include <exception>

namespace igi {
static Result sourceResult(const std::string& source, bool compile, uint32_t minor = 5) {
    Result result;
    try {
        auto lex = qsc::Lex(source);
        if (!lex.ok) { result.error = lex.error; return result; }
        auto parsed = qsc::Parse(lex.tokens);
        if (!parsed.ok) { result.error = parsed.error; return result; }
        if (compile) {
            auto compiled = qvm::Compile(*parsed.program, minor);
            if (!compiled.ok) { result.error = compiled.error; return result; }
            result.binary = std::move(compiled.binary);
            result.metadata = QVM_ParseMemory(result.binary.data(), result.binary.size());
            if (!result.metadata.valid) { result.error = result.metadata.error; result.binary.clear(); return result; }
        }
        result.ok = true;
    } catch (const std::exception& e) { result.error = e.what(); }
    return result;
}
Result CompileQSC(const std::string& source, uint32_t minor) { return sourceResult(source, true, minor); }
Result ValidateQSC(const std::string& source) { return sourceResult(source, false); }
Result InspectQVM(const uint8_t* data, size_t size) {
    Result r;
    try {
        r.metadata = QVM_ParseMemory(data, size);
        r.ok = r.metadata.valid;
        r.error = r.metadata.error;
    } catch (const std::exception& e) { r.error = e.what(); }
    return r;
}
Result DecompileQVM(const uint8_t* data, size_t size) {
    Result r = InspectQVM(data, size);
    if (!r.ok) return r;
    try {
        r.source = QVM_DecompileToString(r.metadata);
        auto rebuilt = CompileQSC(r.source, r.metadata.header.ver_minor);
        if (!rebuilt.ok) {
            r.ok = false;
            r.error = "Decompiled source is outside supported QSC syntax: " + rebuilt.error;
        } else if (!QVM_Equivalent(r.metadata, rebuilt.metadata)) {
            r.ok = false;
            r.error = "This QVM contains control flow or operations that cannot be preserved in QSC. Conversion stopped to prevent script corruption.";
        }
    } catch (const std::exception& e) { r.ok = false; r.error = e.what(); }
    return r;
}
}
