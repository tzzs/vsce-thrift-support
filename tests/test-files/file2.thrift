enum Status {
  ACTIVE = 1,
  INACTIVE = 2
}
service UserService {
  User getUser(1: i32 id)
}