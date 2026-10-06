#include "semantics.h"
#include <map>
#include <tuple>
#include <stdexcept>
namespace {
using Entry = std::tuple<QVMOpType, uint32_t, std::string, std::vector<size_t>>;
bool noop(const QVMInstruction& op) {
    return op.type == QVMOpType::NOP || (op.type == QVMOpType::BRA && op.operand == 0);
}
std::vector<Entry> normalize(const QVMFile& file) {
    std::map<uint32_t, size_t> indices;
    size_t ordinal = 0;
    for (const auto& op : file.instructions) {
        indices[op.address] = ordinal;
        if (!noop(op)) ++ordinal;
    }
    indices[file.header.sz_ctable] = ordinal;
    auto edge = [&](uint32_t address) {
        auto found = indices.find(address);
        if (found == indices.end()) throw std::runtime_error("Invalid semantic control-flow edge");
        return found->second;
    };
    std::vector<Entry> out;
    for (const auto& instruction : file.instructions) {
        if (noop(instruction)) continue;
        auto op = instruction.type;
        auto value = instruction.operand;
        std::string symbol;
        std::vector<size_t> edges;
        switch (op) {
        case QVMOpType::PUSHB: value = uint32_t(int32_t(int8_t(value))); op = QVMOpType::PUSH; break;
        case QVMOpType::PUSHW: value = uint32_t(int32_t(int16_t(value))); op = QVMOpType::PUSH; break;
        case QVMOpType::PUSH0: value = 0; op = QVMOpType::PUSH; break;
        case QVMOpType::PUSH1: value = 1; op = QVMOpType::PUSH; break;
        case QVMOpType::PUSHM: value = UINT32_MAX; op = QVMOpType::PUSH; break;
        case QVMOpType::PUSHII: case QVMOpType::PUSHIIB: case QVMOpType::PUSHIIW:
            symbol = file.identifiers.at(value); value = 0; op = QVMOpType::PUSHII; break;
        case QVMOpType::PUSHSI: case QVMOpType::PUSHSIB: case QVMOpType::PUSHSIW:
            symbol = file.strings.at(value); value = 0; op = QVMOpType::PUSHSI; break;
        case QVMOpType::BRA: case QVMOpType::BF: case QVMOpType::BT:
            edges.push_back(edge(uint32_t(int64_t(instruction.address) + instruction.size + int32_t(value)))); value = 0; break;
        case QVMOpType::CALL:
            for (auto address : instruction.call_targets) edges.push_back(edge(uint32_t(address)));
            break;
        default: break;
        }
        out.emplace_back(op, value, std::move(symbol), std::move(edges));
    }
    return out;
}
}
bool QVM_Equivalent(const QVMFile& original, const QVMFile& rebuilt) {
    return original.valid && rebuilt.valid && normalize(original) == normalize(rebuilt);
}
