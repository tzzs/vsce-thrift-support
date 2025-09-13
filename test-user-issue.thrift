struct User {
  1: required UserId     id,
  2: required string    name,
  3: optional Email email,
  4: optional i32 age,
  5: optional Status status = Status.ACTIVE,
  6: optional list<string> tags,
  7: optional map<string, string> metadata,
  8: optional bool isVerified = false,
  9: optional double score = 0.0,
  10: optional binary avatar
}