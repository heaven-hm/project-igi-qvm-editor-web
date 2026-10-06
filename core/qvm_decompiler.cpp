#include "qvm_decompiler.h"
#include <stdexcept>

#include <fstream>
#include <charconv>
#include <map>
#include <vector>
#include <string>
#include <algorithm>
#include <cstdint>
#include <memory>

// Float formatting helper — reproduces the full-precision decimal output of the
// original IGI1Conv tool (e.g. 0.30000001192092896, not truncated 0.3000000119).
// %.17g gives the shortest 17-significant-digit representation, which is the
// exact double value of the 32-bit float and round-trips through strtof/strtod.
static std::string FloatStr(float v) {
    char buf[64];
    snprintf(buf, sizeof(buf), "%.17g", (double)v);
    std::string s(buf);

    // For fixed notation (no exponent), trim trailing zeros but keep at least one
    // decimal digit so the token is always recognizable as a float.
    if (s.find('e') == std::string::npos && s.find('E') == std::string::npos) {
        if (s.find('.') != std::string::npos) {
            while (!s.empty() && s.back() == '0') s.pop_back();
            if (!s.empty() && s.back() == '.') s.pop_back();
        }
        // Ensure the value has a '.' so the QSC parser treats it as a float token.
        if (s.find('.') == std::string::npos) s += ".0";
    }
    return s;
}

// String escaping helper matching Python string replacement exactly
static std::string EscapeQSCString(const std::string& s) {
    std::string result;
    for (char c : s) {
        if (c == '\\') result += "\\\\";
        else if (c == '\t') result += "\\t";
        else if (c == '\r') result += "\\r";
        else if (c == '\n') result += "\\n";
        else if (c == '"') result += "\\\"";
        else result += c;
    }
    return result;
}

// Priority mapping matching Python dict priority exactly
static int GetPriority(const std::string& op) {
    if (op == "+") return 2;
    if (op == "-") return 2;
    if (op == "*") return 3;
    if (op == "/") return 3;
    if (op == "<<") return 5;
    if (op == ">>") return 5;
    if (op == "&") return 8;
    if (op == "|") return 10;
    if (op == "^") return 9;
    if (op == "&&") return 11;
    if (op == "||") return 12;
    if (op == "==") return 7;
    if (op == "!=") return 7;
    if (op == "<") return 6;
    if (op == "<=") return 6;
    if (op == ">") return 6;
    if (op == ">=") return 6;
    if (op == "=") return 14;
    if (op == "~") return 2;
    if (op == "!") return 2;
    return 0;
}

enum class ASTNodeType {
    LiteralNumber,
    LiteralConst,
    LiteralString,
    LiteralIdentifier,
    ExpressionUnary,
    ExpressionBinary,
    ExpressionCall,
    StatementParenthese,
    StatementWhile,
    StatementIf
};

struct ASTNode {
    ASTNodeType type;
    size_t depth = 1;
    void checkDepth() const { if (depth > 128) throw std::runtime_error("QVM expression nesting exceeds 128"); }
    explicit ASTNode(ASTNodeType t) : type(t) {}
    virtual ~ASTNode() = default;
    virtual std::string strepr(int tabs) const = 0;
};

struct LiteralNumberNode : public ASTNode {
    std::string value;
    explicit LiteralNumberNode(std::string val) : ASTNode(ASTNodeType::LiteralNumber), value(std::move(val)) {}
    std::string strepr(int tabs) const override {
        return value;
    }
};

struct LiteralConstNode : public ASTNode {
    std::string value;
    explicit LiteralConstNode(std::string val) : ASTNode(ASTNodeType::LiteralConst), value(std::move(val)) {}
    std::string strepr(int tabs) const override {
        return value;
    }
};

struct LiteralStringNode : public ASTNode {
    std::string value;
    explicit LiteralStringNode(std::string val) : ASTNode(ASTNodeType::LiteralString), value(std::move(val)) {}
    std::string strepr(int tabs) const override {
        return value;
    }
};

struct LiteralIdentifierNode : public ASTNode {
    std::string value;
    explicit LiteralIdentifierNode(std::string val) : ASTNode(ASTNodeType::LiteralIdentifier), value(std::move(val)) {}
    std::string strepr(int tabs) const override {
        return value;
    }
};

struct ExpressionUnaryNode : public ASTNode {
    std::string op;
    std::shared_ptr<ASTNode> argument;
    ExpressionUnaryNode(std::string o, std::shared_ptr<ASTNode> arg)
        : ASTNode(ASTNodeType::ExpressionUnary), op(std::move(o)), argument(std::move(arg)) { depth = argument->depth + 1; checkDepth(); }
    std::string strepr(int tabs) const override {
        return op + argument->strepr(tabs);
    }
};

struct ExpressionBinaryNode : public ASTNode {
    std::string op;
    std::shared_ptr<ASTNode> left;
    std::shared_ptr<ASTNode> right;
    ExpressionBinaryNode(std::string o, std::shared_ptr<ASTNode> l, std::shared_ptr<ASTNode> r)
        : ASTNode(ASTNodeType::ExpressionBinary), op(std::move(o)), left(std::move(l)), right(std::move(r)) { depth = std::max(left->depth, right->depth) + 1; checkDepth(); }
    std::string strepr(int tabs) const override {
        return left->strepr(tabs) + " " + op + " " + right->strepr(tabs);
    }
};

struct StatementParentheseNode : public ASTNode {
    std::shared_ptr<ASTNode> body;
    explicit StatementParentheseNode(std::shared_ptr<ASTNode> b)
        : ASTNode(ASTNodeType::StatementParenthese), body(std::move(b)) { depth = body->depth + 1; checkDepth(); }
    std::string strepr(int tabs) const override {
        return "(" + body->strepr(tabs) + ")";
    }
};

struct ExpressionCallNode : public ASTNode {
    std::shared_ptr<ASTNode> callee;
    std::vector<std::vector<std::shared_ptr<ASTNode>>> arguments;
    ExpressionCallNode(std::shared_ptr<ASTNode> c, std::vector<std::vector<std::shared_ptr<ASTNode>>> args)
        : ASTNode(ASTNodeType::ExpressionCall), callee(std::move(c)), arguments(std::move(args)) {
        for (const auto& arg : arguments) for (const auto& node : arg) depth = std::max(depth, node->depth + 1);
        checkDepth();
    }
    std::string strepr(int tabs) const override {
        std::string c = callee->strepr(tabs);
        size_t l = c.length();
        std::vector<std::string> a;
        for (const auto& arg : arguments) {
            if (arg.empty()) continue;
            std::string s = arg[0]->strepr(tabs + 1);
            if (arg[0]->type == ASTNodeType::ExpressionCall) {
                std::string tabsStr(tabs + 1, '\t');
                s = "\n" + tabsStr + s;
                l = s.length() + 2;
            } else {
                if (l + s.length() > 300) {
                    s = "\n" + s;
                    l = s.length() + 2;
                } else {
                    l += s.length() + 2;
                }
            }
            a.push_back(s);
        }
        
        std::string argsJoined;
        for (size_t i = 0; i < a.size(); ++i) {
            if (i > 0) argsJoined += ", ";
            argsJoined += a[i];
        }
        return c + "(" + argsJoined + ")";
    }
};

struct StatementWhileNode : public ASTNode {
    std::shared_ptr<ASTNode> test;
    std::vector<std::shared_ptr<ASTNode>> body;
    StatementWhileNode(std::shared_ptr<ASTNode> t, std::vector<std::shared_ptr<ASTNode>> b)
        : ASTNode(ASTNodeType::StatementWhile), test(std::move(t)), body(std::move(b)) {}
    std::string strepr(int tabs) const override {
        std::string tabsStr(tabs, '\t');
        std::string text;
        text += tabsStr + "while(" + test->strepr(tabs + 1) + ")\n";
        text += tabsStr + "{\n";
        
        for (const auto& sst : body) {
            if (sst->type == ASTNodeType::StatementIf || sst->type == ASTNodeType::StatementWhile) {
                text += sst->strepr(tabs + 1) + "\n";
            } else {
                std::string tabsPlus(tabs + 1, '\t');
                text += tabsPlus + sst->strepr(tabs + 1) + ";\n";
            }
        }
        text += tabsStr + "}\n";
        return text;
    }
};

struct StatementIfNode : public ASTNode {
    std::shared_ptr<ASTNode> test;
    std::vector<std::shared_ptr<ASTNode>> trueBranch;
    std::vector<std::shared_ptr<ASTNode>> falseBranch;
    bool hasFalse;
    
    StatementIfNode(std::shared_ptr<ASTNode> t, std::vector<std::shared_ptr<ASTNode>> tr)
        : ASTNode(ASTNodeType::StatementIf), test(std::move(t)), trueBranch(std::move(tr)), hasFalse(false) {}
    
    StatementIfNode(std::shared_ptr<ASTNode> t, std::vector<std::shared_ptr<ASTNode>> tr, std::vector<std::shared_ptr<ASTNode>> fa)
        : ASTNode(ASTNodeType::StatementIf), test(std::move(t)), trueBranch(std::move(tr)), falseBranch(std::move(fa)), hasFalse(true) {}
        
    std::string strepr(int tabs) const override {
        std::string tabsStr(tabs, '\t');
        std::string text;
        text += tabsStr + "if(" + test->strepr(tabs + 1) + ")\n";
        text += tabsStr + "{\n";
        
        for (const auto& sst : trueBranch) {
            if (sst->type == ASTNodeType::StatementIf || sst->type == ASTNodeType::StatementWhile) {
                text += sst->strepr(tabs + 1);
            } else {
                std::string tabsPlus(tabs + 1, '\t');
                text += tabsPlus + sst->strepr(tabs + 1) + ";\n";
            }
        }
        text += tabsStr + "}\n";
        
        if (hasFalse) {
            text += tabsStr + "else\n";
            text += tabsStr + "{\n";
            for (const auto& sst : falseBranch) {
                if (sst->type == ASTNodeType::StatementIf || sst->type == ASTNodeType::StatementWhile) {
                    text += sst->strepr(tabs + 1) + "\n";
                } else {
                    std::string tabsPlus(tabs + 1, '\t');
                    text += tabsPlus + sst->strepr(tabs + 1) + ";\n";
                }
            }
            text += tabsStr + "}\n";
        }
        return text;
    }
};

struct WalkContext { size_t depth = 0; size_t remaining = 2000000; };
struct WalkGuard {
    WalkContext& context;
    explicit WalkGuard(WalkContext& c) : context(c) {
        if (++context.depth > 128) throw std::runtime_error("QVM control-flow nesting exceeds 128");
    }
    ~WalkGuard() { --context.depth; }
};
static std::vector<std::shared_ptr<ASTNode>> walk(
    const QVMFile& qvm,
    const std::map<uint32_t, size_t>& addrToInstrIndex,
    uint32_t& address,
    bool& success,
    WalkContext& context,
    uint32_t until = 0xFFFFFFFF
) {
    WalkGuard guard(context);
    std::vector<std::shared_ptr<ASTNode>> statements;

    while (true) {
        if (!context.remaining--) throw std::runtime_error("Cyclic or excessive QVM control flow");
        auto it = addrToInstrIndex.find(address);
        if (it == addrToInstrIndex.end()) {
            break;
        }

        const QVMInstruction& op = qvm.instructions[it->second];

        if (until != 0xFFFFFFFF && op.address == until) {
            break;
        }

        if (op.type == QVMOpType::BRK || op.type == QVMOpType::BRA || op.type == QVMOpType::RET) {
            break;
        }

        else if (op.type == QVMOpType::NOP) {
            address = op.address + op.size;
        }

        else if (op.type == QVMOpType::POP) {
            address = op.address + op.size;
        }

        else if (op.type == QVMOpType::PUSH || op.type == QVMOpType::PUSHB ||
                 op.type == QVMOpType::PUSHW || op.type == QVMOpType::PUSHF) {
            std::string val;
            if (op.type == QVMOpType::PUSHF) {
                val = FloatStr(op.operand_float);
            } else {
                uint32_t value = op.operand;
                if (op.type == QVMOpType::PUSHB) value = uint32_t(int32_t(int8_t(value)));
                if (op.type == QVMOpType::PUSHW) value = uint32_t(int32_t(int16_t(value)));
                val = std::to_string(value);
            }
            statements.push_back(std::make_shared<LiteralNumberNode>(val));
            address = op.address + op.size;
        }

        else if (op.type == QVMOpType::PUSH0) {
            statements.push_back(std::make_shared<LiteralConstNode>("0"));
            address = op.address + op.size;
        }
        else if (op.type == QVMOpType::PUSH1) {
            statements.push_back(std::make_shared<LiteralConstNode>("1"));
            address = op.address + op.size;
        }
        else if (op.type == QVMOpType::PUSHM) {
            statements.push_back(std::make_shared<LiteralConstNode>("4294967295"));
            address = op.address + op.size;
        }

        else if (op.type == QVMOpType::PUSHSI || op.type == QVMOpType::PUSHSIB || op.type == QVMOpType::PUSHSIW) {
            std::string val = "\"\"";
            if (op.operand < qvm.strings.size()) {
                val = "\"" + EscapeQSCString(qvm.strings[op.operand]) + "\"";
            }
            statements.push_back(std::make_shared<LiteralStringNode>(val));
            address = op.address + op.size;
        }

        else if (op.type == QVMOpType::PUSHII || op.type == QVMOpType::PUSHIIB || op.type == QVMOpType::PUSHIIW) {
            std::string val = "id_unknown";
            if (op.operand < qvm.identifiers.size()) {
                val = EscapeQSCString(qvm.identifiers[op.operand]);
            }
            statements.push_back(std::make_shared<LiteralIdentifierNode>(val));
            address = op.address + op.size;
        }

        else if (op.type == QVMOpType::PLUS || op.type == QVMOpType::MINUS ||
                 op.type == QVMOpType::INV || op.type == QVMOpType::NOT) {
            std::string opStr;
            if (op.type == QVMOpType::PLUS) opStr = "+";
            else if (op.type == QVMOpType::MINUS) opStr = "-";
            else if (op.type == QVMOpType::INV) opStr = "~";
            else if (op.type == QVMOpType::NOT) opStr = "!";

            if (statements.empty()) {
                throw std::runtime_error("unary expression lacks argument");
                success = false;
                return {};
            }
            std::shared_ptr<ASTNode> argument = statements.back();
            statements.pop_back();

            if (argument->type == ASTNodeType::ExpressionUnary || argument->type == ASTNodeType::ExpressionBinary) {
                argument = std::make_shared<StatementParentheseNode>(argument);
            }

            statements.push_back(std::make_shared<ExpressionUnaryNode>(opStr, argument));
            address = op.address + op.size;
        }

        else if (op.type == QVMOpType::ADD || op.type == QVMOpType::SUB || op.type == QVMOpType::MUL ||
                 op.type == QVMOpType::DIV || op.type == QVMOpType::SHL || op.type == QVMOpType::SHR ||
                 op.type == QVMOpType::AND || op.type == QVMOpType::OR || op.type == QVMOpType::XOR ||
                 op.type == QVMOpType::LAND || op.type == QVMOpType::LOR || op.type == QVMOpType::EQ ||
                 op.type == QVMOpType::NE || op.type == QVMOpType::LT || op.type == QVMOpType::LE ||
                 op.type == QVMOpType::GT || op.type == QVMOpType::GE || op.type == QVMOpType::ASSIGN) {
            
            std::string opStr;
            if (op.type == QVMOpType::ADD) opStr = "+";
            else if (op.type == QVMOpType::SUB) opStr = "-";
            else if (op.type == QVMOpType::MUL) opStr = "*";
            else if (op.type == QVMOpType::DIV) opStr = "/";
            else if (op.type == QVMOpType::SHL) opStr = "<<";
            else if (op.type == QVMOpType::SHR) opStr = ">>";
            else if (op.type == QVMOpType::AND) opStr = "&";
            else if (op.type == QVMOpType::OR) opStr = "|";
            else if (op.type == QVMOpType::XOR) opStr = "^";
            else if (op.type == QVMOpType::LAND) opStr = "&&";
            else if (op.type == QVMOpType::LOR) opStr = "||";
            else if (op.type == QVMOpType::EQ) opStr = "==";
            else if (op.type == QVMOpType::NE) opStr = "!=";
            else if (op.type == QVMOpType::LT) opStr = "<";
            else if (op.type == QVMOpType::LE) opStr = "<=";
            else if (op.type == QVMOpType::GT) opStr = ">";
            else if (op.type == QVMOpType::GE) opStr = ">=";
            else if (op.type == QVMOpType::ASSIGN) opStr = "=";

            if (statements.size() < 2) {
                throw std::runtime_error("binary expression lacks arguments");
                success = false;
                return {};
            }

            std::shared_ptr<ASTNode> right = statements.back();
            statements.pop_back();
            std::shared_ptr<ASTNode> left = statements.back();
            statements.pop_back();

            if (right->type == ASTNodeType::ExpressionBinary) {
                right = std::make_shared<StatementParentheseNode>(right);
            }

            if (left->type == ASTNodeType::ExpressionBinary) {
                left = std::make_shared<StatementParentheseNode>(left);
            }

            statements.push_back(std::make_shared<ExpressionBinaryNode>(opStr, left, right));
            address = op.address + op.size;
        }

        else if (op.type == QVMOpType::CALL) {
            if (statements.empty()) {
                throw std::runtime_error("call expression lacks callee");
                success = false;
                return {};
            }
            std::shared_ptr<ASTNode> callee = statements.back();
            statements.pop_back();
            if (callee->type != ASTNodeType::LiteralIdentifier)
                throw std::runtime_error("CALL callee is not an identifier");
            const auto skip = addrToInstrIndex.find(op.address + op.size);
            if (skip == addrToInstrIndex.end() || qvm.instructions[skip->second].type != QVMOpType::BRA)
                throw std::runtime_error("CALL must be followed by its argument skip BRA");
            const auto& skipOp = qvm.instructions[skip->second];
            const int64_t afterArgs = int64_t(skipOp.address) + skipOp.size + int32_t(skipOp.operand);
            if (int32_t(skipOp.operand) < 0)
                throw std::runtime_error("CALL argument skip BRA must jump forward");

            std::vector<std::vector<std::shared_ptr<ASTNode>>> arguments;
            for (int32_t jump : op.call_targets) {
                if (jump < int64_t(skipOp.address) + skipOp.size || jump >= afterArgs)
                    throw std::runtime_error("CALL argument entry is outside its inline argument region");
                uint32_t argAddr = static_cast<uint32_t>(jump);
                auto argStmts = walk(qvm, addrToInstrIndex, argAddr, success, context);
                if (!success) {
                    return {};
                }
                const auto terminator = addrToInstrIndex.find(argAddr);
                if (argStmts.size() != 1 || terminator == addrToInstrIndex.end() || argAddr >= afterArgs ||
                    (qvm.instructions[terminator->second].type != QVMOpType::BRK &&
                     qvm.instructions[terminator->second].type != QVMOpType::RET))
                    throw std::runtime_error("CALL argument must be one expression ending with BRK or RET");
                arguments.push_back(argStmts);
            }

            statements.push_back(std::make_shared<ExpressionCallNode>(callee, arguments));

            uint32_t exAddr = op.address + op.size;
            auto itEx = addrToInstrIndex.find(exAddr);
            if (itEx != addrToInstrIndex.end()) {
                const QVMInstruction& ex = qvm.instructions[itEx->second];
                address = ex.address + ex.size + static_cast<int32_t>(ex.operand);
            } else {
                address = exAddr;
            }
        }

        else if (op.type == QVMOpType::BF) {
            if (statements.empty()) {
                throw std::runtime_error("conditional branch lacks test expression");
                success = false;
                return {};
            }
            std::shared_ptr<ASTNode> test = statements.back();
            statements.pop_back();

            bool isWhile = false;
            bool isIfElse = false;
            int32_t exData = 0;
            uint32_t exAddr = 0;
            uint32_t exSize = 0;

            uint32_t targetAddr = op.address + op.size + static_cast<int32_t>(op.operand);
            if (targetAddr >= 5) {
                uint32_t prevAddr = targetAddr - 5;
                auto itPrev = addrToInstrIndex.find(prevAddr);
                if (itPrev != addrToInstrIndex.end()) {
                    const QVMInstruction& ex = qvm.instructions[itPrev->second];
                    if (ex.type == QVMOpType::BRA) {
                        exData = static_cast<int32_t>(ex.operand);
                        exAddr = ex.address;
                        exSize = ex.size;
                        if (exData < 0) {
                            isWhile = true;
                        } else if (exData > 0) {
                            isIfElse = true;
                        }
                    }
                }
            }

            if (isWhile) {
                uint32_t bodyAddr = op.address + op.size;
                auto body = walk(qvm, addrToInstrIndex, bodyAddr, success, context);
                if (!success) {
                    return {};
                }
                statements.push_back(std::make_shared<StatementWhileNode>(test, body));
                address = targetAddr;
            } else {
                uint32_t trueAddr = op.address + op.size;
                auto trueBranch = walk(qvm, addrToInstrIndex, trueAddr, success, context);
                if (!success) {
                    return {};
                }
                address = targetAddr;

                if (isIfElse) {
                    uint32_t falseAddr = targetAddr;
                    uint32_t untilAddr = exAddr + exSize + exData;
                    auto falseBranch = walk(qvm, addrToInstrIndex, falseAddr, success, context, untilAddr);
                    if (!success) {
                        return {};
                    }
                    statements.push_back(std::make_shared<StatementIfNode>(test, trueBranch, falseBranch));
                    address = untilAddr;
                } else {
                    statements.push_back(std::make_shared<StatementIfNode>(test, trueBranch));
                }
            }
        }

        else {
            throw std::runtime_error("Unsupported opcode: " + std::string(QVM_OpName(op.type)));
            success = false;
            return {};
        }
    }

    return statements;
}

std::string QVM_DecompileToString(const QVMFile& qvm) {
    if (!qvm.valid) throw std::runtime_error("Invalid QVM: " + qvm.error);
    if (qvm.instructions.empty()) return "";
    std::map<uint32_t, size_t> addrToInstrIndex;
    for (size_t i = 0; i < qvm.instructions.size(); ++i)
        addrToInstrIndex[qvm.instructions[i].address] = i;
    uint32_t address = 0;
    bool success = true;
    WalkContext context;
    auto tree = walk(qvm, addrToInstrIndex, address, success, context);
    if (!success) throw std::runtime_error("Decompilation failed during AST reconstruction");
    if (address < qvm.header.sz_ctable) {
        const auto end = addrToInstrIndex.find(address);
        if (end == addrToInstrIndex.end() ||
            (qvm.instructions[end->second].type != QVMOpType::BRK && qvm.instructions[end->second].type != QVMOpType::RET) ||
            address + qvm.instructions[end->second].size != qvm.header.sz_ctable)
            throw std::runtime_error("Unsupported trailing or unstructured QVM control flow");
    }
    std::string text;
    for (const auto& st : tree) {
        text += st->strepr(0);
        if (st->type != ASTNodeType::StatementIf && st->type != ASTNodeType::StatementWhile)
            text += ";\n";
        if (text.size() > 4 * 1024 * 1024) throw std::runtime_error("Decompiled QSC exceeds 4 MiB");
    }
    return text;
}

bool QVM_Decompile(const QVMFile& qvm, const std::string& outpath) {
    try {
        auto source = QVM_DecompileToString(qvm);
        std::ofstream out(outpath, std::ios::binary);
        out << source;
        return bool(out);
    } catch (const std::exception&) { return false; }
}
