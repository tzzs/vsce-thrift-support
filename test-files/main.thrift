include "shared.thrift"

struct MainStruct {
    1: required shared.SharedStruct sharedData,
    2: optional shared.SharedEnum status
}

service MainService {
    void processData(1: MainStruct data)
}