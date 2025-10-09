namespace java com.example

struct User {
  1: required i32 id,
  2: optional string name,
  3: required bool active = true
}

enum Status {
  ACTIVE = 1,
  INACTIVE = 2,
  PENDING = 3
}

service UserService {
  User getUser(1: i32 userId),
  void createUser(1: User user),
  Status getUserStatus(1: i32 userId)
}

const i32 MAX_USERS = 1000