include "../test-files/shared.thrift"

struct MainStruct {
    1: required shared.SharedStruct sharedData (go.tag='json:"sharedData"'),
    2: optional shared.SharedEnum   status     (go.tag='json:"status"'),    
}

service MainService {
    void processData(1: MainStruct data)
}