#include "api.h"
#include "semantics.h"
#include <fstream>
#include <iostream>
#include <iterator>
#include <random>
#include <cstring>

static int checks = 0, failures = 0;
static void check(bool yes, const std::string& name) { ++checks; if (!yes) { ++failures; std::cerr << "FAIL: " << name << '\n'; } }
static igi::Result inspect(const std::vector<uint8_t>& b) { return igi::InspectQVM(b.data(), b.size()); }
static void put32(std::vector<uint8_t>& b, size_t at, uint32_t v) { if (at + 4 <= b.size()) std::memcpy(b.data() + at, &v, 4); }
static void roundtrip(const std::string& source, const std::string& name, uint32_t minor) {
    auto compiled = igi::CompileQSC(source, minor);
    check(compiled.ok, name + " compile " + compiled.error);
    if (!compiled.ok) return;
    auto parsed = inspect(compiled.binary);
    check(parsed.ok && parsed.metadata.header.ver_minor == minor, name + " target version");
    auto decoded = igi::DecompileQVM(compiled.binary.data(), compiled.binary.size());
    check(decoded.ok, name + " decompile " + decoded.error);
    if (!decoded.ok) return;
    auto rebuilt = igi::CompileQSC(decoded.source, minor);
    check(rebuilt.ok, name + " recompile " + rebuilt.error);
    if (!rebuilt.ok) return;
    check(QVM_Equivalent(compiled.metadata,rebuilt.metadata),name+" original instruction/control-flow semantics preserved");
    auto decoded2 = igi::DecompileQVM(rebuilt.binary.data(), rebuilt.binary.size());
    check(decoded2.ok && decoded2.source == decoded.source, name + " canonical source stability");
    check(rebuilt.binary == igi::CompileQSC(decoded2.source, minor).binary, name + " canonical byte stability");
}
int main() {
    std::ifstream fixture(std::string(FIXTURE_DIR) + "/objects.qsc");
    std::string objects{std::istreambuf_iterator<char>(fixture), {}};
    check(!objects.empty(), "fixture exists");
    for (uint32_t minor : {5u, 7u}) {
        roundtrip(objects, "objects", minor);
        roundtrip("a = 1 + 2 * 3; b = (a << 2) | 4; c = !a && b != 0;", "operators", minor);
        roundtrip("a=+1; b=-a; c=~a; d=a/b; e=a-b; f=a>>1; g=a&b; h=a^b; i=a||b; j=a<=b; k=a>=b; l=a>b; m=a<b; n=TRUE; Foo(0xFFFFFFFF, 256, 65536, 0.5, 1e-3);", "all operators and immediate widths", minor);
        roundtrip("// comment\n/* multiline\ncomment */ ; { Foo(); } if (a) Foo(); else if (b) Bar(); else Baz();", "comments empty block and else-if", minor);
        roundtrip("Task_New(-1, \"C:\\\\missions\\\\test\", \"a\\\"b\", FALSE, -2147483648);", "strings and signed integers", minor);
        roundtrip("if (a == 1) { Foo(2); if (b) { Bar(3); } } else { Baz(4); } while (a < 5) { a = a + 1; }", "nested control flow", minor);
        auto reordered = igi::CompileQSC("Foo(); Bar();", minor);
        auto table = reordered.metadata.header.of_itable;
        uint32_t first=0,second=0;
        std::memcpy(&first,reordered.binary.data()+table,4);std::memcpy(&second,reordered.binary.data()+table+4,4);
        put32(reordered.binary,table,second);put32(reordered.binary,table+4,first);
        auto reorderedSource = igi::DecompileQVM(reordered.binary.data(),reordered.binary.size());
        check(reorderedSource.ok && reorderedSource.source.find("Bar") < reorderedSource.source.find("Foo"), "identifier offset table defines identifier ordering");
        auto callShape = igi::CompileQSC("Foo(1); Bar();", minor);
        for(size_t i=0;i+1<callShape.metadata.instructions.size();++i)if(callShape.metadata.instructions[i].type==QVMOpType::CALL){
            auto& next=callShape.metadata.instructions[i+1];
            if(next.type==QVMOpType::BRA){
                callShape.binary[callShape.metadata.header.of_ctable+next.address]=QVM_EncodeOpcode(QVMOpType::PUSH,minor);
                auto result=igi::DecompileQVM(callShape.binary.data(),callShape.binary.size());
                check(!result.ok,"reject CALL without skip BRA");break;
            }
        }
        auto multiExpression=igi::CompileQSC("Foo(1 + 2);",minor);
        for(const auto& instruction:multiExpression.metadata.instructions)if(instruction.type==QVMOpType::ADD){
            multiExpression.binary[multiExpression.metadata.header.of_ctable+instruction.address]=QVM_EncodeOpcode(QVMOpType::PUSH0,minor);
            check(inspect(multiExpression.binary).ok,"multiple argument expressions remain structurally parsable");
            check(!igi::DecompileQVM(multiExpression.binary.data(),multiExpression.binary.size()).ok,"reject CALL argument with multiple expressions");break;
        }
        auto loop=igi::CompileQSC("while (a) { Foo(); } Bar();",minor);
        uint32_t conditionBranch=0;
        for(const auto& instruction:loop.metadata.instructions)if(instruction.type==QVMOpType::BF){conditionBranch=instruction.address;break;}
        for(const auto& instruction:loop.metadata.instructions)if(instruction.type==QVMOpType::BRA&&int32_t(instruction.operand)<0){
            put32(loop.binary,loop.metadata.header.of_ctable+instruction.address+1,uint32_t(int32_t(conditionBranch)-int32_t(instruction.address+instruction.size)));
            check(inspect(loop.binary).ok,"changed loop branch is structurally valid");
            check(!igi::DecompileQVM(loop.binary.data(),loop.binary.size()).ok,"reject loop backedge changed to BF");break;
        }
    }
    for (const std::string& invalid : {"Foo(;", "Foo(1e999);", "Foo(4294967296);", "Foo(0xFFFFFFFFF);", "Foo(\"unterminated);", "/* unterminated", "Foo(@);"}) {
        auto r = igi::CompileQSC(invalid);
        check(!r.ok && !r.error.empty(), "reject invalid source " + invalid);
    }
    check(!igi::CompileQSC(std::string("Foo();\0Bar();", 13)).ok, "reject embedded NUL");
    check(igi::ValidateQSC(objects).ok,"validate valid source through public API");
    check(!igi::ValidateQSC("Foo(@);").ok,"validate invalid source through public API");
    check(!igi::CompileQSC("Foo();", 6).ok, "reject unsupported compile target");
    check(!igi::CompileQSC("a=" + std::string(300, '(') + "1" + std::string(300, ')') + ";").ok, "reject deep parentheses");
    check(!igi::CompileQSC("a=" + std::string(300, '!') + "1;").ok, "reject deep unary source");
    std::string tooManyCalls;for(int i=0;i<4097;++i)tooManyCalls+="Foo();";
    check(!igi::CompileQSC(tooManyCalls).ok,"reject call count overflow");
    check(!igi::CompileQSC(std::string(4*1024*1024+1,' ')).ok,"reject oversized QSC source");
    auto sample = igi::CompileQSC("Foo(1, \"test\");");
    if (sample.ok) {
        for (size_t size = 0; size < sample.binary.size(); ++size) check(!igi::InspectQVM(sample.binary.data(), size).ok, "reject truncated QVM at " + std::to_string(size));
        auto bad = sample.binary; bad[0] = 'X'; check(!inspect(bad).ok, "reject signature");
        for (size_t offset : {size_t(12), size_t(16), size_t(28), size_t(32), size_t(44)}) { bad = sample.binary; put32(bad, offset, 0xffffffffu); check(!inspect(bad).ok, "reject overflowing section " + std::to_string(offset)); }
        bad = sample.binary; put32(bad, 8, 6); check(!inspect(bad).ok, "reject unsupported binary version");
        bad = sample.binary; put32(bad, 4, 7); check(!inspect(bad).ok,"reject unsupported major version");
        auto metadata = inspect(sample.binary).metadata;
        bad = sample.binary; bad[metadata.header.of_ctable] = 255; check(!inspect(bad).ok, "reject illegal opcode");
        bad = sample.binary; bad[metadata.header.of_ctable] = uint8_t(QVMOpType::CALL); put32(bad, metadata.header.of_ctable + 1, 0xffffffffu); check(!inspect(bad).ok, "reject overflowing CALL");
        bad = sample.binary; bad[metadata.header.of_ctable] = uint8_t(QVMOpType::BRA); put32(bad, metadata.header.of_ctable + 1, 0xfffffffeu); check(!inspect(bad).ok, "reject out of bounds branch");
        bad = sample.binary; bad[metadata.header.of_ctable] = uint8_t(QVMOpType::PUSHSI); put32(bad, metadata.header.of_ctable + 1, 0xffffffffu); check(!inspect(bad).ok, "reject invalid string index");
        std::mt19937 random(0x514d56);
        for (int i = 0; i < 500; ++i) { bad = sample.binary; for (int j = 0; j < 3; ++j) bad[random() % bad.size()] = uint8_t(random()); auto r = igi::DecompileQVM(bad.data(), bad.size()); check(r.ok || !r.error.empty(), "mutations return structured result"); }
    }
    check(!igi::InspectQVM(nullptr, 1).ok, "reject null input");
    for(uint32_t minor:{5u,7u}){
        const uint32_t header=minor==7?64:60, pool=1024*1024, table=9*4;
        std::vector<uint8_t> aliases(header+table+pool+1,0);
        std::memcpy(aliases.data(),"LOOP",4);put32(aliases,4,8);put32(aliases,8,minor);
        put32(aliases,12,header);put32(aliases,16,header);
        put32(aliases,28,header);put32(aliases,32,header+table);put32(aliases,36,table);put32(aliases,40,pool);
        put32(aliases,44,header+table+pool);put32(aliases,48,1);
        std::fill(aliases.begin()+header+table,aliases.begin()+header+table+pool-1,'a');
        check(!inspect(aliases).ok,"reject expanded string-table aliases beyond memory bound");
        put32(aliases,36,8*4);
        check(inspect(aliases).ok,"accept string-table aliases exactly at expanded memory bound");
    }
    std::cout << checks << " checks, " << failures << " failures\n";
    return failures ? 1 : 0;
}
