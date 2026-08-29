import { Test, TestingModule } from '@nestjs/testing';

import { CaretakersController } from './caretakers.controller';
import { CaretakersService } from './caretakers.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('CaretakersController', () => {
  let controller: CaretakersController;
  let caretakersService: {
    add: jest.Mock;
    list: jest.Mock;
    leave: jest.Mock;
    remove: jest.Mock;
  };

  const user = { sub: 'user-1' } as JwtPayload;

  beforeEach(async () => {
    caretakersService = {
      add: jest.fn().mockResolvedValue({ _id: 'caretaker-1' }),
      list: jest.fn().mockResolvedValue([]),
      leave: jest.fn().mockResolvedValue({ message: 'left' }),
      remove: jest.fn().mockResolvedValue({ message: 'removed' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CaretakersController],
      providers: [{ provide: CaretakersService, useValue: caretakersService }],
    }).compile();

    controller = module.get<CaretakersController>(CaretakersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('add delegates to the service with the caller as owner', async () => {
    await controller.add(user, 'pet-1', { email: 'vet@example.com' });

    expect(caretakersService.add).toHaveBeenCalledWith('user-1', 'pet-1', {
      email: 'vet@example.com',
    });
  });

  it('list delegates to the service', async () => {
    await controller.list(user, 'pet-1');

    expect(caretakersService.list).toHaveBeenCalledWith('user-1', 'pet-1');
  });

  it('leave delegates to the service for the caller', async () => {
    await controller.leave(user, 'pet-1');

    expect(caretakersService.leave).toHaveBeenCalledWith('user-1', 'pet-1');
  });

  it('remove delegates to the service, scoped to the specific caretaker id', async () => {
    await controller.remove(user, 'pet-1', 'caretaker-1');

    expect(caretakersService.remove).toHaveBeenCalledWith(
      'user-1',
      'pet-1',
      'caretaker-1',
    );
  });
});
