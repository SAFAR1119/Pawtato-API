import { Test, TestingModule } from '@nestjs/testing';
import { VaccinationsController } from './vaccinations.controller';
import { VaccinationsService } from './vaccinations.service';
import { STORAGE_PROVIDER } from '../storage/storage.constants';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('VaccinationsController', () => {
  let controller: VaccinationsController;
  let vaccinationsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    addDocument: jest.Mock;
    removeDocument: jest.Mock;
  };
  let storageProvider: { upload: jest.Mock; getUrl: jest.Mock };

  const user = { sub: 'user-1' } as JwtPayload;

  beforeEach(async () => {
    vaccinationsService = {
      create: jest.fn().mockResolvedValue({ _id: 'vaccination-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      addDocument: jest.fn().mockResolvedValue({ _id: 'vaccination-1' }),
      removeDocument: jest.fn().mockResolvedValue({ _id: 'vaccination-1' }),
    };
    storageProvider = {
      upload: jest
        .fn()
        .mockResolvedValue('vaccination-documents/certificate.pdf'),
      getUrl: jest
        .fn()
        .mockReturnValue('/uploads/vaccination-documents/certificate.pdf'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VaccinationsController],
      providers: [
        { provide: VaccinationsService, useValue: vaccinationsService },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    }).compile();

    controller = module.get<VaccinationsController>(VaccinationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to the service', async () => {
    await controller.create(user, 'pet-1', {
      vaccineName: 'Rabies',
      administeredDate: new Date('2026-01-15'),
      nextDueDate: new Date('2027-01-15'),
    });

    expect(vaccinationsService.create).toHaveBeenCalledWith(
      'user-1',
      'pet-1',
      expect.objectContaining({ vaccineName: 'Rabies' }),
    );
  });

  it('findAll delegates to the service', async () => {
    await controller.findAll(user, 'pet-1');

    expect(vaccinationsService.findAll).toHaveBeenCalledWith('user-1', 'pet-1');
  });

  it('addDocument uploads the file then persists the resulting URL', async () => {
    const file = {
      buffer: Buffer.from('pdf-bytes'),
      originalname: 'certificate.pdf',
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    await controller.addDocument(user, 'pet-1', 'vaccination-1', file);

    expect(storageProvider.upload).toHaveBeenCalledWith({
      buffer: file.buffer,
      folder: 'vaccination-documents',
      originalName: 'certificate.pdf',
      mimetype: 'application/pdf',
    });
    expect(vaccinationsService.addDocument).toHaveBeenCalledWith(
      'user-1',
      'pet-1',
      'vaccination-1',
      {
        url: '/uploads/vaccination-documents/certificate.pdf',
        fileName: 'certificate.pdf',
        mimeType: 'application/pdf',
      },
    );
  });

  it('removeDocument delegates to the service', async () => {
    await controller.removeDocument(user, 'pet-1', 'vaccination-1', 'doc-1');

    expect(vaccinationsService.removeDocument).toHaveBeenCalledWith(
      'user-1',
      'pet-1',
      'vaccination-1',
      'doc-1',
    );
  });
});
