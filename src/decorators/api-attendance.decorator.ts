import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

export function ApiAttendanceOperation(summary: string) {
  return applyDecorators(
    ApiOperation({ summary }),
    ApiResponse({
      status: 200,
      description: 'Operation successful',
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
      description: 'Not found - Requested resource does not exist',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

export function ApiCreateAttendanceOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new attendance',
      description:
        'Creates a new attendance for a patient with the specified details.',
    }),
    ApiResponse({
      status: 201,
      description: 'Attendance created successfully',
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid attendance data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Patient not found',
    }),
    ApiResponse({
      status: 409,
      description: 'Conflict - Schedule conflict or duplicate appointment',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

export function ApiUpdateAttendanceOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update an attendance',
      description:
        'Updates an existing attendance with the provided data.',
    }),
    ApiResponse({
      status: 200,
      description: 'Attendance updated successfully',
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid attendance data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Attendance not found',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}
