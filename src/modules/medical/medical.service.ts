import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';

import {
  MedicalRecord,
  MedicalRecordDocument,
} from './schemas/medical-record.schema';

import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';

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
export class MedicalService {
  private readonly logger = new Logger(MedicalService.name);

  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly medicalModel: Model<MedicalRecordDocument>,

    private readonly petsService: PetsService,

    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  // `ownerId` here is really "the acting user" — the owner or, since Phase
  // 15, an authorized caretaker (e.g. a vet adding a record after a visit).
  // See PetsService.findAccessiblePet() for the exact access model.
  async create(ownerId: string, petId: string, dto: CreateMedicalRecordDto) {
    await this.petsService.findAccessiblePet(ownerId, petId);

    // Explicit cast, not left to Mongoose's document-construction casting —
    // found while building Phase 16's e2e coverage: passing a raw petId
    // string here (the pre-existing behavior) silently stored `pet` as a
    // BSON string rather than an ObjectId, verified directly against the
    // raw collection. Every ObjectId-filtered query elsewhere still matched
    // by coincidence (Mongoose reliably casts query filters), but
    // deleteAllForPets()'s `{ pet: { $in: [ObjectId, ...] } }` cascade
    // never did — meaning every medical record has silently survived
    // admin-initiated pet/user deletion since this method was written. See
    // PAWTATO_ROADMAP.md's Phase 16 section for the full story.
    return this.medicalModel.create({
      pet: new Types.ObjectId(petId),
      ...dto,
    });
  }

  async findAll(ownerId: string, petId: string) {
    await this.petsService.findAccessiblePet(ownerId, petId);

    return this.medicalModel
      .find({
        pet: new Types.ObjectId(petId),
      })
      .sort({
        visitDate: -1,
        createdAt: -1,
      });
  }

  // The controller performs the actual upload (same convention as
  // PetsController.uploadPhoto — the storage write happens at the API
  // boundary, this method only ever persists the resulting URL) and passes
  // the result in here, once authorization + the record's existence have
  // been confirmed.
  async addDocument(
    ownerId: string,
    petId: string,
    recordId: string,
    input: AddDocumentInput,
  ) {
    await this.petsService.findAccessiblePet(ownerId, petId);

    const record = await this.medicalModel.findOneAndUpdate(
      { _id: recordId, pet: new Types.ObjectId(petId) },
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

    if (!record) {
      throw new NotFoundException('Medical record not found for this pet');
    }

    return record;
  }

  async removeDocument(
    ownerId: string,
    petId: string,
    recordId: string,
    documentId: string,
  ) {
    await this.petsService.findAccessiblePet(ownerId, petId);

    const record = await this.medicalModel.findOne({
      _id: recordId,
      pet: new Types.ObjectId(petId),
    });

    if (!record) {
      throw new NotFoundException('Medical record not found for this pet');
    }

    const document = record.documents.find(
      (d) => d._id?.toString() === documentId,
    );

    if (!document) {
      throw new NotFoundException('Document not found on this record');
    }

    record.documents = record.documents.filter(
      (d) => d._id?.toString() !== documentId,
    );
    await record.save();

    // The DB reference is already gone at this point — same ordering
    // rationale as PetsService.deleteOldPhoto: a failed file cleanup
    // shouldn't leave the record stuck with an undeletable document
    // reference, it should just leave a harmless orphaned file behind.
    try {
      await this.storageProvider.deleteByUrl(document.url);
    } catch (error) {
      this.logger.error(
        `Failed to delete medical document file: ${document.url}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return record;
  }

  // No ownership check — used by DatingService to build a dating profile's
  // medicalSummary, which is only ever read when the pet's own owner has
  // already opted into `shareHealthSummary`. Authorization lives at that
  // call site, not here (mirrors PetsService.findByIdAdmin's "Admin"-style
  // unrestricted read, just not admin-only in this case).
  async findAllByPet(petId: string) {
    return this.medicalModel.find({ pet: new Types.ObjectId(petId) });
  }

  async count(): Promise<number> {
    return this.medicalModel.countDocuments();
  }

  // Cascade delete — since Phase 16, a medical record can carry uploaded
  // document files, so this now cleans those up too (previously a no-op
  // beyond the documents themselves) before deleting the records. Called
  // from AdminService when a pet (or its owner) is deleted.
  async deleteAllForPets(petIds: string[]) {
    if (petIds.length === 0) {
      return { deletedCount: 0 };
    }

    const objectIds = petIds.map((id) => new Types.ObjectId(id));

    const records = await this.medicalModel
      .find({ pet: { $in: objectIds } })
      .select('documents');

    for (const record of records) {
      for (const document of record.documents) {
        try {
          await this.storageProvider.deleteByUrl(document.url);
        } catch (error) {
          this.logger.error(
            `Failed to delete medical document file: ${document.url}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    }

    const result = await this.medicalModel.deleteMany({
      pet: { $in: objectIds },
    });

    return { deletedCount: result.deletedCount };
  }

  // Closes a real gap this phase would otherwise have reopened: owner
  // self-service pet deletion (PetsService.remove()) never cascades to
  // medical/vaccination/scans/etc. directly (see PAWTATO_ROADMAP.md's Phase
  // 8 "Known remaining gap" note — fixing that fully is a separate,
  // larger, circular-import-risk refactor, out of scope here). Before this
  // phase, that gap only orphaned empty documents; now that records can
  // carry real uploaded files, leaving it unfixed here specifically would
  // leak files on disk with no way to reach them again. Fixed the same way
  // DatingService/CaretakersService already close this exact gap for their
  // own pet-keyed collections — a listener on the existing PET_DELETED
  // event, not a new self-service cascade path.
  @OnEvent(DOMAIN_EVENTS.PET_DELETED)
  async handlePetDeleted(payload: { petId: string; ownerId: string }) {
    await this.deleteAllForPets([payload.petId]);
  }
}
