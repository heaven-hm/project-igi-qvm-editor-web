#pragma once
#include "qvm_parser.h"
// Compare script semantics while allowing compact immediate encodings, relocation,
// no-op guards and different intern-pool order. Never ignores control-flow edges.
bool QVM_Equivalent(const QVMFile& original, const QVMFile& rebuilt);
