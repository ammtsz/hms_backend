import { applyDecorators, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import {
  CreatePatientDto,
  UpdatePatientDto,
  PatientResponseDto,
} from '../dtos/patient.dto';

/**
 * Base decorator for patient operations
 */
export function ApiPatientOperation(summary: string) {
  return applyDecorators(
    ApiOperation({ summary }),
    ApiResponse({
      status: 200,
      description: 'Operation successful',
      type: PatientResponseDto,
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
      description: 'Not found - Patient does not exist',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal server error',
    }),
  );
}

/**
 * Decorator for creating a new patient
 */
export function ApiCreatePatientOperation() {
  return applyDecorators(
    HttpCode(HttpStatus.CREATED),
    ApiOperation({
      summary: 'Create new patient',
      description:
        'Creates a new patient with the provided information.',
    }),
    ApiBody({ type: CreatePatientDto }),
    ApiResponse({
      status: 201,
      description: 'The patient has been successfully created.',
      type: PatientResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid patient data or validation errors',
    }),
    ApiResponse({
      status: 409,
      description: 'Conflict - Patient with this phone number already exists',
    }),
  );
}

/**
 * Decorator for updating a patient
 */
export function ApiUpdatePatientOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Update patient',
      description: 'Updates an existing patient with the provided data.',
    }),
    ApiParam({ name: 'id', description: 'Patient ID' }),
    ApiBody({ type: UpdatePatientDto }),
    ApiResponse({
      status: 200,
      description: 'The patient has been successfully updated.',
      type: PatientResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad request - Invalid patient data or validation errors',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Patient does not exist',
    }),
  );
}

/**
 * Decorator for deleting a patient
 */
export function ApiDeletePatientOperation() {
  return applyDecorators(
    HttpCode(HttpStatus.NO_CONTENT),
    ApiOperation({
      summary: 'Delete patient',
      description:
        'Deletes a patient if they have no active attendances.',
    }),
    ApiParam({ name: 'id', description: 'Patient ID' }),
    ApiResponse({
      status: 204,
      description: 'The patient has been successfully deleted.',
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Patient does not exist',
    }),
    ApiResponse({
      status: 409,
      description: 'Conflict - Patient has active attendances',
    }),
  );
}

/**
 * Decorator for retrieving all patients
 */
export function ApiFindAllPatientsOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get all patients',
      description: 'Retrieves a list of all patients in the system.',
    }),
    ApiResponse({
      status: 200,
      description: 'List of all patients',
      type: [PatientResponseDto],
    }),
  );
}

/**
 * Decorator for retrieving a single patient
 */
export function ApiFindOnePatientOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get patient by ID',
      description: 'Retrieves a specific patient by their ID.',
    }),
    ApiParam({ name: 'id', description: 'Patient ID' }),
    ApiResponse({
      status: 200,
      description: 'The patient',
      type: PatientResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Not found - Patient does not exist',
    }),
  );
}
