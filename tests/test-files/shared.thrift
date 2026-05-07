namespace java com.example.shared

enum Priority {
  LOW = -1,
  MEDIUM = 2,
  HIGH = 3,
  NEW
}

struct Address {
  1: required string street,
  2: optional string city,
  3: optional string country
}

const string DEFAULT_COUNTRY = "USA"