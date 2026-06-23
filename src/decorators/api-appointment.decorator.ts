import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

export function ApiAppointmentOperation(summary: string) {
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

export function ApiCreateAppointmentOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create a new appointment',
      description:
        'Creates a new appointment for a patient with the specified details.',
    }),
    ApiResponse({
      status: 201,
      description: 'Appointment created successfully',
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid appointment data',
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

export function ApiUpdateAppointmentOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update an appointment',
      description:
        'Updates an existing appointment with the provided data.',
    }),
    ApiResponse({
      status: 200,
      description: 'Appointment updated successfully',
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid appointment data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Appointment not found',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}
