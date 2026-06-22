import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EndOfDayProcessService } from '../end-of-day-process.service';
import { DayFinalizationService } from '../day-finalization.service';
import { AttendanceService } from '../attendance.service';
import { PatientService } from '../patient.service';
import { TreatmentService } from '../treatment.service';
import { SessionService } from '../session.service';
import { SystemSettingsService } from '../system-settings.service';
import { Attendance } from '../../entities/attendance.entity';
import { AttendanceType, AttendanceStatus, PatientStatus } from '../../common/enums';
import type { ProcessEndOfDayRequestDto } from '../../dtos/process-end-of-day.dto';

describe('EndOfDayProcessService', () => {
  let service: EndOfDayProcessService;
  let dayFinalizationService: DayFinalizationService;
  let attendanceService: AttendanceService;
  let patientService: PatientService;
  let treatmentService: TreatmentService;
  let sessionService: SessionService;

  const mockAttendance = {
    id: 1,
    patient_id: 1,
    patient: { name: 'John Doe' },
    type: AttendanceType.ASSESSMENT,
    status: AttendanceStatus.MISSED,
    scheduled_date: '2024-01-15',
    scheduled_time: '14:00',
  } as Attendance;

  const mockPatient = {
    id: 1,
    name: 'John Doe',
    missing_appointments_streak: 1,
    patient_status: PatientStatus.IN_TREATMENT,
  };

  const mockDayFinalizationService = {
    isDayFinalized: jest.fn().mockResolvedValue(false),
    finalizeDay: jest.fn().mockResolvedValue({}),
  };

  const mockAttendanceService = {
    update: jest.fn().mockResolvedValue(mockAttendance),
    reschedule: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    bulkCancel: jest.fn().mockImplementation((ids: number[]) =>
      Promise.resolve({
        success_count: ids.length,
        failure_count: 0,
        successes: ids.map((attendance_id) => ({
          attendance_id,
          message: 'Successfully cancelled',
        })),
        failures: [],
      }),
    ),
    findByPatientId: jest.fn().mockResolvedValue([]),
    isDateAvailableForScheduling: jest.fn().mockResolvedValue(true),
    checkHolidayAndPostpone: jest.fn((date: string) => Promise.resolve(date)),
    postpone: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn().mockResolvedValue(mockAttendance),
    getNextAvailableDateForAttendance: jest.fn().mockResolvedValue(null),
    getTreatmentIdForAttendanceId: jest.fn().mockResolvedValue(null),
    findNextSchedulableDate: jest.fn().mockImplementation((date: string) => Promise.resolve(date)),
  };

  const mockPatientService = {
    findOne: jest.fn().mockResolvedValue(mockPatient),
    update: jest.fn().mockResolvedValue({}),
    setPatientStatus: jest.fn().mockResolvedValue({
      patient: { ...mockPatient, patient_status: 'F' },
      cancelledAttendances: [],
    }),
  };

  const mockTreatmentService = {
    getTreatmentsByPatient: jest.fn().mockResolvedValue([]),
    cancelTreatment: jest.fn().mockResolvedValue(undefined),
    getSessionWithReturnConfig: jest.fn().mockResolvedValue(null),
  };

  const mockSessionService = {
    getSessionsByAttendance: jest.fn().mockResolvedValue([]),
    getMaxScheduledDateForTreatment: jest.fn().mockResolvedValue(null),
  };

  const mockSystemSettingsService = {
    getMissingAppointmentsThreshold: jest.fn().mockResolvedValue(3),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDayFinalizationService.isDayFinalized.mockResolvedValue(false);
    mockPatientService.findOne.mockResolvedValue({
      ...mockPatient,
      missing_appointments_streak: 1,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EndOfDayProcessService,
        {
          provide: DayFinalizationService,
          useValue: mockDayFinalizationService,
        },
        {
          provide: AttendanceService,
          useValue: mockAttendanceService,
        },
        {
          provide: PatientService,
          useValue: mockPatientService,
        },
        {
          provide: TreatmentService,
          useValue: mockTreatmentService,
        },
        {
          provide: SessionService,
          useValue: mockSessionService,
        },
        {
          provide: SystemSettingsService,
          useValue: mockSystemSettingsService,
        },
      ],
    }).compile();

    service = module.get<EndOfDayProcessService>(EndOfDayProcessService);
    dayFinalizationService = module.get<DayFinalizationService>(DayFinalizationService);
    attendanceService = module.get<AttendanceService>(AttendanceService);
    patientService = module.get<PatientService>(PatientService);
    treatmentService = module.get<TreatmentService>(TreatmentService);
    sessionService = module.get<SessionService>(
      SessionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('idempotency', () => {
    it('should throw ConflictException when day is already finalized', async () => {
      mockDayFinalizationService.isDayFinalized.mockResolvedValue(true);

      const dto: ProcessEndOfDayRequestDto = {
        date: '2024-01-15',
        absence_justifications: [
          { attendance_id: 1, justified: false, notes: '' },
        ],
      };

      await expect(service.processEndOfDay(dto)).rejects.toThrow(ConflictException);
      await expect(service.processEndOfDay(dto)).rejects.toThrow('Day already finalized.');

      expect(mockDayFinalizationService.isDayFinalized).toHaveBeenCalledWith('2024-01-15');
      expect(mockAttendanceService.update).not.toHaveBeenCalled();
    });
  });

  describe('empty absence justifications', () => {
    it('should finalize day and return empty summary when no absences', async () => {
      const dto: ProcessEndOfDayRequestDto = {
        date: '2024-01-15',
        absence_justifications: [],
      };

      const result = await service.processEndOfDay(dto);

      expect(result).toEqual({
        rescheduled: [],
        status_changed_to_f: [],
        cancelled_for_f: [],
        could_not_reschedule: [],
      });
      expect(mockDayFinalizationService.finalizeDay).toHaveBeenCalledWith(
        '2024-01-15',
        'Day finalized without absences',
      );
      expect(mockAttendanceService.update).not.toHaveBeenCalled();
    });
  });

  describe('with absence justifications', () => {
    it('should mark each absence as MISSED via attendanceService.update', async () => {
      mockAttendanceService.update.mockResolvedValue({
        ...mockAttendance,
        id: 1,
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2024-01-15',
      });
      mockAttendanceService.isDateAvailableForScheduling.mockResolvedValue(true);

      const dto: ProcessEndOfDayRequestDto = {
        date: '2024-01-15',
        absence_justifications: [
          { attendance_id: 1, justified: false },
          { attendance_id: 2, justified: true, notes: 'Medical' },
        ],
      };

      await service.processEndOfDay(dto);

      expect(mockAttendanceService.update).toHaveBeenCalledTimes(2);
      expect(mockAttendanceService.update).toHaveBeenNthCalledWith(1, 1, {
        status: AttendanceStatus.MISSED,
        absence_justified: false,
        absence_notes: null,
      });
      expect(mockAttendanceService.update).toHaveBeenNthCalledWith(2, 2, {
        status: AttendanceStatus.MISSED,
        absence_justified: true,
        absence_notes: 'Medical',
      });
    });

    it('should call finalizeDay after processing absences', async () => {
      mockAttendanceService.update.mockResolvedValue({
        ...mockAttendance,
        id: 1,
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2024-01-15',
      });
      mockAttendanceService.isDateAvailableForScheduling.mockResolvedValue(true);

      const dto: ProcessEndOfDayRequestDto = {
        date: '2024-01-15',
        absence_justifications: [{ attendance_id: 1, justified: false, notes: '' }],
      };

      await service.processEndOfDay(dto);

      expect(mockDayFinalizationService.finalizeDay).toHaveBeenCalledWith(
        '2024-01-15',
        expect.stringContaining('absence'),
      );
    });

    it('should transition patient to F and include cancelled attendances in summary when streak is 3', async () => {
      mockPatientService.findOne.mockResolvedValue({
        ...mockPatient,
        missing_appointments_streak: 3,
      });
      mockAttendanceService.update.mockResolvedValue({
        ...mockAttendance,
        id: 1,
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2024-01-15',
      });
      const cancelledAttendances = [
        { id: 10, type: 'assessment', scheduled_date: '2024-01-20' },
      ];
      mockPatientService.setPatientStatus.mockResolvedValueOnce({
        patient: { ...mockPatient, patient_status: PatientStatus.ABSENT },
        cancelledAttendances,
      });

      const dto: ProcessEndOfDayRequestDto = {
        date: '2024-01-15',
        absence_justifications: [{ attendance_id: 1, justified: false, notes: '' }],
      };

      const result = await service.processEndOfDay(dto);

      expect(mockSystemSettingsService.getMissingAppointmentsThreshold).toHaveBeenCalled();
      expect(mockPatientService.setPatientStatus).toHaveBeenCalledWith(
        1,
        PatientStatus.ABSENT,
        { cancellationReason: '3 consecutive unjustified absences' },
      );
      expect(mockPatientService.update).not.toHaveBeenCalled();
      expect(result.status_changed_to_f).toHaveLength(1);
      expect(result.status_changed_to_f[0].patient_id).toBe(1);
      expect(result.cancelled_for_f).toHaveLength(1);
      expect(result.cancelled_for_f[0].attendances).toEqual(cancelledAttendances);
    });

    describe('non-T patients with first assessment attendance (N, A, F)', () => {
      const firstAssessmentAttendance = {
        id: 1,
        patient_id: 1,
        patient: { name: 'John Doe' },
        type: AttendanceType.ASSESSMENT,
        status: AttendanceStatus.MISSED,
        scheduled_date: '2024-01-15',
        scheduled_time: '14:00',
        parent_attendance_id: null,
      } as Attendance;

      const nextDate = '2024-01-22';

      beforeEach(() => {
        mockAttendanceService.update.mockResolvedValue(firstAssessmentAttendance);
        mockAttendanceService.getNextAvailableDateForAttendance.mockResolvedValue(nextDate);
        mockAttendanceService.reschedule.mockResolvedValue([{ ...firstAssessmentAttendance, scheduled_date: nextDate }]);
      });

      it.each([
        ['NEW_PATIENT', PatientStatus.NEW_PATIENT],
        ['DISCHARGED (A)', PatientStatus.DISCHARGED],
        ['ABSENT (F)', PatientStatus.ABSENT],
      ])('should reschedule first assessment attendance for %s patient', async (_label, status) => {
        mockPatientService.findOne.mockResolvedValue({
          ...mockPatient,
          missing_appointments_streak: 1,
          patient_status: status,
        });

        const dto: ProcessEndOfDayRequestDto = {
          date: '2024-01-15',
          absence_justifications: [{ attendance_id: 1, justified: false }],
        };

        const result = await service.processEndOfDay(dto);

        expect(mockAttendanceService.reschedule).toHaveBeenCalledWith(
          { attendance_ids: [1], new_scheduled_date: nextDate },
          { allowFirstAssessmentForNonTreatment: true },
        );
        expect(result.rescheduled).toHaveLength(1);
        expect(result.rescheduled[0].attendance_id).toBe(1);
        expect(result.rescheduled[0].new_date).toBe(nextDate);
        expect(result.could_not_reschedule).toHaveLength(0);
      });

      it('should push to could_not_reschedule when non-T patient misses a non-qualifying attendance (not first assessment)', async () => {
        const nonQualifyingAttendance = {
          ...firstAssessmentAttendance,
          type: AttendanceType.PHYSIOTHERAPY,
        } as Attendance;

        mockAttendanceService.update.mockResolvedValue(nonQualifyingAttendance);
        mockPatientService.findOne.mockResolvedValue({
          ...mockPatient,
          missing_appointments_streak: 1,
          patient_status: PatientStatus.DISCHARGED,
        });

        const dto: ProcessEndOfDayRequestDto = {
          date: '2024-01-15',
          absence_justifications: [{ attendance_id: 1, justified: false }],
        };

        const result = await service.processEndOfDay(dto);

        expect(mockAttendanceService.reschedule).not.toHaveBeenCalled();
        expect(result.could_not_reschedule).toHaveLength(1);
        expect(result.could_not_reschedule[0].reason).toBe(
          "Patient doesn't have an active treatment",
        );
      });

      it('should push to could_not_reschedule when non-T patient has first assessment but no date available', async () => {
        mockAttendanceService.getNextAvailableDateForAttendance.mockResolvedValue(null);
        mockPatientService.findOne.mockResolvedValue({
          ...mockPatient,
          missing_appointments_streak: 1,
          patient_status: PatientStatus.NEW_PATIENT,
        });

        const dto: ProcessEndOfDayRequestDto = {
          date: '2024-01-15',
          absence_justifications: [{ attendance_id: 1, justified: false }],
        };

        const result = await service.processEndOfDay(dto);

        expect(mockAttendanceService.reschedule).not.toHaveBeenCalled();
        expect(result.could_not_reschedule).toHaveLength(1);
        expect(result.could_not_reschedule[0].reason).toBe(
            'Could not find an available date within 52 weeks',
        );
      });
    });

    describe('same-day multiple treatment misses — per-treatment rescheduling', () => {
      const missedDate = '2024-01-15';
      // Two different treatment plans: treatment 1 last session Jan 22, treatment 2 last session Jan 29
      const nextDateT1 = '2024-01-29'; // next slot after treatment 1 last session (Jan 22)
      const nextDateT2 = '2024-02-05'; // next slot after treatment 2 last session (Jan 29)

      const physiotherapyMiss1 = {
        id: 10,
        patient_id: 1,
        patient: { name: 'John Doe' },
        type: AttendanceType.PHYSIOTHERAPY,
        status: AttendanceStatus.MISSED,
        scheduled_date: missedDate,
        scheduled_time: '09:00:00',
      } as Attendance;

      const physiotherapyMiss2 = {
        id: 11,
        patient_id: 1,
        patient: { name: 'John Doe' },
        type: AttendanceType.PHYSIOTHERAPY,
        status: AttendanceStatus.MISSED,
        scheduled_date: missedDate,
        scheduled_time: '09:30:00',
      } as Attendance;

      beforeEach(() => {
        mockPatientService.findOne.mockResolvedValue({
          ...mockPatient,
          missing_appointments_streak: 1,
          patient_status: PatientStatus.IN_TREATMENT,
        });
        mockAttendanceService.getTreatmentIdForAttendanceId.mockResolvedValue(100);
        mockSessionService.getMaxScheduledDateForTreatment.mockResolvedValue(null);
        mockAttendanceService.update.mockImplementation((id: number) => {
          if (id === 10) return Promise.resolve(physiotherapyMiss1);
          if (id === 11) return Promise.resolve(physiotherapyMiss2);
          return Promise.reject(new Error(`Unknown attendance id: ${id}`));
        });
        mockAttendanceService.reschedule.mockResolvedValue([]);
      });

      it('should call getNextAvailableDateForAttendance once per attendance (not once per group)', async () => {
        mockAttendanceService.getNextAvailableDateForAttendance
          .mockResolvedValueOnce(nextDateT1)  // for id 10
          .mockResolvedValueOnce(nextDateT2); // for id 11

        const dto: ProcessEndOfDayRequestDto = {
          date: missedDate,
          absence_justifications: [
            { attendance_id: 10, justified: false },
            { attendance_id: 11, justified: false },
          ],
        };

        const result = await service.processEndOfDay(dto);

        expect(mockAttendanceService.getNextAvailableDateForAttendance).toHaveBeenCalledTimes(2);
        expect(mockAttendanceService.getNextAvailableDateForAttendance).toHaveBeenCalledWith(10);
        expect(mockAttendanceService.getNextAvailableDateForAttendance).toHaveBeenCalledWith(11);

        expect(mockAttendanceService.reschedule).toHaveBeenCalledTimes(2);
        expect(mockAttendanceService.reschedule).toHaveBeenCalledWith(
          { attendance_ids: [10], new_scheduled_date: nextDateT1 },
          undefined,
        );
        expect(mockAttendanceService.reschedule).toHaveBeenCalledWith(
          { attendance_ids: [11], new_scheduled_date: nextDateT2 },
          undefined,
        );

        expect(result.rescheduled).toHaveLength(2);
        expect(result.rescheduled.find((r) => r.attendance_id === 10)?.new_date).toBe(nextDateT1);
        expect(result.rescheduled.find((r) => r.attendance_id === 11)?.new_date).toBe(nextDateT2);
        expect(result.could_not_reschedule).toHaveLength(0);
      });

      it('should independently reschedule two physiotherapy plans from the same patient on the same day to different dates', async () => {
        // Treatment 1 (id 10): last session Jan 22 → next = Jan 29
        // Treatment 2 (id 11): last session Jan 29 → next = Feb 05
        mockAttendanceService.getNextAvailableDateForAttendance
          .mockResolvedValueOnce(nextDateT1)
          .mockResolvedValueOnce(nextDateT2);

        const dto: ProcessEndOfDayRequestDto = {
          date: missedDate,
          absence_justifications: [
            { attendance_id: 10, justified: false },
            { attendance_id: 11, justified: false },
          ],
        };

        const result = await service.processEndOfDay(dto);

        expect(result.rescheduled).toHaveLength(2);
        expect(result.rescheduled.find((r) => r.attendance_id === 10)?.new_date).toBe(nextDateT1);
        expect(result.rescheduled.find((r) => r.attendance_id === 11)?.new_date).toBe(nextDateT2);
      });

      it('should reschedule three tens misses independently, one call per attendance', async () => {
        const tensMiss1 = { ...physiotherapyMiss1, id: 20, type: AttendanceType.TENS } as Attendance;
        const tensMiss2 = { ...physiotherapyMiss2, id: 21, type: AttendanceType.TENS } as Attendance;
        const tensMiss3 = { ...physiotherapyMiss2, id: 22, type: AttendanceType.TENS, scheduled_time: '10:00:00' } as Attendance;

        mockAttendanceService.update.mockImplementation((id: number) => {
          if (id === 20) return Promise.resolve(tensMiss1);
          if (id === 21) return Promise.resolve(tensMiss2);
          if (id === 22) return Promise.resolve(tensMiss3);
          return Promise.reject(new Error(`Unknown attendance id: ${id}`));
        });
        mockAttendanceService.getNextAvailableDateForAttendance.mockResolvedValue(nextDateT1);

        const dto: ProcessEndOfDayRequestDto = {
          date: missedDate,
          absence_justifications: [
            { attendance_id: 20, justified: false },
            { attendance_id: 21, justified: false },
            { attendance_id: 22, justified: false },
          ],
        };

        const result = await service.processEndOfDay(dto);

        expect(mockAttendanceService.getNextAvailableDateForAttendance).toHaveBeenCalledTimes(3);
        expect(mockAttendanceService.reschedule).toHaveBeenCalledTimes(3);
        expect(result.rescheduled).toHaveLength(3);
      });
    });

    describe('resilience – partial failures do not prevent day finalization', () => {
      it('should finalize day even when attendanceService.update throws for one attendance', async () => {
        mockAttendanceService.update
          .mockRejectedValueOnce(new Error('DB error'))
          .mockResolvedValueOnce({
            ...mockAttendance,
            id: 2,
            patient_id: 2,
            type: AttendanceType.ASSESSMENT,
            scheduled_date: '2024-01-15',
          });

        const dto: ProcessEndOfDayRequestDto = {
          date: '2024-01-15',
          absence_justifications: [
            { attendance_id: 1, justified: false },
            { attendance_id: 2, justified: false },
          ],
        };

        await service.processEndOfDay(dto);

        expect(mockDayFinalizationService.finalizeDay).toHaveBeenCalledWith(
          '2024-01-15',
          expect.stringContaining('absence'),
        );
      });

      it('should finalize day and push to could_not_reschedule when patientService.findOne throws', async () => {
        mockAttendanceService.update.mockResolvedValue(mockAttendance);
        mockPatientService.findOne.mockRejectedValue(new Error('Patient not found'));

        const dto: ProcessEndOfDayRequestDto = {
          date: '2024-01-15',
          absence_justifications: [{ attendance_id: 1, justified: false }],
        };

        const result = await service.processEndOfDay(dto);

        expect(mockDayFinalizationService.finalizeDay).toHaveBeenCalled();
        expect(result.could_not_reschedule).toHaveLength(1);
        expect(result.could_not_reschedule[0].reason).toBe('Internal error while processing absence');
      });

      it('should finalize day and push to could_not_reschedule when setPatientStatus throws at threshold', async () => {
        mockAttendanceService.update.mockResolvedValue(mockAttendance);
        mockPatientService.findOne.mockResolvedValue({
          ...mockPatient,
          missing_appointments_streak: 3,
        });
        mockPatientService.setPatientStatus.mockRejectedValue(new Error('Status update failed'));

        const dto: ProcessEndOfDayRequestDto = {
          date: '2024-01-15',
          absence_justifications: [{ attendance_id: 1, justified: false }],
        };

        const result = await service.processEndOfDay(dto);

        expect(mockDayFinalizationService.finalizeDay).toHaveBeenCalled();
        expect(result.status_changed_to_f).toHaveLength(0);
        expect(result.could_not_reschedule).toHaveLength(1);
        expect(result.could_not_reschedule[0].reason).toBe('Internal error while processing absence');
      });

      it('should finalize day and push to could_not_reschedule when reschedule throws unexpectedly', async () => {
        mockAttendanceService.update.mockResolvedValue(mockAttendance);
        mockAttendanceService.getNextAvailableDateForAttendance.mockResolvedValue('2024-01-22');
        mockAttendanceService.reschedule.mockRejectedValue(new Error('Slot unavailable'));

        const dto: ProcessEndOfDayRequestDto = {
          date: '2024-01-15',
          absence_justifications: [{ attendance_id: 1, justified: false }],
        };

        const result = await service.processEndOfDay(dto);

        expect(mockDayFinalizationService.finalizeDay).toHaveBeenCalled();
        expect(result.rescheduled).toHaveLength(0);
        expect(result.could_not_reschedule).toHaveLength(1);
        expect(result.could_not_reschedule[0].reason).toBe('Internal error while processing absence');
      });

      it('should process remaining attendances after one fails', async () => {
        const attendance1 = { ...mockAttendance, id: 1, patient_id: 1 };
        const attendance2 = { ...mockAttendance, id: 2, patient_id: 2 };

        mockAttendanceService.update
          .mockResolvedValueOnce(attendance1)
          .mockResolvedValueOnce(attendance2);
        mockPatientService.findOne
          .mockRejectedValueOnce(new Error('Patient 1 not found'))
          .mockResolvedValueOnce({ ...mockPatient, id: 2, missing_appointments_streak: 1 });
        mockAttendanceService.getNextAvailableDateForAttendance.mockResolvedValue(null);

        const dto: ProcessEndOfDayRequestDto = {
          date: '2024-01-15',
          absence_justifications: [
            { attendance_id: 1, justified: false },
            { attendance_id: 2, justified: false },
          ],
        };

        const result = await service.processEndOfDay(dto);

        expect(mockDayFinalizationService.finalizeDay).toHaveBeenCalled();
        expect(result.could_not_reschedule).toHaveLength(2);
        expect(result.could_not_reschedule[0].reason).toBe('Internal error while processing absence');
        expect(result.could_not_reschedule[1].reason).toBe('Could not find an available date within 52 weeks');
      });
    });

    it('should use configurable threshold from SystemSettingsService for F transition', async () => {
      mockSystemSettingsService.getMissingAppointmentsThreshold.mockResolvedValue(5);
      mockPatientService.findOne.mockResolvedValue({
        ...mockPatient,
        missing_appointments_streak: 5,
      });
      mockAttendanceService.update.mockResolvedValue({
        ...mockAttendance,
        id: 1,
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2024-01-15',
      });
      mockPatientService.setPatientStatus.mockResolvedValueOnce({
        patient: { ...mockPatient, patient_status: PatientStatus.ABSENT },
        cancelledAttendances: [],
      });

      const dto: ProcessEndOfDayRequestDto = {
        date: '2024-01-15',
        absence_justifications: [{ attendance_id: 1, justified: false, notes: '' }],
      };

      await service.processEndOfDay(dto);

      expect(mockSystemSettingsService.getMissingAppointmentsThreshold).toHaveBeenCalled();
      expect(mockPatientService.setPatientStatus).toHaveBeenCalledWith(
        1,
        PatientStatus.ABSENT,
        { cancellationReason: '5 consecutive unjustified absences' },
      );
    });
  });
});
