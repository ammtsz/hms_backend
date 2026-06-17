import { applyDecorators, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import {
  CreateTreatmentDto,
  UpdateTreatmentDto,
  TreatmentResponseDto,
} from '../dtos/treatment.dto';

/**
 * Base decorator for treatment (`hms_treatment`) operations.
 */
export function ApiTreatmentOperation(summary: string) {
  return applyDecorators(
    ApiOperation({ summary }),
    ApiResponse({
      status: 200,
      description: 'Operation successful',
      type: TreatmentResponseDto,
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
      description: 'Not found - Treatment does not exist',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

/**
 * Decorator for creating a new treatment (`hms_treatment`).
 */
export function ApiCreateTreatmentOperation() {
  return applyDecorators(
    HttpCode(HttpStatus.CREATED),
    ApiOperation({
      summary: 'Create treatment',
      description:
        'Creates a physiotherapy or tens treatment for a patient with the given consultation, attendance, and schedule.',
    }),
    ApiBody({ type: CreateTreatmentDto }),
    ApiResponse({
      status: 201,
      description: 'Treatment created successfully',
      type: TreatmentResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid treatment data',
    }),
    ApiResponse({
      status: 401,
      description: 'Unauthorized - Authentication required',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Related consultation, attendance, or patient not found',
    }),
    ApiResponse({
      status: 409,
      description:
        'Conflict - A matching treatment already exists for this context',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

/**
 * Decorator for updating a treatment (`hms_treatment`).
 */
export function ApiUpdateTreatmentOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update treatment',
      description:
        'Updates an existing treatment (notes, body location, physiotherapy options, etc.).',
    }),
    ApiParam({ name: 'id', description: 'Treatment ID' }),
    ApiBody({ type: UpdateTreatmentDto }),
    ApiResponse({
      status: 200,
      description: 'Treatment updated successfully',
      type: TreatmentResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid treatment data',
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
 * Decorator for deleting a treatment (`hms_treatment`); child sessions cascade.
 */
export function ApiDeleteTreatmentOperation() {
  return applyDecorators(
    HttpCode(HttpStatus.NO_CONTENT),
    ApiOperation({
      summary: 'Delete treatment',
      description:
        'Deletes a treatment and all associated sessions (`hms_session`).',
    }),
    ApiParam({ name: 'id', description: 'Treatment ID' }),
    ApiResponse({
      status: 204,
      description: 'Treatment deleted successfully',
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
 * Decorator for listing treatments by patient.
 */
export function ApiGetTreatmentsByPatientOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get treatments by patient',
      description:
        'Retrieves all physiotherapy / tens treatments for a patient (each includes nested sessions).',
    }),
    ApiParam({ name: 'patientId', description: 'Patient ID' }),
    ApiResponse({
      status: 200,
      description: 'Treatments retrieved successfully',
      type: [TreatmentResponseDto],
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
      status: 500,
      description: 'Internal server error',
    }),
  );
}
