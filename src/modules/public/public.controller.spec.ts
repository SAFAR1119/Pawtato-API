import { Test, TestingModule } from '@nestjs/testing';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { STORAGE_PROVIDER } from '../storage/storage.constants';

describe('PublicController', () => {
  let controller: PublicController;
  let publicService: { getNearbyLostPets: jest.Mock };

  beforeEach(async () => {
    publicService = { getNearbyLostPets: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        { provide: PublicService, useValue: publicService },
        { provide: STORAGE_PROVIDER, useValue: {} },
      ],
    }).compile();

    controller = module.get<PublicController>(PublicController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getNearbyLostPets', () => {
    it('delegates the query straight through to the service', async () => {
      const query = { lat: 23.7, lng: 90.4, radiusKm: 5 };

      await controller.getNearbyLostPets(query);

      expect(publicService.getNearbyLostPets).toHaveBeenCalledWith(query);
    });
  });
});
