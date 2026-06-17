# Exception Handling Guidelines

## Overview

This directory contains the custom exception classes used by the HMS backend.
All custom exceptions extend `BaseException`, which standardizes the HTTP error response.

## Exported exceptions

### Base exceptions

- `BaseException`: shared base for all custom HTTP exceptions
- `ResourceNotFoundException`: generic not-found error for missing resources
- `ValidationException`: generic validation error with optional details

### Patient exceptions

- `DuplicatePatientException`: duplicate patient detected
- `InvalidPatientPriorityException`: patient priority is invalid
- `PatientStatusUpdateException`: invalid patient status transition
- `PatientHasActiveAttendancesException`: patient cannot be deleted while active attendances exist

### Attendance exceptions

- `AttendanceScheduleConflictException`: attendance already exists for the requested time
- `InvalidAttendanceStatusTransitionException`: attendance status transition is invalid
- `AttendanceTimeSlotUnavailableException`: requested slot is unavailable

### Consultation exceptions

- `DuplicateConsultationException`: consultation already exists for the attendance
- `InvalidAttendanceStatusException`: attendance status does not allow consultation creation
- `InvalidReturnWeeksException`: return weeks value is outside the allowed range

### Schedule setting exceptions

- `InvalidScheduleTimeException`: schedule time is invalid
- `ScheduleSettingConflictException`: schedule setting already exists for the day
- `InvalidConcurrentAttendancesException`: concurrent attendance limit is invalid
- `ScheduleSettingInUseException`: schedule setting cannot be deleted while in use

## Standard error response

All custom exceptions return the same response shape:

```typescript
{
  statusCode: number;
  message: string;
  error: string;
  details?: unknown;
}
```

## Usage guidelines

1. Throw a domain-specific exception when a business rule is violated.
2. Use `ResourceNotFoundException` for missing entities.
3. Use `ValidationException` for input validation failures when a more specific exception is not needed.
4. Let controllers propagate exceptions and format them in the global filter.

## Examples

### Duplicate patient

```typescript
throw new DuplicatePatientException(patientName, phone, existingPatientId);
```

### Invalid attendance status transition

```typescript
throw new InvalidAttendanceStatusTransitionException(
  attendanceId,
  currentStatus,
  targetStatus,
);
```

### Validation error with details

```typescript
throw new ValidationException('Validation failed', {
  field: 'priority',
  value: priority,
});
```
