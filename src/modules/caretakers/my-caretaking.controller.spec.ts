import { Test, TestingModule } from '@nestjs/testing';

import { MyCaretakingController } from './my-caretaking.controller';
import { CaretakersService } from './caretakers.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('MyCaretakingController', () => {
  let controller: MyCaretakingController;
  let caretakersService: { listPetsForCaretaker: jest.Mock };

  const user = { sub: 'user-1' } as JwtPayload;

  beforeEach(async () => {
    caretakersService = {
      listPetsForCaretaker: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MyCaretakingController],
      providers: [{ provide: CaretakersService, useValue: caretakersService }],
    }).compile();

    controller = module.get<MyCaretakingController>(MyCaretakingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listMyCaretakingPets delegates to the service, scoped to the caller', async () => {
    await controller.listMyCaretakingPets(user);

    expect(caretakersService.listPetsForCaretaker).toHaveBeenCalledWith(
      'user-1',
    );
  });
});
