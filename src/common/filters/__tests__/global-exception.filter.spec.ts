import { Test, TestingModule } from '@nestjs/testing';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { GlobalExceptionFilter } from '../global-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockResponse: Partial<Response>;
  let mockRequest: { url: string };
  let mockArgumentsHost: Partial<ArgumentsHost>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GlobalExceptionFilter],
    }).compile();

    filter = module.get<GlobalExceptionFilter>(GlobalExceptionFilter);

    // Mock console.error to avoid noisy output in tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockRequest = {
      url: '/test-endpoint',
    };

    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('HTTP Exceptions', () => {
    it('should handle HttpException with object response', () => {
      const exception = new HttpException(
        {
          message: 'Validation failed',
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        error: 'Bad Request',
        timestamp: expect.any(String),
      });
    });

    it('should handle HttpException with string response', () => {
      const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Not found',
        error: 'HttpException',
        timestamp: expect.any(String),
      });
    });

    it('should handle HttpException with array message', () => {
      const exception = new HttpException(
        {
          message: ['Field 1 is required', 'Field 2 is invalid'],
          error: 'Validation Error',
        },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        message: ['Field 1 is required', 'Field 2 is invalid'],
        error: 'Validation Error',
        timestamp: expect.any(String),
      });
    });

    it('should merge extra fields from HttpException object response', () => {
      const exception = new HttpException(
        {
          message: 'Não é possível desativar',
          error: 'Conflict',
          blocking_patients: [{ id: 1, name: 'A' }],
        },
        HttpStatus.CONFLICT,
      );

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          message: 'Não é possível desativar',
          blocking_patients: [{ id: 1, name: 'A' }],
        }),
      );
    });

    it('should include details for 422 validation responses', () => {
      const exception = new HttpException(
        {
          message: 'Validation failed',
          error: 'Unprocessable Entity',
          details: [{ field: 'email', message: 'invalid' }],
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: ['Validation failed'],
        error: 'Unprocessable Entity',
        details: [{ field: 'email', message: 'invalid' }],
        timestamp: expect.any(String),
      });
    });
  });

  describe('Database Exceptions', () => {
    it('should handle QueryFailedError with duplicate entry (23505)', () => {
      const exception = new QueryFailedError(
        'INSERT INTO table ...',
        [],
        new Error('duplicate key value violates unique constraint'),
      );
      const dbException = exception as QueryFailedError & {
        code?: string;
        detail?: string;
      };
      dbException.code = '23505';
      dbException.detail = 'Key (email)=(test@test.com) already exists.';

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.CONFLICT,
        message: 'Duplicate entry found',
        error: 'Conflict',
        timestamp: expect.any(String),
      });
    });

    it('should handle QueryFailedError with foreign key violation (23503)', () => {
      const exception = new QueryFailedError(
        'INSERT INTO table ...',
        [],
        new Error('foreign key constraint violation'),
      );
      const dbException = exception as QueryFailedError & {
        code?: string;
        detail?: string;
      };
      dbException.code = '23503';
      dbException.detail =
        'Key (patient_id)=(999) is not present in table "patients".';

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      // M5: PostgreSQL `detail` must NOT be sent to clients; use generic message
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Referenced record not found',
        error: 'Bad Request',
        timestamp: expect.any(String),
      });
    });

    it('should handle generic QueryFailedError without detail', () => {
      const exception = new QueryFailedError(
        'SELECT * FROM table',
        [],
        new Error('generic database error'),
      );

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Database operation failed',
        error: 'Database Error',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Generic Exceptions', () => {
    it('should handle unknown exceptions', () => {
      const exception = new Error('Unexpected error occurred');

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal Server Error',
        timestamp: expect.any(String),
      });
    });

    it('should handle null exceptions', () => {
      filter.catch(null, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal Server Error',
        timestamp: expect.any(String),
      });
    });

    it('should handle undefined exceptions', () => {
      filter.catch(undefined, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal Server Error',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Response Formatting', () => {
    it('should include valid timestamp in ISO format', () => {
      const exception = new Error('Test error');
      const beforeTime = new Date().toISOString();

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
      const timestamp = call.timestamp;
      const afterTime = new Date().toISOString();

      expect(timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(timestamp >= beforeTime).toBeTruthy();
      expect(timestamp <= afterTime).toBeTruthy();
    });

    it('should not include request path in client JSON (N-ERR-PATH)', () => {
      mockRequest.url = '/api/patients/123';
      const exception = new Error('Test error');

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      const payload = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(payload).not.toHaveProperty('path');
    });
  });
});
