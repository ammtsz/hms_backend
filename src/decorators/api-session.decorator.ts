import { applyDecorators, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import {
  CreateSessionDto,
  UpdateSessionDto,
  SessionResponseDto,
} from '../dtos/session.dto';

/**
 * Base decorator for session (`hms_session`) operations.
 */
export function ApiSessionOperation(summary: string) {
  return applyDecorators(
    ApiOperation({ summary }),
    ApiResponse({
      status: 200,
      description: 'Operation successful',
      type: SessionResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid input data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Session does not exist',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

/**
 * Decorator for creating a new session (`hms_session`).
 */
export function ApiCreateSessionOperation() {
  return applyDecorators(
    HttpCode(HttpStatus.CREATED),
    ApiOperation({
      summary: 'Create session',
      description: 'Creates a new scheduled session under a treatment.',
    }),
    ApiBody({ type: CreateSessionDto }),
    ApiResponse({
      status: 201,
      description: 'Session created successfully',
      type: SessionResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid session data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Parent treatment not found',
    }),
    ApiResponse({
      status: 409,
      description:
        'Conflict - A session already exists for this session number',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

/**
 * Decorator for updating a session (`hms_session`).
 */
export function ApiUpdateSessionOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update session',
      description: 'Updates an existing session with new information.',
    }),
    ApiParam({ name: 'id', description: 'Session ID' }),
    ApiBody({ type: UpdateSessionDto }),
    ApiResponse({
      status: 200,
      description: 'Session updated successfully',
      type: SessionResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid session data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Session not found',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

/**
 * Decorator for deleting a session (`hms_session`).
 */
export function ApiDeleteSessionOperation() {
  return applyDecorators(
    HttpCode(HttpStatus.NO_CONTENT),
    ApiOperation({
      summary: 'Delete session',
      description: 'Deletes a session permanently.',
    }),
    ApiParam({ name: 'id', description: 'Session ID' }),
    ApiResponse({
      status: 204,
      description: 'Session deleted successfully',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Session not found',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

/**
 * Decorator for listing sessions by parent treatment.
 */
export function ApiGetSessionsByTreatmentOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get sessions by treatment',
      description:
        'Retrieves all sessions scheduled under a treatment (`hms_treatment.id`).',
    }),
    ApiParam({ name: 'treatmentId', description: 'Treatment ID' }),
    ApiResponse({
      status: 200,
      description: 'Sessions retrieved successfully',
      type: [SessionResponseDto],
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Treatment not found',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

/**
 * Decorator for completing a session
 */
export function ApiCompleteSessionOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Complete a session',
      description:
        'Marks a session as completed and records completion details.',
    }),
    ApiParam({ name: 'id', description: 'Session ID' }),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          attendanceId: {
            type: 'number',
            description: 'Associated attendance ID (optional)',
          },
          notes: { type: 'string', description: 'Completion notes (optional)' },
        },
      },
    }),
    ApiResponse({
      status: 200,
      description: 'Session completed successfully',
      type: SessionResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid completion data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Session not found',
    }),
    ApiResponse({
      status: 409,
      description: 'Conflict - Session already completed',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}
