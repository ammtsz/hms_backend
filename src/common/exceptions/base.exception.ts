import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Standard error response format for the application.
 * This ensures consistency in error handling across all endpoints.
 */
export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  details?: unknown;
}

/**
 * Base exception class for all custom exceptions in the application.
 * Extends NestJS's HttpException to provide standardized error responses.
 */
export class BaseException extends HttpException {
  constructor(
    message: string,
    error: string,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    details?: unknown,
  ) {
    const response: ErrorResponse = {
      statusCode: status,
      message,
      error,
      details,
    };
    super(response, status);
  }
}

/**
 * Exception thrown when a requested resource is not found.
 * Use this for generic resource not found errors.
 * For more specific cases, create domain-specific exceptions.
 */
export class ResourceNotFoundException extends BaseException {
  constructor(resource: string, id: string | number) {
    super(
      `${resource} with ID ${id} not found`,
      'Not Found',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class ValidationException extends BaseException {
  constructor(message: string, details?: unknown) {
    super(
      message,
      'Validation Error',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }
}
