import {
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  Post,
  Get,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { MedicalService } from './medical.service';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import {
  documentFileFilter,
  MAX_DOCUMENT_SIZE_BYTES,
  STORAGE_PROVIDER,
} from '../storage/storage.constants';
import type { StorageProvider } from '../storage/interfaces/storage-provider.interface';

@ApiTags('Medical Records')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('pets/:petId/medical-records')
export class MedicalController {
  constructor(
    private readonly medicalService: MedicalService,

    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  @ApiOperation({ summary: 'Add a medical record to a pet' })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 201, description: 'Medical record created.' })
  @ApiResponse({
    status: 404,
    description:
      'Pet not found, or the caller has no access to it (not the owner and not an authorized caretaker).',
  })
  @Post()
  create(
    @CurrentUser() user: JwtPayload,

    @Param('petId', ParseMongoIdPipe)
    petId: string,

    @Body()
    dto: CreateMedicalRecordDto,
  ) {
    return this.medicalService.create(user.sub, petId, dto);
  }

  @ApiOperation({ summary: "List a pet's medical records" })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Array of medical records.' })
  @ApiResponse({
    status: 404,
    description:
      'Pet not found, or the caller has no access to it (not the owner and not an authorized caretaker).',
  })
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,

    @Param('petId', ParseMongoIdPipe)
    petId: string,
  ) {
    return this.medicalService.findAll(user.sub, petId);
  }

  @ApiOperation({
    summary: 'Attach a document to a medical record',
    description:
      'JPEG/PNG/WebP or PDF, up to 10MB — a certificate, lab result, or vet letter scanned/photographed ' +
      'for this specific record.',
  })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiParam({ name: 'recordId', description: 'Medical record ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'The updated medical record.' })
  @ApiResponse({
    status: 404,
    description:
      'Pet not found, the caller has no access to it, or the record does not exist.',
  })
  @Post(':recordId/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES },
      fileFilter: documentFileFilter,
    }),
  )
  async addDocument(
    @CurrentUser() user: JwtPayload,

    @Param('petId', ParseMongoIdPipe)
    petId: string,

    @Param('recordId', ParseMongoIdPipe)
    recordId: string,

    @UploadedFile()
    file: Express.Multer.File,
  ) {
    const key = await this.storageProvider.upload({
      buffer: file.buffer,
      folder: 'medical-documents',
      originalName: file.originalname,
      mimetype: file.mimetype,
    });

    return this.medicalService.addDocument(user.sub, petId, recordId, {
      url: this.storageProvider.getUrl(key),
      fileName: file.originalname,
      mimeType: file.mimetype,
    });
  }

  @ApiOperation({ summary: 'Remove a document from a medical record' })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiParam({ name: 'recordId', description: 'Medical record ID' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'The updated medical record.' })
  @ApiResponse({
    status: 404,
    description:
      'Pet not found, the caller has no access to it, or the record/document does not exist.',
  })
  @Delete(':recordId/documents/:documentId')
  removeDocument(
    @CurrentUser() user: JwtPayload,

    @Param('petId', ParseMongoIdPipe)
    petId: string,

    @Param('recordId', ParseMongoIdPipe)
    recordId: string,

    @Param('documentId', ParseMongoIdPipe)
    documentId: string,
  ) {
    return this.medicalService.removeDocument(
      user.sub,
      petId,
      recordId,
      documentId,
    );
  }
}
