include "../test-files/shared.thrift"

struct MainStruct {

    1: required shared.SharedStruct sharedData (go.tag='json:"sharedData"'),  // 共享数据
    2: optional shared.SharedEnum   status     (go.tag='json:"status"'),      // 状态
}

service MainService {
    void processData(1: MainStruct data)
}


struct User {
    1: i16             id, // 用户ID
    2: string          username = "alice", // 用户名
    3: i32             score, // 积分
    4: map<string,i64> stats = {}, // 统计数据
    4: i32 test,
}