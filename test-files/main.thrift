include "../test-files/shared.thrift"

struct MainStruct {

    1: required shared.SharedStruct sharedData (go.tag='json:"sharedData"'),  // 共享数据
    2: optional shared.SharedEnum   status     (go.tag='json:"status"'),      // 状态
}

service MainService {
    void processData(1: MainStruct data)
}