import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';

import {
  Vaccination,
  VaccinationDocument,
} from '../../vaccinations/schemas/vaccination.schema';
import { Pet } from '../../pets/schemas/pet.schema';
import { User } from '../../users/schemas/user.schema';
import { DOMAIN_EVENTS } from '../../../common/events/domain-events';

interface PopulatedVaccination extends Omit<VaccinationDocument, 'pet'> {
  pet: Pet & { owner: User & { _id: Types.ObjectId } };
}

@Injectable()
export class VaccinationReminderJob {
  private readonly logger = new Logger(VaccinationReminderJob.name);

  constructor(
    @InjectModel(Vaccination.name)
    private readonly vaccinationModel: Model<VaccinationDocument>,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron('0 9 * * *')
  async handleCron() {
    this.logger.log('Checking upcoming vaccinations...');

    const today = new Date();

    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const vaccinations = (await this.vaccinationModel
      .find({
        reminderSent: false,
        nextDueDate: {
          $gte: today,
          $lte: nextWeek,
        },
      })
      .populate({
        path: 'pet',
        populate: { path: 'owner' },
      })) as unknown as PopulatedVaccination[];

    this.logger.log(`Found ${vaccinations.length} upcoming vaccinations.`);

    for (const vaccination of vaccinations) {
      const ownerEmail = vaccination.pet?.owner?.email;

      if (!ownerEmail) {
        this.logger.warn(
          `Skipping reminder for vaccination ${String(vaccination._id)}: no owner email found.`,
        );
        continue;
      }

      this.eventEmitter.emit(DOMAIN_EVENTS.VACCINATION_REMINDER_DUE, {
        ownerId: String(vaccination.pet.owner._id),
        ownerEmail,
        petName: vaccination.pet.name,
        vaccineName: vaccination.vaccineName,
        nextDueDate: vaccination.nextDueDate,
      });

      vaccination.reminderSent = true;
      vaccination.lastReminderSentAt = new Date();

      await vaccination.save();

      this.logger.log(`Reminder sent for vaccine: ${vaccination.vaccineName}`);
    }
  }
}
