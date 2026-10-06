// Compatibility harness, built against an explicitly supplied converter checkout.
#include "qsc_lexer.h"
#include "qsc_parser.h"
#include "qvm_compiler.h"
#include "qvm_parser.h"
#include "qvm_decompiler.h"
#include "logger.h"
#include <fstream>
#include <iostream>
#include <iterator>
void Logger::Log(LogLevel, const std::string&) {}
void Logger::Init(const std::string&) {}
int main(int argc, char** argv) {
    if (argc != 4) return 1;
    if (std::string(argv[1]) == "compile") {
        std::ifstream in(argv[2], std::ios::binary);
        if (!in) return 2;
        std::string source{std::istreambuf_iterator<char>(in), {}};
        auto lex = qsc::Lex(source);
        if (!lex.ok) { std::cerr << lex.error; return 3; }
        auto parsed = qsc::Parse(lex.tokens);
        if (!parsed.ok) { std::cerr << parsed.error; return 3; }
        std::string error;
        if (!qvm::CompileToFile(*parsed.program, argv[3], &error)) { std::cerr << error; return 4; }
    } else {
        auto file = QVM_Parse(argv[2]);
        if (!file.valid) { std::cerr << file.error; return 3; }
        if (!QVM_Decompile(file, argv[3])) return 4;
    }
    return 0;
}
