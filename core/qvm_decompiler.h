#pragma once
#include "qvm_parser.h"
#include <string>

// Decompile a parsed IGI 1/IGI 2 QVM file to QSC source text.
// Returns false if outpath cannot be opened or qvm is invalid.
bool QVM_Decompile(const QVMFile& qvm, const std::string& outpath);

// Decompile a parsed IGI 1/IGI 2 QVM file to QSC source text in memory.
std::string QVM_DecompileToString(const QVMFile& qvm);
