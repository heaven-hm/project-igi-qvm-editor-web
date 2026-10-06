#pragma once
#include "qsc_parser.h"
#include <string>
#include <vector>
#include <cstdint>

namespace qvm {

struct CompileResult {
    std::vector<uint8_t> binary;
    bool ok = true;
    std::string error;
};

// Compile a parsed QSC AST into LOOP 8.5 (IGI 1) or LOOP 8.7 (IGI 2).
// Returns the bytes in `binary` on success.
CompileResult Compile(const qsc::Node& program, uint32_t minor = 5);

// Convenience: compile and write to disk.
bool CompileToFile(const qsc::Node& program, const std::string& outPath, std::string* error = nullptr, uint32_t minor = 5);

} // namespace qvm
