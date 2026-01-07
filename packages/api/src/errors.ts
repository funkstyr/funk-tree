import { ORPCError } from "@orpc/server";

/**
 * Standard error codes used across the API.
 * Maps to HTTP status codes:
 * - NOT_FOUND: 404
 * - BAD_REQUEST: 400
 * - UNAUTHORIZED: 401
 * - FORBIDDEN: 403
 * - INTERNAL_SERVER_ERROR: 500
 */

/**
 * Resource not found error.
 * Use when a requested entity (person, relationship, etc.) doesn't exist.
 */
export function notFound(resource: string, identifier: string) {
  return new ORPCError("NOT_FOUND", {
    message: `${resource} '${identifier}' not found`,
  });
}

/**
 * Bad request error for invalid input.
 * Use when user-provided data fails validation beyond Zod schema.
 */
export function badRequest(message: string) {
  return new ORPCError("BAD_REQUEST", { message });
}

/**
 * Database operation error.
 * Wraps database errors with a generic message for security.
 */
export function databaseError(operation: string, originalError?: unknown) {
  // Log the original error for debugging
  if (originalError) {
    console.error(`Database error in ${operation}:`, originalError);
  }

  return new ORPCError("INTERNAL_SERVER_ERROR", {
    message: `Database operation failed: ${operation}`,
  });
}

/**
 * Validation error for business logic validation.
 * Use when data passes schema validation but fails business rules.
 */
export function validationError(field: string, message: string) {
  return new ORPCError("BAD_REQUEST", {
    message: `Validation failed for '${field}': ${message}`,
  });
}

/**
 * Helper to execute database operations with error handling.
 */
export async function withDatabaseErrorHandling<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw databaseError(operation, error);
  }
}
