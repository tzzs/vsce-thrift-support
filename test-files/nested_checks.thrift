namespace java com.example.thrift

struct NestedTest {
    1: map<string, string>        simpleMap      ,
    2: map<string, map<i32, i32>> nestedMap      ,
    3: map<string, list<i32>>     mapWithList    ,
    4: list<map<string, string>>  listWithMap    ,
    5: map<string, string>        mapWithDefault  = {'key1': 'value1', 'key2': 'value2'},
    6: list<i32>                  listWithDefault = [1, 2, 3, 4],
    7: map<string, list<i32>>     complexDefault  = {'a': [1, 2], 'b': [3, 4]},
}

service TestService {
    map<string, string>getMap(1: map<i32, i32>input),
    void complexMethod(1: map<string, list<map<i32, string>>>complexArg)
}
