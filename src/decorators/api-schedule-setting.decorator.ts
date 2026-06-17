import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

export function ApiScheduleSettingOperation(summary: string) {
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
      description: 'Not found - Requested schedule setting does not exist',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

export function ApiCreateScheduleSettingOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new schedule setting',
      description:
        'Creates a new schedule setting for a specific day of the week.',
    }),
    ApiResponse({
      status: 201,
      description: 'Schedule setting created successfully',
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid schedule setting data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 409,
      description: 'Conflict - Schedule setting already exists for this day',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

export function ApiUpdateScheduleSettingOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update a schedule setting',
      description: 'Updates an existing schedule setting with new information.',
    }),
    ApiResponse({
      status: 200,
      description: 'Schedule setting updated successfully',
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid schedule setting data or time format',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Schedule setting not found',
    }),
    ApiResponse({
      status: 409,
      description: 'Conflict - Time slot conflicts with existing settings',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}
