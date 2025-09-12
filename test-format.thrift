struct User {
    1:   required     string       name,
    2: optional   i32    age,
    3:required string     email,
    4:  optional    bool      isActive,
    5:   required   list<string>    tags,
}

enum Status {
    ACTIVE = 1,
    INACTIVE = 2,
    SUSPENDED = 3,
}

service UserService {
    User getUser(1: string userId),
    void updateUser(1: User user),
    list<User> getAllUsers(),
}