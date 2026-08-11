import { ValueTransformer } from 'typeorm';

/**
 * Parses pg `decimal`/`numeric` columns back to a JS number on read.
 *
 * The pg driver returns these as strings, so without a transformer the API
 * emits `"120000.50"` where clients expect a number and arithmetic on them
 * concatenates instead of adds — the same reasoning as `users.salary` and the
 * leave-balance columns. Reused across every money column in the payroll engine
 * so the behaviour is defined once.
 *
 * `moneyTransformer` treats null as null (the column is nullable); the amount
 * only exists when set. `moneyDefaultZero` coerces null to 0 for columns that
 * are NOT NULL DEFAULT 0, so a freshly-selected row never surfaces `null` where
 * the type says `number`.
 */
export const moneyTransformer: ValueTransformer = {
  to: (value?: number | null): number | null => value ?? null,
  from: (value: string | number | null): number | null =>
    value === null || value === undefined ? null : Number(value),
};

export const moneyDefaultZero: ValueTransformer = {
  to: (value?: number | null): number => value ?? 0,
  from: (value: string | number | null): number =>
    value === null || value === undefined ? 0 : Number(value),
};
