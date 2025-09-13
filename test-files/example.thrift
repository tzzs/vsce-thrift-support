/*
 * Example Thrift file to demonstrate the extension features
 * This file follows Apache Thrift coding standards
 */

namespace java com.example.thrift
namespace py example.thrift

include "shared.thrift"

// Basic data types demonstration
typedef i32 UserId
typedef string Email

// Enum definition
enum Status {
  ACTIVE = 1,
  INACTIVE = 2,
  PENDING = 3,
  SUSPENDED = 4
}

// Struct definition with various field types
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

// Union definition
union SearchCriteria {
  1: string name,
  2: Email email,
  3: UserId id,
  4: list<string> tags
}

// Exception definition
exception UserNotFoundException {
  1: required string message,
  2: optional i32 errorCode = 404
}

exception ValidationException {
  1: required string message,
  2: required map<string, string> fieldErrors
}

// Service definition
service UserService {
  /**
   * Create a new user
   */
  User createUser(1: User user) throws (1: ValidationException validationError),
  
  /**
   * Get user by ID
   */
  User getUser(1: UserId userId) throws (1: UserNotFoundException notFound),
  
  /**
   * Update user information
   */
  void updateUser(1: UserId userId, 2: User user) 
    throws (1: UserNotFoundException notFound, 2: ValidationException validationError),
  
  /**
   * Delete user
   */
  oneway void deleteUser(1: UserId userId),
  
  /**
   * Search users by criteria
   */
  list<User> searchUsers(1: SearchCriteria criteria, 2: i32 limit = 10, 3: i32 offset = 0),
  
  /**
   * Get user count
   */
  i64 getUserCount(),
  
  /**
   * Batch get users
   */
  map<UserId, User> batchGetUsers(1: list<UserId> userIds)
}

// Constants
const i32 MAX_USERS = 10000
const string DEFAULT_NAMESPACE = "com.example"
const list<string> SUPPORTED_LANGUAGES = ["java", "python", "cpp", "javascript"]
const map<string, i32> ERROR_CODES = {
    "NOT_FOUND": 404,
    "VALIDATION_ERROR": 400,
    "INTERNAL_ERROR": 500
}