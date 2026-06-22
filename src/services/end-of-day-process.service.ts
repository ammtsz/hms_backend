import {
  Injectable,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DayFinalizationService } from './day-finalization.service';
import { AttendanceService } from './attendance.service';
import { PatientService } from './patient.service';
import { TreatmentService } from './treatment.service';
import { SessionService } from './session.service';
import { Attendance } from '../entities/attendance.entity';
import { AttendanceStatus, AttendanceType, PatientStatus } from '../common/enums';
import {
  addDaysToDateString,
  compareDateStrings,
} from '../utils/date-string-helpers';
import { SystemSettingsService } from './system-settings.service';

import type {
  ProcessEndOfDayRequestDto,
  ProcessEndOfDayResponseDto,
} from '../dtos/process-end-of-day.dto';

@Injectable()
export class EndOfDayProcessService {
  private readonly logger = new Logger(EndOfDayProcessService.name);

  constructor(
    private readonly dayFinalizationService: DayFinalizationService,
    private readonly sessionService: SessionService,
    private readonly systemSettingsService: SystemSettingsService,
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendanceService: AttendanceService,
    @Inject(forwardRef(() => PatientService))
    private readonly patientService: PatientService,
    @Inject(forwardRef(() => TreatmentService))
    private readonly treatmentService: TreatmentService,
  ) {}

  async processEndOfDay(
    dto: ProcessEndOfDayRequestDto,
  ): Promise<ProcessEndOfDayResponseDto> {
    const { date, absence_justifications } = dto;

    // 1. Idempotency check
    const isFinalized = await this.dayFinalizationService.isDayFinalized(date);
    if (isFinalized) {
      throw new ConflictException('Day already finalized.');
    }

    const summary: ProcessEndOfDayResponseDto = {
      rescheduled: [],
      status_changed_to_f: [],
      cancelled_for_f: [],
      could_not_reschedule: [],
    };

    if (absence_justifications.length === 0) {
      await this.dayFinalizationService.finalizeDay(
        date,
        'Day finalized without absences',
      );
      return summary;
    }

    // 2. Mark each absence as MISSED
    const missedAttendancesMap = new Map<number, Attendance>();
    for (const item of absence_justifications) {
      try {
        const attendance = await this.attendanceService.update(item.attendance_id, {
          status: AttendanceStatus.MISSED,
          absence_justified: item.justified,
          absence_notes: item.notes ?? null,
        });
        missedAttendancesMap.set(attendance.id, attendance);
      } catch (err) {
        this.logger.error(
          `Failed to mark attendance ${item.attendance_id} as MISSED: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 3. Build list of missed attendances
    const missed: Array<{ attendance: Attendance }> = [];
    for (const item of absence_justifications) {
      const attendance = missedAttendancesMap.get(item.attendance_id);
      if (!attendance) continue;

      missed.push({ attendance });
    }

    // Track patients already processed for F to avoid duplicates
    const patientsProcessedForF = new Set<number>();

    // Accumulate furthest return date per assessment attendance (so we reschedule each return only once)
    const assessmentReturnRescheduleMap = new Map<number, string>();

    const threshold =
      await this.systemSettingsService.getMissingAppointmentsThreshold();

    const rescheduledAttendanceIds = new Set<number>();

    // 4. Process each unjustified missed
    for (const { attendance } of missed) {
      if (rescheduledAttendanceIds.has(attendance.id)) {
        continue;
      }
      try {
        const patient = await this.patientService.findOne(attendance.patient_id);
        const streak = patient.missing_appointments_streak;
        const patientName = attendance.patient?.name ?? patient.name ?? 'Patient';

        if (streak === threshold) {
          // Rule 2: Set patient to F and cancel all future (dedupe by patient)
          if (!patientsProcessedForF.has(attendance.patient_id)) {
            patientsProcessedForF.add(attendance.patient_id);
            try {
              const result = await this.patientService.setPatientStatus(
                attendance.patient_id,
                PatientStatus.ABSENT,
                { cancellationReason: `${threshold} consecutive unjustified absences` },
              );
              const cancelledAttendances = result.cancelledAttendances ?? [];

              summary.status_changed_to_f.push({
                patient_id: attendance.patient_id,
                patient_name: patientName,
              });
              summary.cancelled_for_f.push({
                patient_id: attendance.patient_id,
                patient_name: patientName,
                attendances: cancelledAttendances,
              });
            } catch (err) {
              // Undo reservation so a retry (another attendance for same patient) can attempt again
              patientsProcessedForF.delete(attendance.patient_id);
              throw err;
            }
          }
        } else {
          // Non-T patients (N, A, F) may reschedule only their first assessment attendance
          // (parent_attendance_id null = root consultation, i.e. starting a new treatment episode).
          const isNonTreatmentPatient = patient.patient_status !== PatientStatus.IN_TREATMENT;
          const isFirstAssessmentForNonTreatment =
            isNonTreatmentPatient &&
            attendance.type === AttendanceType.ASSESSMENT &&
            attendance.parent_attendance_id == null;

          if (isNonTreatmentPatient && !isFirstAssessmentForNonTreatment) {
            summary.could_not_reschedule.push({
              attendance_id: attendance.id,
              patient_id: attendance.patient_id,
              patient_name: patientName,
              type: attendance.type,
                reason: "Patient doesn't have an active treatment",
            });
            continue;
          }

          // Rule 1: Reschedule — each treatment attendance is processed individually so that
          // different treatment plans for the same patient/type/day each get their own
          // next-available date (which depends on that treatment's last session date).
          const isTreatment =
            attendance.type === AttendanceType.PHYSIOTHERAPY ||
            attendance.type === AttendanceType.TENS;

          const nextDate =
            await this.attendanceService.getNextAvailableDateForAttendance(
              attendance.id,
            );

          if (nextDate && nextDate !== attendance.scheduled_date) {
            await this.attendanceService.reschedule(
              {
                attendance_ids: [attendance.id],
                new_scheduled_date: nextDate,
              },
              isFirstAssessmentForNonTreatment
                ? { allowFirstAssessmentForNonTreatment: true }
                : undefined,
            );

            rescheduledAttendanceIds.add(attendance.id);
            summary.rescheduled.push({
              attendance_id: attendance.id,
              patient_id: attendance.patient_id,
              patient_name: patientName,
              type: attendance.type,
              old_date: attendance.scheduled_date,
              new_date: nextDate,
            });

            if (isTreatment) {
              await this.collectReturnAssessmentReschedulesForGroup(
                [attendance],
                nextDate,
                assessmentReturnRescheduleMap,
              );
            }
          } else {
            summary.could_not_reschedule.push({
              attendance_id: attendance.id,
              patient_id: attendance.patient_id,
              patient_name: patientName,
              type: attendance.type,
              reason:
                'Could not find an available date within 52 weeks',
            });
          }
        }
      } catch (err) {
        this.logger.error(
          `Error processing absence for attendance ${attendance.id} (patient ${attendance.patient_id}): ${err instanceof Error ? err.message : String(err)}`,
        );
        summary.could_not_reschedule.push({
          attendance_id: attendance.id,
          patient_id: attendance.patient_id,
          patient_name: attendance.patient?.name ?? 'Patient',
          type: attendance.type,
          reason: 'Internal error while processing absence',
        });
      }
    }

    // 4b. Apply assessment return reschedules once per attendance (using furthest date)
    for (const [assessmentAttId, newDate] of assessmentReturnRescheduleMap) {
      try {
        const assessmentAtt = await this.attendanceService.findOne(assessmentAttId);
        if (assessmentAtt.scheduled_date === newDate) {
          continue;
        }
        await this.attendanceService.postpone(assessmentAttId, newDate);
        summary.rescheduled.push({
          attendance_id: assessmentAttId,
          patient_id: assessmentAtt.patient_id,
          patient_name: assessmentAtt.patient?.name ?? 'Patient',
          type: AttendanceType.ASSESSMENT,
          old_date: assessmentAtt.scheduled_date,
          new_date: newDate,
        });
      } catch (err) {
        this.logger.warn(
          `Could not reschedule return assessment attendance ${assessmentAttId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 5. Finalize the day
    await this.dayFinalizationService.finalizeDay(
      date,
      `Finalized with ${absence_justifications.length} processed absence(s)`,
    );

    return summary;
  }

  /**
   * For each distinct treatment in a same-day missed group, queue return assessment moves.
   */
  private async collectReturnAssessmentReschedulesForGroup(
    group: Attendance[],
    nextDate: string,
    assessmentReturnRescheduleMap: Map<number, string>,
  ): Promise<void> {
    const processedTreatmentIds = new Set<number>();

    for (const missedAttendance of group) {
      const treatmentId =
        await this.attendanceService.getTreatmentIdForAttendanceId(
          missedAttendance.id,
        );
      if (!treatmentId || processedTreatmentIds.has(treatmentId)) {
        continue;
      }
      processedTreatmentIds.add(treatmentId);

      let oldLastTreatmentDate =
        await this.sessionService.getMaxScheduledDateForTreatment(treatmentId);
      if (
        missedAttendance.scheduled_date &&
        (!oldLastTreatmentDate ||
          missedAttendance.scheduled_date > oldLastTreatmentDate)
      ) {
        oldLastTreatmentDate = missedAttendance.scheduled_date;
      }
      if (!oldLastTreatmentDate) {
        continue;
      }

      const returnAssessmentAttendances =
        await this.findReturnAssessmentAttendancesForTreatment(
          treatmentId,
          oldLastTreatmentDate,
        );
      const sessionInfo =
        await this.treatmentService.getSessionWithReturnConfig(treatmentId);
      const returnWhenComplete =
        sessionInfo?.return_when_treatment_complete ?? false;
      const returnWeeks = sessionInfo?.return_weeks ?? 0;
      const shouldRescheduleReturns =
        returnAssessmentAttendances.length > 0 &&
        (returnWhenComplete || returnWeeks > 0);

      if (!shouldRescheduleReturns) {
        continue;
      }

      const returnDate = returnWhenComplete
        ? addDaysToDateString(nextDate, returnWeeks * 7)
        : addDaysToDateString(nextDate, 7);
      const adjustedReturnDate =
        await this.attendanceService.findNextSchedulableDate(
          returnDate,
          'assessment',
        );

      for (const assessmentAtt of returnAssessmentAttendances) {
        if (assessmentAtt.scheduled_date === adjustedReturnDate) {
          continue;
        }
        const currentBest = assessmentReturnRescheduleMap.get(assessmentAtt.id);
        if (
          !currentBest ||
          compareDateStrings(adjustedReturnDate, currentBest) > 0
        ) {
          assessmentReturnRescheduleMap.set(
            assessmentAtt.id,
            adjustedReturnDate,
          );
        }
      }
    }
  }

  /**
   * Find assessment attendances that are return consultations in the same episode,
   * with scheduled_date >= minScheduledDate and status SCHEDULED.
   * Uses the old last treatment date (minScheduledDate) so returns anchored to the previous
   * last treatment (e.g. return_weeks=0) are included after the treatment is rescheduled.
   * Episode chain: session.attendance_id (root) + all attendances with parent_attendance_id in chain.
   */
  private async findReturnAssessmentAttendancesForTreatment(
    treatmentId: number,
    minScheduledDate: string,
  ): Promise<Attendance[]> {
    const sessionInfo =
      await this.treatmentService.getSessionWithReturnConfig(
        treatmentId,
      );
    if (!sessionInfo) return [];

    const patientAttendances = await this.attendanceService.findByPatientId(
      sessionInfo.patient_id,
    );
    const rootId = sessionInfo.attendance_id;

    const chainIds = new Set<number>([rootId]);
    let added = true;
    while (added) {
      added = false;
      for (const att of patientAttendances) {
        const parentId = (att as unknown as { parent_attendance_id?: number })
          .parent_attendance_id;
        if (parentId != null && chainIds.has(parentId) && !chainIds.has(att.id)) {
          chainIds.add(att.id);
          added = true;
        }
      }
    }

    // Get all assessment attendances that are return consultations in the same episode,
    // with scheduled_date >= lastTreatmentDate and status SCHEDULED.
    const assessment: Attendance[] = [];
    for (const att of patientAttendances) {
      const a = att as unknown as Attendance & { parent_attendance_id?: number };
      if (
        a.type === AttendanceType.ASSESSMENT &&
        a.status === AttendanceStatus.SCHEDULED &&
        a.parent_attendance_id != null &&
        chainIds.has(a.parent_attendance_id) &&
        a.scheduled_date >= minScheduledDate
      ) {
        const full = await this.attendanceService.findOne(a.id);
        assessment.push(full);
      }
    }
    return assessment;
  }
}
