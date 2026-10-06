#include "api.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <map>
#include <tuple>

using Entry = std::tuple<QVMOpType, uint32_t, std::vector<size_t>>;
// Width choices and zero-distance compiler guard branches may differ. Every
// nontrivial control-flow edge and CALL argument entry must still be identical.
std::vector<Entry> normalize(const QVMFile& q) {
    std::map<uint32_t,size_t> index;
    size_t ordinal=0;
    for(const auto& i:q.instructions) {index[i.address]=ordinal;if(!(i.type==QVMOpType::BRA&&i.operand==0))++ordinal;}
    index[q.header.sz_ctable]=ordinal;
    auto destination=[&](uint32_t address){auto it=index.find(address);if(it==index.end())throw std::runtime_error("edge does not land on an instruction");return it->second;};
    std::vector<Entry> out;
    for(const auto& i:q.instructions) {
        auto op=i.type;auto v=i.operand;std::vector<size_t> edges;
        if(op==QVMOpType::BRA&&v==0)continue;
        if(op==QVMOpType::PUSHB){op=QVMOpType::PUSH;v=uint32_t(int32_t(int8_t(v)));}
        if(op==QVMOpType::PUSHW){op=QVMOpType::PUSH;v=uint32_t(int32_t(int16_t(v)));}
        if(op==QVMOpType::PUSH0){op=QVMOpType::PUSH;v=0;}
        if(op==QVMOpType::PUSH1){op=QVMOpType::PUSH;v=1;}
        if(op==QVMOpType::PUSHM){op=QVMOpType::PUSH;v=UINT32_MAX;}
        if(op==QVMOpType::PUSHIIB||op==QVMOpType::PUSHIIW)op=QVMOpType::PUSHII;
        if(op==QVMOpType::PUSHSIB||op==QVMOpType::PUSHSIW)op=QVMOpType::PUSHSI;
        if(op==QVMOpType::BRA||op==QVMOpType::BF||op==QVMOpType::BT){edges.push_back(destination(uint32_t(int64_t(i.address)+i.size+int32_t(v))));v=0;}
        if(op==QVMOpType::CALL){for(auto address:i.call_targets)edges.push_back(destination(uint32_t(address)));}
        out.emplace_back(op,v,edges);
    }
    return out;
}
int main(int argc,char**argv) {
    if(argc<2){std::cerr<<"Usage: qvm_corpus_semantics game-directory [more-directories...]\n";return 2;}
    size_t total=0,failed=0;std::map<uint32_t,size_t> versions;
    for(int arg=1;arg<argc;++arg)for(const auto& e:std::filesystem::recursive_directory_iterator(argv[arg])) {
        if(!e.is_regular_file())continue;auto ext=e.path().extension().string();for(char& c:ext)c=char(std::tolower(c));if(ext!=".qvm")continue;
        ++total;std::ifstream file(e.path(),std::ios::binary);std::string bytes{std::istreambuf_iterator<char>(file),{}};
        auto original=igi::InspectQVM(reinterpret_cast<const uint8_t*>(bytes.data()),bytes.size());
        auto decoded=igi::DecompileQVM(reinterpret_cast<const uint8_t*>(bytes.data()),bytes.size());
        auto compiled=igi::CompileQSC(decoded.source,original.metadata.header.ver_minor);
        ++versions[original.metadata.header.ver_minor];
        try {
            if(!original.ok||!decoded.ok||!compiled.ok||normalize(original.metadata)!=normalize(compiled.metadata)||original.metadata.identifiers!=compiled.metadata.identifiers||original.metadata.strings!=compiled.metadata.strings)throw std::runtime_error(original.error+" "+decoded.error+" "+compiled.error+" semantic mismatch");
        }catch(const std::exception& error){++failed;std::cerr<<e.path().filename()<<": "<<error.what()<<'\n';}
    }
    std::cout<<total<<" files, "<<failed<<" semantic failures";for(auto [version,count]:versions)std::cout<<", 8."<<version<<"="<<count;std::cout<<'\n';return !total||failed?1:0;
}
