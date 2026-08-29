import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
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

import { VaccinationsService } from './vaccinations.service';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import {
  documentFileFilter,
  MAX_DOCUMENT_SIZE_BYTES,
  STORAGE_PROVIDER,
} from '../storage/storage.constants';
import type { StorageProvider } from '../storage/interfaces/storage-provider.interface';

@ApiTags('Vaccinations')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('pets/:petId/vaccinations')
export class VaccinationsController {
  constructor(
    private readonly vaccinationsService: VaccinationsService,

    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  @ApiOperation({ summary: 'Add a vaccination record to a pet' })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 201, description: 'Vaccination record created.' })
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
    dto: CreateVaccinationDto,
  ) {
    return this.vaccinationsService.create(user.sub, petId, dto);
  }

  @ApiOperation({ summary: "List a pet's vaccination records" })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiResponse({ status: 200, description: 'Array of vaccination records.' })
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
    return this.vaccinationsService.findAll(user.sub, petId);
  }

  @ApiOperation({
    summary: 'Attach a document to a vaccination record',
    description:
      'JPEG/PNG/WebP or PDF, up to 10MB — e.g. the physical certificate, scanned or photographed.',
  })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiParam({ name: 'vaccinationId', description: 'Vaccination record ID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'The updated vaccination record.' })
  @ApiResponse({
    status: 404,
    description:
      'Pet not found, the caller has no access to it, or the record does not exist.',
  })
  @Post(':vaccinationId/documents')
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

    @Param('vaccinationId', ParseMongoIdPipe)
    vaccinationId: string,

    @UploadedFile()
    file: Express.Multer.File,
  ) {
    const key = await this.storageProvider.upload({
      buffer: file.buffer,
      folder: 'vaccination-documents',
      originalName: file.originalname,
      mimetype: file.mimetype,
    });

    return this.vaccinationsService.addDocument(
      user.sub,
      petId,
      vaccinationId,
      {
        url: this.storageProvider.getUrl(key),
        fileName: file.originalname,
        mimeType: file.mimetype,
      },
    );
  }

  @ApiOperation({ summary: 'Remove a document from a vaccination record' })
  @ApiParam({ name: 'petId', description: 'Pet ID' })
  @ApiParam({ name: 'vaccinationId', description: 'Vaccination record ID' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'The updated vaccination record.' })
  @ApiResponse({
    status: 404,
    description:
      'Pet not found, the caller has no access to it, or the record/document does not exist.',
  })
  @Delete(':vaccinationId/documents/:documentId')
  removeDocument(
    @CurrentUser() user: JwtPayload,

    @Param('petId', ParseMongoIdPipe)
    petId: string,

    @Param('vaccinationId', ParseMongoIdPipe)
    vaccinationId: string,

    @Param('documentId', ParseMongoIdPipe)
    documentId: string,
  ) {
    return this.vaccinationsService.removeDocument(
      user.sub,
      petId,
      vaccinationId,
      documentId,
    );
  }
}
