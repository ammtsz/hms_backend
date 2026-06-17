import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import {
  UpdateConsultationDto,
  ConsultationResponseDto,
} from '../dtos/consultation.dto';

export function ApiConsultationOperation(summary: string) {
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

export function ApiCreateConsultationOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Create consultation',
      description: 'Creates a new consultation for an attendance.',
    }),
    ApiResponse({
      status: 201,
      description: 'Consultation created successfully',
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid consultation data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Related attendance not found',
    }),
    ApiResponse({
      status: 409,
      description:
        'Conflict - Consultation already exists for this attendance',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

export function ApiUpdateConsultationOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update consultation',
      description: 'Updates an existing consultation with new information.',
    }),
    ApiParam({ name: 'id', description: 'Consultation ID' }),
    ApiBody({ type: UpdateConsultationDto }),
    ApiResponse({
      status: 200,
      description: 'Consultation updated successfully',
      type: ConsultationResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid consultation data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Consultation not found',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

export function ApiDeleteConsultationOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Delete consultation',
      description: 'Deletes an existing consultation.',
    }),
    ApiParam({ name: 'id', description: 'Consultation ID' }),
    ApiResponse({
      status: 200,
      description: 'Consultation deleted successfully',
    }),
    ApiResponse({
      status: 404,
      description: 'Consultation not found',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

export function ApiFindAllConsultationsOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get all consultations',
      description: 'Retrieves a list of all consultations.',
    }),
    ApiResponse({
      status: 200,
      description: 'List of consultations retrieved successfully',
      type: [ConsultationResponseDto],
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

export function ApiFindOneConsultationOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get consultation by ID',
      description: 'Retrieves a specific consultation by its ID.',
    }),
    ApiParam({ name: 'id', description: 'Consultation ID' }),
    ApiResponse({
      status: 200,
      description: 'Consultation retrieved successfully',
      type: ConsultationResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Consultation not found',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

export function ApiFindConsultationByAttendanceOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get consultation by attendance ID',
      description: 'Retrieves the consultation for a specific attendance.',
    }),
    ApiParam({ name: 'id', description: 'Attendance ID' }),
    ApiResponse({
      status: 200,
      description: 'Consultation retrieved successfully',
      type: ConsultationResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'No consultation found for this attendance',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}
