#include "qvm_parser.h"
#include <fstream>
#include <cstring>
#include <algorithm>
#include <unordered_set>
#include <cmath>

// Operand sizes for each opcode (in bytes following the opcode byte).
// -1 means special handling (CALL).
static int QVM_OperandSize(QVMOpType op) {
    switch (op) {
    case QVMOpType::PUSH:    return 4;
    case QVMOpType::PUSHB:   return 1;
    case QVMOpType::PUSHW:   return 2;
    case QVMOpType::PUSHF:   return 4;
    case QVMOpType::PUSHA:   return 4;  // push address (4-byte code offset)
    case QVMOpType::PUSHS:   return 4;  // push string (4-byte string-pool index)
    case QVMOpType::PUSHSI:  return 4;
    case QVMOpType::PUSHSIB: return 1;
    case QVMOpType::PUSHSIW: return 2;
    case QVMOpType::PUSHI:   return 4;  // push integer immediate (4-byte value)
    case QVMOpType::PUSHII:  return 4;
    case QVMOpType::PUSHIIB: return 1;
    case QVMOpType::PUSHIIW: return 2;
    case QVMOpType::BRA:     return 4;
    case QVMOpType::BF:      return 4;
    case QVMOpType::BT:      return 4;
    case QVMOpType::JSR:     return 4;  // jump to subroutine (4-byte code offset)
    case QVMOpType::CALL:    return -1; // special: count + targets
    default:                 return 0;
    }
}

const char* QVM_OpName(QVMOpType op) {
    static const char* names[] = {
        "BRK", "NOP", "PUSH", "PUSHB", "PUSHW", "PUSHF", "PUSHA", "PUSHS",
        "PUSHSI", "PUSHSIB", "PUSHSIW", "PUSHI", "PUSHII", "PUSHIIB", "PUSHIIW",
        "PUSH0", "PUSH1", "PUSHM", "POP", "RET",
        "BRA", "BF", "BT", "JSR", "CALL",
        "ADD", "SUB", "MUL", "DIV", "SHL", "SHR", "AND", "OR", "XOR",
        "LAND", "LOR", "EQ", "NE", "LT", "LE", "GT", "GE",
        "ASSIGN", "PLUS", "MINUS", "INV", "NOT",
        "BLK", "ILLEGAL"
    };
    int idx = static_cast<int>(op);
    if (idx >= 0 && idx < static_cast<int>(QVMOpType::OP_COUNT))
        return names[idx];
    return "UNKNOWN";
}

// Both game formats share instructions and operands; only the ordering of the
// control-flow and PUSH opcode ranges differs in IGI 2.
uint8_t QVM_EncodeOpcode(QVMOpType op, uint32_t minor) {
    uint8_t value = static_cast<uint8_t>(op);
    if (minor == 7) {
        if (value >= 2 && value <= 18) return value + 6;
        if (value >= 19 && value <= 24) return value - 17;
    }
    return value;
}
QVMOpType QVM_DecodeOpcode(uint8_t byte, uint32_t minor) {
    if (minor == 7) {
        if (byte >= 2 && byte <= 7) byte += 17;
        else if (byte >= 8 && byte <= 24) byte -= 6;
    }
    return static_cast<QVMOpType>(byte);
}

// Helper: read a little-endian uint32 from a byte buffer
static uint32_t ReadU32(const uint8_t* p) {
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

// Helper: read a little-endian uint16 from a byte buffer
static uint16_t ReadU16(const uint8_t* p) {
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

// Helper: split a buffer of null-terminated strings into a vector.
// Preserves empty strings (adjacent null bytes) to keep index alignment with
// the QVM itable/stable which reference strings by position, matching Python's
// svalue.split(b'\x00')[:-1] behaviour.
static std::vector<std::string> SplitNullTerminated(const uint8_t* data, uint32_t size) {
    std::vector<std::string> result;
    if (!data || size == 0)
        return result;

    uint32_t start = 0;
    for (uint32_t i = 0; i < size; ++i) {
        if (data[i] == '\0') {
            result.emplace_back(reinterpret_cast<const char*>(data + start), i - start);
            start = i + 1;
        }
    }
    // Trailing content without null terminator (unusual but safe)
    if (start < size) {
        result.emplace_back(reinterpret_cast<const char*>(data + start), size - start);
    }
    return result;
}

QVMFile QVM_Parse(const std::string& filepath) {
    QVMFile qvm{};
    qvm.valid = false;

    // Read entire file into memory
    std::ifstream file(filepath, std::ios::binary | std::ios::ate);
    if (!file.is_open()) {
        qvm.error = "Failed to open file: " + filepath;
        return qvm;
    }

    auto file_size = file.tellg();
    if (file_size < 0 || file_size > static_cast<std::streamoff>(QVM_MAX_BYTES)) {
        qvm.error = "QVM file exceeds the 8 MiB limit or cannot be read";
        return qvm;
    }

    std::vector<uint8_t> data((size_t)file_size);
    file.seekg(0);
    file.read(reinterpret_cast<char*>(data.data()), file_size);
    if (!file) { qvm.error = "Failed to read QVM file"; return qvm; }
    file.close();
    return QVM_ParseMemory(data.data(), data.size());
}

QVMFile QVM_ParseMemory(const uint8_t* buf, size_t buf_size) {
    QVMFile qvm{};
    if (!buf || buf_size < 60) {
        qvm.error = "File too small to contain QVM header (need 60 bytes)";
        return qvm;
    }
    if (buf_size > QVM_MAX_BYTES) {
        qvm.error = "QVM file exceeds the 8 MiB limit";
        return qvm;
    }

    // Parse header
    std::memcpy(qvm.header.signature, buf, 4);
    qvm.header.ver_major  = ReadU32(buf + 0x04);
    qvm.header.ver_minor  = ReadU32(buf + 0x08);
    qvm.header.of_itable  = ReadU32(buf + 0x0C);
    qvm.header.of_ivalue  = ReadU32(buf + 0x10);
    qvm.header.sz_itable  = ReadU32(buf + 0x14);
    qvm.header.sz_ivalue  = ReadU32(buf + 0x18);
    qvm.header.of_stable  = ReadU32(buf + 0x1C);
    qvm.header.of_svalue  = ReadU32(buf + 0x20);
    qvm.header.sz_stable  = ReadU32(buf + 0x24);
    qvm.header.sz_svalue  = ReadU32(buf + 0x28);
    qvm.header.of_ctable  = ReadU32(buf + 0x2C);
    qvm.header.sz_ctable  = ReadU32(buf + 0x30);
    qvm.header.unknown_1  = ReadU32(buf + 0x34);
    qvm.header.unknown_2  = ReadU32(buf + 0x38);

    // Validate signature
    if (std::memcmp(qvm.header.signature, "LOOP", 4) != 0) {
        qvm.error = "Invalid QVM signature (expected 'LOOP')";
        return qvm;
    }

    // Validate version
    if (qvm.header.ver_major != 8 || (qvm.header.ver_minor != 5 && qvm.header.ver_minor != 7)) {
        qvm.error = "Unsupported QVM version (expected 8.5 or 8.7, got " +
                    std::to_string(qvm.header.ver_major) + "." +
                    std::to_string(qvm.header.ver_minor) + ")";
        return qvm;
    }
    const uint32_t headerSize = qvm.header.ver_minor == 7 ? 64 : 60;
    if (buf_size < headerSize) { qvm.error = "File too small for QVM 8.7 header"; return qvm; }
    if (qvm.header.ver_minor == 7) qvm.header.of_tvalue = ReadU32(buf + 60);

    // Subtraction-based bounds checks cannot wrap on attacker-controlled u32s.
    struct Section { uint32_t offset, size; };
    const Section sections[] = {
        {qvm.header.of_itable, qvm.header.sz_itable},
        {qvm.header.of_ivalue, qvm.header.sz_ivalue},
        {qvm.header.of_stable, qvm.header.sz_stable},
        {qvm.header.of_svalue, qvm.header.sz_svalue},
        {qvm.header.of_ctable, qvm.header.sz_ctable}
    };
    for (const auto& s : sections) {
        if (s.offset > buf_size || s.size > buf_size - s.offset || (s.size && s.offset < headerSize)) {
            qvm.error = "Invalid section offset or bounds"; return qvm;
        }
    }
    if (qvm.header.of_tvalue && (qvm.header.of_tvalue < uint64_t(qvm.header.of_ctable) + qvm.header.sz_ctable ||
        qvm.header.of_tvalue > buf_size)) {
        qvm.error = "Invalid trailing metadata offset"; return qvm;
    }
    for (size_t i = 0; i < 5; ++i) for (size_t j = i + 1; j < 5; ++j) {
        const auto& a = sections[i]; const auto& b = sections[j];
        if (a.size && b.size && a.offset < uint64_t(b.offset) + b.size &&
            b.offset < uint64_t(a.offset) + a.size) {
            qvm.error = "Overlapping QVM sections"; return qvm;
        }
    }
    auto validateTable = [&](uint32_t table, uint32_t tableSize, uint32_t pool, uint32_t poolSize) {
        if (tableSize % 4 || tableSize / 4 > 65536) return false;
        std::unordered_set<uint32_t> starts;
        for (uint32_t p = 0; p < poolSize; ++p) {
            if (p == 0 || buf[pool + p - 1] == 0) starts.insert(p);
            if (starts.size() > 65536) return false;
        }
        if (poolSize && buf[pool + poolSize - 1] != 0) return false;
        size_t expandedBytes = 0;
        for (uint32_t p = 0; p < tableSize; p += 4) {
            const auto offset = ReadU32(buf + table + p);
            if (!starts.count(offset)) return false;
            const auto length = std::strlen(reinterpret_cast<const char*>(buf + pool + offset)) + 1;
            if (length > QVM_MAX_BYTES - expandedBytes) return false;
            expandedBytes += length;
        }
        return true;
    };
    if (!validateTable(qvm.header.of_itable, qvm.header.sz_itable, qvm.header.of_ivalue, qvm.header.sz_ivalue) ||
        !validateTable(qvm.header.of_stable, qvm.header.sz_stable, qvm.header.of_svalue, qvm.header.sz_svalue)) {
        qvm.error = "Invalid identifier/string table bounds or unterminated pool"; return qvm;
    }

    // Table indices are authoritative; pool order need not equal table order.
    auto readTable = [&](uint32_t table, uint32_t tableSize, uint32_t pool) {
        std::vector<std::string> entries;
        entries.reserve(tableSize / 4);
        for (uint32_t p = 0; p < tableSize; p += 4)
            entries.emplace_back(reinterpret_cast<const char*>(buf + pool + ReadU32(buf + table + p)));
        return entries;
    };
    // Parse identifier values (ivalue)
    if (qvm.header.sz_ivalue > 0) {
        if (qvm.header.sz_ivalue > buf_size - qvm.header.of_ivalue) {
            qvm.error = "Identifier value section extends beyond file";
            return qvm;
        }
        qvm.identifiers = readTable(qvm.header.of_itable, qvm.header.sz_itable, qvm.header.of_ivalue);
    }

    // Parse string values (svalue)
    if (qvm.header.sz_svalue > 0) {
        if (qvm.header.sz_svalue > buf_size - qvm.header.of_svalue) {
            qvm.error = "String value section extends beyond file";
            return qvm;
        }
        qvm.strings = readTable(qvm.header.of_stable, qvm.header.sz_stable, qvm.header.of_svalue);
    }

    // Parse bytecode (code table)
    if (qvm.header.sz_ctable > 0) {
        if (qvm.header.sz_ctable > buf_size - qvm.header.of_ctable) {
            qvm.error = "Code section extends beyond file";
            return qvm;
        }

        const uint8_t* code = buf + qvm.header.of_ctable;
        uint32_t code_size = qvm.header.sz_ctable;
        uint32_t pos = 0;

        while (pos < code_size) {
            if (qvm.instructions.size() >= 500000) {
                qvm.error = "Instruction count exceeds safety limit (500000)"; return qvm;
            }
            QVMInstruction instr{};
            instr.address = pos;
            instr.operand = 0;
            instr.operand_float = 0.0f;

            uint8_t opbyte = code[pos];
            if (opbyte > static_cast<uint8_t>(QVMOpType::ILLEGAL)) {
                qvm.error = "Unknown opcode 0x" + std::to_string(opbyte) +
                            " at offset " + std::to_string(pos);
                return qvm;
            }

            instr.type = QVM_DecodeOpcode(opbyte, qvm.header.ver_minor);
            pos += 1; // consume opcode byte

            int op_size = QVM_OperandSize(instr.type);

            if (op_size == -1) {
                // CALL: read uint32 count, then count * int32 values
                if (code_size - pos < 4) {
                    qvm.error = "Unexpected end of code in CALL operand count";
                    return qvm;
                }
                uint32_t count = ReadU32(code + pos);
                instr.operand = count;
                pos += 4;

                if (count > (code_size - pos) / 4 || count > 65536) {
                    qvm.error = "Unexpected end of code in CALL arguments";
                    return qvm;
                }
                instr.call_targets.resize(count);
                for (uint32_t i = 0; i < count; ++i) {
                    uint32_t raw = ReadU32(code + pos);
                    instr.call_targets[i] = static_cast<int32_t>(raw);
                    pos += 4;
                }
                instr.size = 1 + 4 + count * 4;
            } else if (op_size > 0) {
                if ((uint32_t)op_size > code_size - pos) {
                    qvm.error = "Unexpected end of code reading operand at offset " +
                                std::to_string(instr.address);
                    return qvm;
                }

                if (op_size == 4) {
                    uint32_t val = ReadU32(code + pos);
                    instr.operand = val;
                    if (instr.type == QVMOpType::PUSHF) {
                        // Reinterpret the 4 bytes as float
                        std::memcpy(&instr.operand_float, &val, sizeof(float));
                    }
                } else if (op_size == 2) {
                    instr.operand = ReadU16(code + pos);
                } else if (op_size == 1) {
                    instr.operand = code[pos];
                }

                pos += (uint32_t)op_size;
                instr.size = 1 + (uint32_t)op_size;
            } else {
                instr.size = 1;
            }

            qvm.instructions.push_back(std::move(instr));
        }
    }

    std::unordered_set<uint32_t> addresses;
    for (const auto& op : qvm.instructions) addresses.insert(op.address);
    for (const auto& op : qvm.instructions) {
        bool bad = false;
        switch (op.type) {
        case QVMOpType::PUSHSI: case QVMOpType::PUSHSIB: case QVMOpType::PUSHSIW:
            bad = op.operand >= qvm.strings.size(); break;
        case QVMOpType::PUSHII: case QVMOpType::PUSHIIB: case QVMOpType::PUSHIIW:
            bad = op.operand >= qvm.identifiers.size(); break;
        case QVMOpType::PUSHF: bad = !std::isfinite(op.operand_float); break;
        case QVMOpType::BRA: case QVMOpType::BF: case QVMOpType::BT: {
            const int64_t target = int64_t(op.address) + op.size + int32_t(op.operand);
            bad = target < 0 || (target != qvm.header.sz_ctable && !addresses.count(uint32_t(target)));
            break;
        }
        case QVMOpType::CALL:
            for (int32_t target : op.call_targets)
                if (target < 0 || !addresses.count(uint32_t(target))) bad = true;
            break;
        case QVMOpType::ILLEGAL: bad = true; break;
        default: break;
        }
        if (bad) { qvm.error = "Invalid instruction operand at code offset " + std::to_string(op.address); return qvm; }
    }

    qvm.valid = true;
    return qvm;
}
