import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { DatingController } from './dating.controller';
import { PetDatingProfileController } from './pet-dating-profile.controller';
import { IdentityVerificationController } from './identity-verification.controller';
import { DatingChatNotificationController } from './dating-chat-notification.controller';
import { DatingService } from './dating.service';
import { IdentityVerificationService } from './identity-verification.service';
import { DatingChatNotificationService } from './dating-chat-notification.service';
import { DatingGateway } from './dating.gateway';
import { DatingChatNotificationListener } from './dating-chat-notification.listener';

import {
  PetDatingProfile,
  PetDatingProfileSchema,
} from './schemas/pet-dating-profile.schema';
import { Swipe, SwipeSchema } from './schemas/swipe.schema';
import { Match, MatchSchema } from './schemas/match.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import {
  DatingReport,
  DatingReportSchema,
} from './schemas/dating-report.schema';
import {
  IdentityVerification,
  IdentityVerificationSchema,
} from './schemas/identity-verification.schema';
import {
  DatingChatNotification,
  DatingChatNotificationSchema,
} from './schemas/dating-chat-notification.schema';
import { Pet, PetSchema } from '../pets/schemas/pet.schema';

import { PetsModule } from '../pets/pets.module';
import { MedicalModule } from '../medical/medical.module';
import { VaccinationsModule } from '../vaccinations/vaccinations.module';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PetDatingProfile.name, schema: PetDatingProfileSchema },
      { name: Swipe.name, schema: SwipeSchema },
      { name: Match.name, schema: MatchSchema },
      { name: Message.name, schema: MessageSchema },
      { name: DatingReport.name, schema: DatingReportSchema },
      { name: IdentityVerification.name, schema: IdentityVerificationSchema },
      {
        name: DatingChatNotification.name,
        schema: DatingChatNotificationSchema,
      },
      { name: Pet.name, schema: PetSchema },
    ]),

    PetsModule,
    MedicalModule,
    VaccinationsModule,
    ActivityModule,
    AuthModule,
  ],

  controllers: [
    DatingController,
    PetDatingProfileController,
    IdentityVerificationController,
    DatingChatNotificationController,
  ],

  providers: [
    DatingService,
    IdentityVerificationService,
    DatingChatNotificationService,
    DatingGateway,
    DatingChatNotificationListener,
  ],

  exports: [DatingService, IdentityVerificationService],
})
export class DatingModule {}
