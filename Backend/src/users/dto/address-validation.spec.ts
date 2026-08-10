import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';
import { ADDRESS_FIELDS, hasAnyAddressField } from './validation.constants';

/**
 * The "every part optional, at least one required" address rule.
 *
 * Run through the real `ValidationPipe` with the same options `main.ts`
 * configures rather than calling `validate()` by hand: the rule depends on
 * `whitelist` and on class-transformer running first, so a hand-rolled harness
 * could pass while the running server rejected the request (or the reverse).
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

  const create = (address: Record<string, unknown>) =>
    pipe.transform({ ...baseBody, ...address }, meta(CreateUserDto));

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
    it('accepts an employee with only a city', async () => {
      const dto = (await create({ city: 'Lahore' })) as CreateUserDto;

      expect(dto.city).toBe('Lahore');
      expect(dto.street_address).toBeUndefined();
      expect(dto.postal_code).toBeUndefined();
    });

    // One case per field: the rule has to be satisfied by *any* of the five,
    // and hanging it off one real property is the mistake this guards against.
    it.each(ADDRESS_FIELDS)('accepts an employee with only %s', async (field) => {
      const value = field === 'postal_code' ? '54000' : 'Lahore';

      await expect(create({ [field]: value })).resolves.toBeInstanceOf(
        CreateUserDto,
      );
    });

    it('rejects an employee with no address at all', async () => {
      const messages = await messagesFor(() => create({}));

      expect(messages).toContainEqual(expect.stringContaining('at least one'));
    });

    // The empty-string case is the one that actually arrives from the form —
    // untouched inputs submit `""`, not `undefined`. `TrimOptional` collapses
    // them, so this must be rejected exactly like the absent case rather than
    // passing as five present-but-blank values.
    it('rejects five blank strings', async () => {
      const blank = Object.fromEntries(
        ADDRESS_FIELDS.map((field) => [field, '   ']),
      );

      const messages = await messagesFor(() => create(blank));

      expect(messages).toContainEqual(expect.stringContaining('at least one'));
    });

    // Blank optional fields must not also fail their format regexes: a user who
    // left the postal code alone should not be told it is invalid.
    it('reports only the group rule when the address is empty', async () => {
      const messages = await messagesFor(() => create({}));

      expect(messages).toHaveLength(1);
    });

    // `address_group` is the property the rule hangs on, and it survives the
    // pipe (whitelist keeps anything carrying a validator). Setting it must not
    // be a way to claim an address that was never entered — the validator reads
    // the five real fields, not its own value.
    it('does not accept the synthetic group property as an address', async () => {
      const messages = await messagesFor(() =>
        create({ address_group: 'anything' }),
      );

      expect(messages).toContainEqual(expect.stringContaining('at least one'));
    });
  });

  describe('editing', () => {
    // PartialType disables the group rule on updates by design: a PATCH that
    // touches only the salary carries no address and must not be rejected for
    // it. The equivalent check runs against the merged record in
    // UserService.update, where the stored address is also visible.
    it('accepts a patch that carries no address', async () => {
      await expect(
        pipe.transform({ salary: 90000 }, meta(UpdateUserDto)),
      ).resolves.toBeInstanceOf(UpdateUserDto);
    });

    it('accepts a patch clearing one field', async () => {
      await expect(
        pipe.transform({ city: '' }, meta(UpdateUserDto)),
      ).resolves.toBeInstanceOf(UpdateUserDto);
    });
  });

  describe('hasAnyAddressField', () => {
    it('is false for an empty record', () => {
      expect(hasAnyAddressField({})).toBe(false);
    });

    it('is false when every field is null or blank', () => {
      expect(
        hasAnyAddressField({
          street_address: null,
          city: '',
          state_province: '   ',
          postal_code: undefined,
          country: null,
        }),
      ).toBe(false);
    });

    it('is true when a single field is filled', () => {
      expect(hasAnyAddressField({ country: 'Pakistan' })).toBe(true);
    });

    // Guards the merged-record call in UserService.update, which passes a whole
    // User entity — every other column on it must be ignored.
    it('ignores non-address values', () => {
      expect(
        hasAnyAddressField({ first_name: 'Ali' } as Record<string, unknown>),
      ).toBe(false);
    });
  });
});
