#include "api.h"
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
        roundtrip("Task_New(-1, \"C:\\\\missions\\\\test\", \"a\\\"b\", FALSE, -2147483648);", "strings and signed integers", minor);
        roundtrip("if (a == 1) { Foo(2); if (b) { Bar(3); } } else { Baz(4); } while (a < 5) { a = a + 1; }", "nested control flow", minor);
    }
    for (const std::string& invalid : {"Foo(;", "Foo(1e999);", "Foo(4294967296);", "Foo(0xFFFFFFFFF);", "Foo(\"unterminated);", "/* unterminated", "Foo(@);"}) {
        auto r = igi::CompileQSC(invalid);
        check(!r.ok && !r.error.empty(), "reject invalid source " + invalid);
    }
    check(!igi::CompileQSC(std::string("Foo();\0Bar();", 13)).ok, "reject embedded NUL");
    check(!igi::CompileQSC("Foo();", 6).ok, "reject unsupported compile target");
    check(!igi::CompileQSC("a=" + std::string(300, '(') + "1" + std::string(300, ')') + ";").ok, "reject deep parentheses");
    check(!igi::CompileQSC("a=" + std::string(300, '!') + "1;").ok, "reject deep unary source");
    auto sample = igi::CompileQSC("Foo(1, \"test\");");
    if (sample.ok) {
        for (size_t size = 0; size < sample.binary.size(); ++size) check(!igi::InspectQVM(sample.binary.data(), size).ok, "reject truncated QVM at " + std::to_string(size));
        auto bad = sample.binary; bad[0] = 'X'; check(!inspect(bad).ok, "reject signature");
        for (size_t offset : {size_t(12), size_t(16), size_t(28), size_t(32), size_t(44)}) { bad = sample.binary; put32(bad, offset, 0xffffffffu); check(!inspect(bad).ok, "reject overflowing section " + std::to_string(offset)); }
        bad = sample.binary; put32(bad, 8, 6); check(!inspect(bad).ok, "reject unsupported binary version");
        auto metadata = inspect(sample.binary).metadata;
        bad = sample.binary; bad[metadata.header.of_ctable] = 255; check(!inspect(bad).ok, "reject illegal opcode");
        bad = sample.binary; bad[metadata.header.of_ctable] = uint8_t(QVMOpType::CALL); put32(bad, metadata.header.of_ctable + 1, 0xffffffffu); check(!inspect(bad).ok, "reject overflowing CALL");
        bad = sample.binary; bad[metadata.header.of_ctable] = uint8_t(QVMOpType::BRA); put32(bad, metadata.header.of_ctable + 1, 0xfffffffeu); check(!inspect(bad).ok, "reject out of bounds branch");
        bad = sample.binary; bad[metadata.header.of_ctable] = uint8_t(QVMOpType::PUSHS); put32(bad, metadata.header.of_ctable + 1, 0xffffffffu); check(!inspect(bad).ok, "reject invalid string index");
        std::mt19937 random(0x514d56);
        for (int i = 0; i < 500; ++i) { bad = sample.binary; for (int j = 0; j < 3; ++j) bad[random() % bad.size()] = uint8_t(random()); auto r = igi::DecompileQVM(bad.data(), bad.size()); check(r.ok || !r.error.empty(), "mutations return structured result"); }
    }
    check(!igi::InspectQVM(nullptr, 1).ok, "reject null input");
    std::cout << checks << " checks, " << failures << " failures\n";
    return failures ? 1 : 0;
}
