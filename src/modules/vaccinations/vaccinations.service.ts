import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';

import { Vaccination, VaccinationDocument } from './schemas/vaccination.schema';

import { CreateVaccinationDto } from './dto/create-vaccination.dto';

import { PetsService } from '../pets/pets.service';
import { STORAGE_PROVIDER } from '../storage/storage.constants';
import type { StorageProvider } from '../storage/interfaces/storage-provider.interface';
import { DOMAIN_EVENTS } from '../../common/events/domain-events';

interface AddDocumentInput {
  url: string;
  fileName: string;
  mimeType: string;
}

@Injectable()
export class VaccinationsService {
  private readonly logger = new Logger(VaccinationsService.name);

  constructor(
    @InjectModel(Vaccination.name)
    private readonly vaccinationModel: Model<VaccinationDocument>,

    private readonly petsService: PetsService,

    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  // `ownerId` here is really "the acting user" — the owner or, since Phase
  // 15, an authorized caretaker. See PetsService.findAccessiblePet().
  async create(ownerId: string, petId: string, dto: CreateVaccinationDto) {
    await this.petsService.findAccessiblePet(ownerId, petId);

    // Explicit cast — see MedicalService.create()'s comment for the full
    // story (Phase 16 finding): the identical bare-string pattern here
    // stored `pet` as a raw BSON string, silently defeating
    // deleteAllForPets()'s ObjectId-filtered cascade delete.
    return this.vaccinationModel.create({
      pet: new Types.ObjectId(petId),
      ...dto,
    });
  }

  async findAll(ownerId: string, petId: string) {
    await this.petsService.findAccessiblePet(ownerId, petId);

    return this.vaccinationModel
      .find({
        pet: new Types.ObjectId(petId),
      })
      .sort({
        nextDueDate: 1,
      });
  }

  // Phase 16 — attach a certificate/document to a vaccination record. The
  // controller performs the actual upload (same convention as
  // PetsController.uploadPhoto/MedicalService.addDocument) and passes the
  // resulting URL in here.
  async addDocument(
    ownerId: string,
    petId: string,
    vaccinationId: string,
    input: AddDocumentInput,
  ) {
    await this.petsService.findAccessiblePet(ownerId, petId);

    const vaccination = await this.vaccinationModel.findOneAndUpdate(
      { _id: vaccinationId, pet: new Types.ObjectId(petId) },
      {
        $push: {
          documents: {
            url: input.url,
            fileName: input.fileName,
            mimeType: input.mimeType,
            uploadedAt: new Date(),
          },
        },
      },
      { new: true },
    );

    if (!vaccination) {
      throw new NotFoundException('Vaccination record not found for this pet');
    }

    return vaccination;
  }

  async removeDocument(
    ownerId: string,
    petId: string,
    vaccinationId: string,
    documentId: string,
  ) {
    await this.petsService.findAccessiblePet(ownerId, petId);

    const vaccination = await this.vaccinationModel.findOne({
      _id: vaccinationId,
      pet: new Types.ObjectId(petId),
    });

    if (!vaccination) {
      throw new NotFoundException('Vaccination record not found for this pet');
    }

    const document = vaccination.documents.find(
      (d) => d._id?.toString() === documentId,
    );

    if (!document) {
      throw new NotFoundException('Document not found on this record');
    }

    vaccination.documents = vaccination.documents.filter(
      (d) => d._id?.toString() !== documentId,
    );
    await vaccination.save();

    // Same ordering rationale as MedicalService.removeDocument /
    // PetsService.deleteOldPhoto: a failed file cleanup shouldn't leave the
    // record stuck with an undeletable document reference.
    try {
      await this.storageProvider.deleteByUrl(document.url);
    } catch (error) {
      this.logger.error(
        `Failed to delete vaccination document file: ${document.url}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return vaccination;
  }

  // No ownership check — used by DatingService to build a dating profile's
  // medicalSummary, which is only ever read when the pet's own owner has
  // already opted into `shareHealthSummary`. Authorization lives at that
  // call site, not here (mirrors PetsService.findByIdAdmin's "Admin"-style
  // unrestricted read, just not admin-only in this case).
  async findAllByPet(petId: string) {
    return this.vaccinationModel.find({ pet: new Types.ObjectId(petId) });
  }

  async count(): Promise<number> {
    return this.vaccinationModel.countDocuments();
  }

  // Cascade delete — since Phase 16, a vaccination record can carry
  // uploaded document files, so this now cleans those up too before
  // deleting the records. Called from AdminService when a pet (or its
  // owner) is deleted.
  async deleteAllForPets(petIds: string[]) {
    if (petIds.length === 0) {
      return { deletedCount: 0 };
    }

    const objectIds = petIds.map((id) => new Types.ObjectId(id));

    const vaccinations = await this.vaccinationModel
      .find({ pet: { $in: objectIds } })
      .select('documents');

    for (const vaccination of vaccinations) {
      for (const document of vaccination.documents) {
        try {
          await this.storageProvider.deleteByUrl(document.url);
        } catch (error) {
          this.logger.error(
            `Failed to delete vaccination document file: ${document.url}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    }

    const result = await this.vaccinationModel.deleteMany({
      pet: { $in: objectIds },
    });

    return { deletedCount: result.deletedCount };
  }

  // Same reasoning as MedicalService.handlePetDeleted — closes the
  // self-service pet-deletion gap specifically for this phase's new
  // file-carrying documents, without taking on the larger, out-of-scope
  // refactor of wiring every pet-keyed module into self-service delete.
  @OnEvent(DOMAIN_EVENTS.PET_DELETED)
  async handlePetDeleted(payload: { petId: string; ownerId: string }) {
    await this.deleteAllForPets([payload.petId]);
  }
}
