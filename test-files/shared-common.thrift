/*
 * Shared Thrift definitions
 * Common types and structures used across multiple services
 */

namespace java com.example.shared
namespace py example.shared

// Common data types
typedef string UUID
typedef i64 Timestamp

// Common enums
enum ResponseCode {
  SUCCESS = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  INTERNAL_ERROR = 500
}

// Base response structure
struct BaseResponse {
  1: required ResponseCode code,
  2: optional string message,
  3: optional Timestamp timestamp,
  4: optional UUID requestId
}

// Pagination info
struct PaginationInfo {
  1: required i32 page,
  2: required i32 pageSize,
  3: required i64 totalCount,
  4: required i32 totalPages
}

// Generic paginated response
struct PaginatedResponse {
  1: required BaseResponse response,
  2: optional PaginationInfo pagination
}

// Common exceptions
exception ServiceException {
  1: required ResponseCode code,
  2: required string message,
  3: optional map<string, string> details
}