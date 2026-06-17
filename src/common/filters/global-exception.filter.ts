import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Global exception filter that handles all unhandled exceptions in the application.
 *
 * Error Handling Strategy:
 * 1. HTTP Exceptions (NestJS and custom):
 *    - Preserves the status code and error message
 *    - Formats response consistently using ErrorResponse interface
 *
 * 2. Database Errors (TypeORM):
 *    - Converts database errors to appropriate HTTP responses
 *    - Special handling for common cases:
 *      * Unique constraint violations (23505) -> 409 Conflict
 *      * Foreign key violations (23503) -> 400 Bad Request
 *
 * 3. Unexpected Errors:
 *    - Converts to 500 Internal Server Error
 *    - Logs error details for debugging
 *    - Returns safe error message to client
 *
 * Usage:
 * - Let this filter handle all standard HTTP exceptions
 * - Create domain-specific exceptions for business logic errors
 * - Use TypeORM's QueryFailedError for database operation failures
 */

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as Record<string, unknown>;

      const extraFields =
        exceptionResponse && typeof exceptionResponse === 'object'
          ? (() => {
              const { message: _ignoredMessage, error: _ignoredError, ...rest } =
                exceptionResponse;
              return rest;
            })()
          : {};

      if (typeof exceptionResponse === 'object') {
        const rawMessage = exceptionResponse.message;
        message =
          typeof rawMessage === 'string' || Array.isArray(rawMessage)
            ? rawMessage
            : 'Internal server error';
      } else {
        message = exceptionResponse as string;
      }

      error = (exceptionResponse.error as string) || exception.name;

      // For validation errors (422), include detailed field-level errors in response
      // This helps frontend display specific error messages to users
      if (status === HttpStatus.UNPROCESSABLE_ENTITY && exceptionResponse.details) {
        response.status(status).json({
          statusCode: status,
          message: Array.isArray(message) ? message : [message],
          error,
          details: exceptionResponse.details,
          ...extraFields,
          timestamp: new Date().toISOString(),
        });
        return;
      }
    } else if (exception instanceof QueryFailedError) {
      // Handle database specific errors — log request path server-side only (N-ERR-PATH)
      console.error('Database Error Details:', {
        path: request.url,
        message: exception.message,
        query: (exception as QueryFailedError & { query?: string }).query,
        parameters: (exception as QueryFailedError & { parameters?: unknown[] })
          .parameters,
        code: (exception as QueryFailedError & { code?: string }).code,
        detail: (exception as QueryFailedError & { detail?: string }).detail,
      });

      const dbCode = (exception as QueryFailedError & { code?: string }).code;
      status = HttpStatus.BAD_REQUEST;
      message = 'Database operation failed';
      error = 'Database Error';

      if (dbCode === '23505') {
        message = 'Duplicate entry found';
        error = 'Conflict';
        status = HttpStatus.CONFLICT;
      } else if (dbCode === '23503') {
        message = 'Referenced record not found';
        error = 'Bad Request';
      }
    } else {
      console.error('Unexpected Error:', { path: request.url, exception });
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      ...(typeof exception === 'object' &&
      exception instanceof HttpException &&
      typeof (exception.getResponse() as Record<string, unknown>) === 'object'
        ? (() => {
            const exceptionResponse = exception.getResponse() as Record<
              string,
              unknown
            >;
            const { message: _ignoredMessage, error: _ignoredError, ...rest } =
              exceptionResponse;
            return rest;
          })()
        : {}),
      timestamp: new Date().toISOString(),
    });
  }
}
