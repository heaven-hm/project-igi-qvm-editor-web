#pragma once
#include <string>
#include <vector>
#include <cstdint>
#include <cstddef>

struct QVMHeader {
    char signature[4];
    uint32_t ver_major;
    uint32_t ver_minor;
    uint32_t of_itable, of_ivalue, sz_itable, sz_ivalue;
    uint32_t of_stable, of_svalue, sz_stable, sz_svalue;
    uint32_t of_ctable, sz_ctable;
    uint32_t unknown_1, unknown_2;
    uint32_t of_tvalue = 0; // IGI 2 (8.7) optional trailing metadata
};

enum class QVMOpType : uint8_t {
    BRK = 0, NOP, PUSH, PUSHB, PUSHW, PUSHF, PUSHA, PUSHS,
    PUSHSI, PUSHSIB, PUSHSIW, PUSHI, PUSHII, PUSHIIB, PUSHIIW,
    PUSH0, PUSH1, PUSHM, POP, RET,
    BRA, BF, BT, JSR, CALL,
    ADD, SUB, MUL, DIV, SHL, SHR, AND, OR, XOR,
    LAND, LOR, EQ, NE, LT, LE, GT, GE,
    ASSIGN, PLUS, MINUS, INV, NOT,
    BLK, ILLEGAL,
    OP_COUNT
};

struct QVMInstruction {
    QVMOpType type;
    uint32_t operand;                  // For simple operands
    float operand_float;               // For PUSHF
    std::vector<int32_t> call_targets; // For CALL
    uint32_t address;                  // Offset in code section
    uint32_t size;                     // Total instruction size
};

struct QVMFile {
    QVMHeader header;
    std::vector<std::string> identifiers;  // ivalue parsed
    std::vector<std::string> strings;      // svalue parsed
    std::vector<QVMInstruction> instructions;
    bool valid = false;
    std::string error;

    uint32_t totalInstructions() const { return (uint32_t)instructions.size(); }
    uint32_t identifierCount() const { return (uint32_t)identifiers.size(); }
    uint32_t stringCount() const { return (uint32_t)strings.size(); }
};

// Parse a QVM file from disk
QVMFile QVM_Parse(const std::string& filepath);
QVMFile QVM_ParseMemory(const uint8_t* bytes, size_t size);
constexpr size_t QVM_MAX_BYTES = 8 * 1024 * 1024;

// Get opcode name string
const char* QVM_OpName(QVMOpType op);
uint8_t QVM_EncodeOpcode(QVMOpType op, uint32_t minor);
QVMOpType QVM_DecodeOpcode(uint8_t byte, uint32_t minor);
