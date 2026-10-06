#pragma once
#include "qvm_parser.h"
#include <string>
#include <vector>

namespace igi {
struct Result {
    bool ok = false;
    std::string error;
    std::string source;
    std::vector<uint8_t> binary;
    QVMFile metadata;
};
Result CompileQSC(const std::string& source, uint32_t minor = 5);
Result ValidateQSC(const std::string& source);
Result InspectQVM(const uint8_t* data, size_t size);
Result DecompileQVM(const uint8_t* data, size_t size);
}
