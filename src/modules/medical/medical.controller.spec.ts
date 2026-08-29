import { Test, TestingModule } from '@nestjs/testing';
import { MedicalController } from './medical.controller';
import { MedicalService } from './medical.service';
import { STORAGE_PROVIDER } from '../storage/storage.constants';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('MedicalController', () => {
  let controller: MedicalController;
  let medicalService: {
    create: jest.Mock;
    findAll: jest.Mock;
    addDocument: jest.Mock;
    removeDocument: jest.Mock;
  };
  let storageProvider: { upload: jest.Mock; getUrl: jest.Mock };

  const user = { sub: 'user-1' } as JwtPayload;

  beforeEach(async () => {
    medicalService = {
      create: jest.fn().mockResolvedValue({ _id: 'record-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      addDocument: jest.fn().mockResolvedValue({ _id: 'record-1' }),
      removeDocument: jest.fn().mockResolvedValue({ _id: 'record-1' }),
    };
    storageProvider = {
      upload: jest.fn().mockResolvedValue('medical-documents/file.pdf'),
      getUrl: jest.fn().mockReturnValue('/uploads/medical-documents/file.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MedicalController],
      providers: [
        { provide: MedicalService, useValue: medicalService },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    }).compile();

    controller = module.get<MedicalController>(MedicalController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to the service', async () => {
    await controller.create(user, 'pet-1', { title: 'Checkup' });

    expect(medicalService.create).toHaveBeenCalledWith('user-1', 'pet-1', {
      title: 'Checkup',
    });
  });

  it('findAll delegates to the service', async () => {
    await controller.findAll(user, 'pet-1');

    expect(medicalService.findAll).toHaveBeenCalledWith('user-1', 'pet-1');
  });

  it('addDocument uploads the file then persists the resulting URL', async () => {
    const file = {
      buffer: Buffer.from('pdf-bytes'),
      originalname: 'certificate.pdf',
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    await controller.addDocument(user, 'pet-1', 'record-1', file);

    expect(storageProvider.upload).toHaveBeenCalledWith({
      buffer: file.buffer,
      folder: 'medical-documents',
      originalName: 'certificate.pdf',
      mimetype: 'application/pdf',
    });
    expect(medicalService.addDocument).toHaveBeenCalledWith(
      'user-1',
      'pet-1',
      'record-1',
      {
        url: '/uploads/medical-documents/file.pdf',
        fileName: 'certificate.pdf',
        mimeType: 'application/pdf',
      },
    );
  });

  it('removeDocument delegates to the service', async () => {
    await controller.removeDocument(user, 'pet-1', 'record-1', 'doc-1');

    expect(medicalService.removeDocument).toHaveBeenCalledWith(
      'user-1',
      'pet-1',
      'record-1',
      'doc-1',
    );
  });
});
