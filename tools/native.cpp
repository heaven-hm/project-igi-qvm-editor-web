// Build/test utility only. The product performs conversion in a browser Worker.
#include "api.h"
#include <fstream>
#include <iostream>
#include <iterator>
int main(int argc, char** argv) {
    if (argc != 4 && argc != 5) { std::cerr << "Usage: qvm_native compile|decompile input output [5|7]\n"; return 1; }
    std::ifstream input(argv[2], std::ios::binary);
    if (!input) { std::cerr << "Cannot open input\n"; return 2; }
    std::string data{std::istreambuf_iterator<char>(input), {}};
    igi::Result r;
    std::string operation = argv[1];
    if (operation == "compile") {
        const std::string target = argc == 5 ? argv[4] : "5";
        if (target != "5" && target != "7") { std::cerr << "Target must be 5 (IGI 1) or 7 (IGI 2)\n"; return 1; }
        r = igi::CompileQSC(data, target == "5" ? 5 : 7);
    }
    else if (operation == "decompile") r = igi::DecompileQVM(reinterpret_cast<const uint8_t*>(data.data()), data.size());
    else { std::cerr << "Unknown operation\n"; return 1; }
    if (!r.ok) { std::cerr << r.error << '\n'; return 3; }
    std::ofstream output(argv[3], std::ios::binary);
    if (operation == "compile") output.write(reinterpret_cast<const char*>(r.binary.data()), r.binary.size());
    else output << r.source;
    return output ? 0 : 4;
}
