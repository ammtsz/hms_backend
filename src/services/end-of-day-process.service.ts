import {
  Injectable,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DayFinalizationService } from './day-finalization.service';
import { AppointmentService } from './appointment.service';
import { PatientService } from './patient.service';
import { TreatmentService } from './treatment.service';
import { SessionService } from './session.service';
import { Appointment } from '../entities/appointment.entity';
import {
  AppointmentStatus,
  AppointmentType,
  PatientStatus,
} from '../common/enums';
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
    @Inject(forwardRef(() => AppointmentService))
    private readonly appointmentService: AppointmentService,
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
      status_changed_to_c: [],
      cancelled_for_c: [],
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
    const missedAppointmentsMap = new Map<number, Appointment>();
    for (const item of absence_justifications) {
      try {
        const appointment = await this.appointmentService.update(
          item.appointment_id,
          {
            status: AppointmentStatus.MISSED,
            absence_justified: item.justified,
            absence_notes: item.notes ?? null,
          },
        );
        missedAppointmentsMap.set(appointment.id, appointment);
      } catch (err) {
        this.logger.error(
          `Failed to mark appointment ${item.appointment_id} as MISSED: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // 3. Build list of missed appointments
    const missed: Array<{ appointment: Appointment }> = [];
    for (const item of absence_justifications) {
      const appointment = missedAppointmentsMap.get(item.appointment_id);
      if (!appointment) continue;

      missed.push({ appointment });
    }

    // Track patients already processed for C to avoid duplicates
    const patientsProcessedForC = new Set<number>();

    // Accumulate furthest return date per assessment appointment (so we reschedule each return only once)
    const assessmentReturnRescheduleMap = new Map<number, string>();

    const threshold =
      await this.systemSettingsService.getMissingAppointmentsThreshold();

    const rescheduledAppointmentIds = new Set<number>();

    // 4. Process each unjustified missed
    for (const { appointment } of missed) {
      if (rescheduledAppointmentIds.has(appointment.id)) {
        continue;
      }
      try {
        const patient = await this.patientService.findOne(
          appointment.patient_id,
        );
        const streak = patient.missing_appointments_streak;
        const patientName =
          appointment.patient?.name ?? patient.name ?? 'Patient';

        if (streak === threshold) {
          // Rule 2: Set patient to C and cancel all future (dedupe by patient)
          if (!patientsProcessedForC.has(appointment.patient_id)) {
            patientsProcessedForC.add(appointment.patient_id);
            try {
              const result = await this.patientService.setPatientStatus(
                appointment.patient_id,
                PatientStatus.CONSECUTIVE_NO_SHOWS,
                {
                  cancellationReason: `${threshold} consecutive unjustified absences`,
                },
              );
              const cancelledAppointments = result.cancelledAppointments ?? [];

              summary.status_changed_to_c.push({
                patient_id: appointment.patient_id,
                patient_name: patientName,
              });
              summary.cancelled_for_c.push({
                patient_id: appointment.patient_id,
                patient_name: patientName,
                appointments: cancelledAppointments,
              });
            } catch (err) {
              // Undo reservation so a retry (another appointment for same patient) can attempt again
              patientsProcessedForC.delete(appointment.patient_id);
              throw err;
            }
          }
        } else {
          // Non-T patients (N, D, C) may reschedule only their first assessment appointment
          // (parent_appointment_id null = root consultation, i.e. starting a new treatment episode).
          const isNonTreatmentPatient =
            patient.patient_status !== PatientStatus.IN_TREATMENT;
          const isFirstAssessmentForNonTreatment =
            isNonTreatmentPatient &&
            appointment.type === AppointmentType.ASSESSMENT &&
            appointment.parent_appointment_id == null;

          if (isNonTreatmentPatient && !isFirstAssessmentForNonTreatment) {
            summary.could_not_reschedule.push({
              appointment_id: appointment.id,
              patient_id: appointment.patient_id,
              patient_name: patientName,
              type: appointment.type,
              reason: "Patient doesn't have an active treatment",
            });
            continue;
          }

          // Rule 1: Reschedule — each treatment appointment is processed individually so that
          // different treatment plans for the same patient/type/day each get their own
          // next-available date (which depends on that treatment's last session date).
          const isTreatment =
            appointment.type === AppointmentType.PHYSIOTHERAPY ||
            appointment.type === AppointmentType.TENS;

          const nextDate =
            await this.appointmentService.getNextAvailableDateForAppointment(
              appointment.id,
            );

          if (nextDate && nextDate !== appointment.scheduled_date) {
            await this.appointmentService.reschedule(
              {
                appointment_ids: [appointment.id],
                new_scheduled_date: nextDate,
              },
              isFirstAssessmentForNonTreatment
                ? { allowFirstAssessmentForNonTreatment: true }
                : undefined,
            );

            rescheduledAppointmentIds.add(appointment.id);
            summary.rescheduled.push({
              appointment_id: appointment.id,
              patient_id: appointment.patient_id,
              patient_name: patientName,
              type: appointment.type,
              old_date: appointment.scheduled_date,
              new_date: nextDate,
            });

            if (isTreatment) {
              await this.collectReturnAssessmentReschedulesForGroup(
                [appointment],
                nextDate,
                assessmentReturnRescheduleMap,
              );
            }
          } else {
            summary.could_not_reschedule.push({
              appointment_id: appointment.id,
              patient_id: appointment.patient_id,
              patient_name: patientName,
              type: appointment.type,
              reason: 'Could not find an available date within 52 weeks',
            });
          }
        }
      } catch (err) {
        this.logger.error(
          `Error processing absence for appointment ${appointment.id} (patient ${appointment.patient_id}): ${err instanceof Error ? err.message : String(err)}`,
        );
        summary.could_not_reschedule.push({
          appointment_id: appointment.id,
          patient_id: appointment.patient_id,
          patient_name: appointment.patient?.name ?? 'Patient',
          type: appointment.type,
          reason: 'Internal error while processing absence',
        });
      }
    }

    // 4b. Apply assessment return reschedules once per appointment (using furthest date)
    for (const [assessmentAttId, newDate] of assessmentReturnRescheduleMap) {
      try {
        const assessmentAtt =
          await this.appointmentService.findOne(assessmentAttId);
        if (assessmentAtt.scheduled_date === newDate) {
          continue;
        }
        await this.appointmentService.postpone(assessmentAttId, newDate);
        summary.rescheduled.push({
          appointment_id: assessmentAttId,
          patient_id: assessmentAtt.patient_id,
          patient_name: assessmentAtt.patient?.name ?? 'Patient',
          type: AppointmentType.ASSESSMENT,
          old_date: assessmentAtt.scheduled_date,
          new_date: newDate,
        });
      } catch (err) {
        this.logger.warn(
          `Could not reschedule return assessment appointment ${assessmentAttId}: ${err instanceof Error ? err.message : String(err)}`,
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
    group: Appointment[],
    nextDate: string,
    assessmentReturnRescheduleMap: Map<number, string>,
  ): Promise<void> {
    const processedTreatmentIds = new Set<number>();

    for (const missedAppointment of group) {
      const treatmentId =
        await this.appointmentService.getTreatmentIdForAppointmentId(
          missedAppointment.id,
        );
      if (!treatmentId || processedTreatmentIds.has(treatmentId)) {
        continue;
      }
      processedTreatmentIds.add(treatmentId);

      let oldLastTreatmentDate =
        await this.sessionService.getMaxScheduledDateForTreatment(treatmentId);
      if (
        missedAppointment.scheduled_date &&
        (!oldLastTreatmentDate ||
          missedAppointment.scheduled_date > oldLastTreatmentDate)
      ) {
        oldLastTreatmentDate = missedAppointment.scheduled_date;
      }
      if (!oldLastTreatmentDate) {
        continue;
      }

      const returnAssessmentAppointments =
        await this.findReturnAssessmentAppointmentsForTreatment(
          treatmentId,
          oldLastTreatmentDate,
        );
      const sessionInfo =
        await this.treatmentService.getSessionWithReturnConfig(treatmentId);
      const returnWhenComplete =
        sessionInfo?.return_when_treatment_complete ?? false;
      const returnWeeks = sessionInfo?.return_weeks ?? 0;
      const shouldRescheduleReturns =
        returnAssessmentAppointments.length > 0 &&
        (returnWhenComplete || returnWeeks > 0);

      if (!shouldRescheduleReturns) {
        continue;
      }

      const returnDate = returnWhenComplete
        ? addDaysToDateString(nextDate, returnWeeks * 7)
        : addDaysToDateString(nextDate, 7);
      const adjustedReturnDate =
        await this.appointmentService.findNextSchedulableDate(
          returnDate,
          'assessment',
        );

      for (const assessmentAtt of returnAssessmentAppointments) {
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
   * Find assessment appointments that are return consultations in the same episode,
   * with scheduled_date >= minScheduledDate and status SCHEDULED.
   * Uses the old last treatment date (minScheduledDate) so returns anchored to the previous
   * last treatment (e.g. return_weeks=0) are included after the treatment is rescheduled.
   * Episode chain: session.appointment_id (root) + all appointments with parent_appointment_id in chain.
   */
  private async findReturnAssessmentAppointmentsForTreatment(
    treatmentId: number,
    minScheduledDate: string,
  ): Promise<Appointment[]> {
    const sessionInfo =
      await this.treatmentService.getSessionWithReturnConfig(treatmentId);
    if (!sessionInfo) return [];

    const patientAppointments = await this.appointmentService.findByPatientId(
      sessionInfo.patient_id,
    );
    const rootId = sessionInfo.appointment_id;

    const chainIds = new Set<number>([rootId]);
    let added = true;
    while (added) {
      added = false;
      for (const att of patientAppointments) {
        const parentId = (att as unknown as { parent_appointment_id?: number })
          .parent_appointment_id;
        if (
          parentId != null &&
          chainIds.has(parentId) &&
          !chainIds.has(att.id)
        ) {
          chainIds.add(att.id);
          added = true;
        }
      }
    }

    // Get all assessment appointments that are return consultations in the same episode,
    // with scheduled_date >= lastTreatmentDate and status SCHEDULED.
    const assessment: Appointment[] = [];
    for (const att of patientAppointments) {
      const a = att as unknown as Appointment & {
        parent_appointment_id?: number;
      };
      if (
        a.type === AppointmentType.ASSESSMENT &&
        a.status === AppointmentStatus.SCHEDULED &&
        a.parent_appointment_id != null &&
        chainIds.has(a.parent_appointment_id) &&
        a.scheduled_date >= minScheduledDate
      ) {
        const full = await this.appointmentService.findOne(a.id);
        assessment.push(full);
      }
    }
    return assessment;
  }
}
