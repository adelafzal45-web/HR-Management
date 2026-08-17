import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';

/**
 * The single free-text `address` field.
 *
 * Run through the real `ValidationPipe` with the same options `main.ts`
 * configures rather than calling `validate()` by hand: the behaviour depends on
 * `whitelist` and on class-transformer running first, so a hand-rolled harness
 * could pass while the running server rejected the request (or the reverse).
 *
 * Requiredness is deliberately NOT asserted here. The address is optional at
 * the DTO level; whether it must be filled in is governed by the Employee Field
 * Settings and enforced against the merged record in `UserService`, not by a
 * decorator on this class.
 */
describe('address validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });

  const meta = (metatype: unknown) =>
    ({ type: 'body', metatype }) as Parameters<ValidationPipe['transform']>[1];

  /** Everything a create needs apart from the address. */
  const baseBody = {
    first_name: 'Ali',
    last_name: 'Khan',
    date_of_birth: '2000-01-01',
    gender: 'Male',
    email: 'ali.khan@example.com',
    phone: '+92 300 1234567',
    password: 'Str0ng@Pass',
    joining_date: '2026-08-01',
    employee_type: 'Full-Time',
    department_id: 'a3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
    designation_id: 'b3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
    job_category_id: 'c3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
    shift_id: 'd3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
    role_id: 'e3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
    salary: 85000,
  };

  const create = (body: Record<string, unknown>) =>
    pipe.transform({ ...baseBody, ...body }, meta(CreateUserDto));

  /** The messages of a rejected body, or [] when it was accepted. */
  const messagesFor = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return [];
    } catch (error) {
      const response = (error as BadRequestException).getResponse();
      const message = (response as { message?: string[] }).message ?? [];
      return Array.isArray(message) ? message : [message];
    }
  };

  describe('creating', () => {
    it('keeps a free-text address as given (trimmed)', async () => {
      const dto = (await create({
        address: '  House 12, Gulberg III, Lahore  ',
      })) as CreateUserDto;

      expect(dto.address).toBe('House 12, Gulberg III, Lahore');
    });

    // The address is optional at the DTO level — the "is it required" decision
    // lives in the Employee Field Settings, checked in the service.
    it('accepts a create with no address', async () => {
      await expect(create({})).resolves.toBeInstanceOf(CreateUserDto);
    });

    // Untouched inputs submit `""`, not `undefined`. `TrimOptional` collapses a
    // blank string so it reads as "not provided" rather than an empty address.
    it('collapses a blank address to undefined', async () => {
      const dto = (await create({ address: '   ' })) as CreateUserDto;

      expect(dto.address).toBeUndefined();
    });

    it('rejects an address longer than 500 characters', async () => {
      const messages = await messagesFor(() =>
        create({ address: 'x'.repeat(501) }),
      );

      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('editing', () => {
    it('accepts a patch that carries no address', async () => {
      await expect(
        pipe.transform({ salary: 90000 }, meta(UpdateUserDto)),
      ).resolves.toBeInstanceOf(UpdateUserDto);
    });

    it('accepts a patch updating the address', async () => {
      const dto = (await pipe.transform(
        { address: 'New City' },
        meta(UpdateUserDto),
      )) as UpdateUserDto;

      expect(dto.address).toBe('New City');
    });
  });
});
