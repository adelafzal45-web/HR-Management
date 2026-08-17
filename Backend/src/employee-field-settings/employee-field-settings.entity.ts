import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';

import type { EmployeeConfigurableField } from '../users/dto/validation.constants';

/**
 * Single-row table recording which employee fields HR has marked required.
 *
 * `field_config` is a `{ [fieldKey]: boolean }` map (true = required) over the
 * configurable field set (`EMPLOYEE_CONFIGURABLE_FIELDS`). The backend reads it
 * in `UserService` and rejects a blank value for any field marked required —
 * the DTO decorators stay format-only, since class-validator can't be made
 * configurable at runtime.
 *
 * By design id is always 1: the database CHECK constraint permits a single row,
 * and the controller enforces GET/PATCH against id=1.
 */
@Entity('employee_field_settings')
@Check('"id" = 1')
export class EmployeeFieldSettings {
  @PrimaryColumn({ type: 'integer', default: 1 })
  id!: number;

  // jsonb rather than a column per field: the configurable set is expected to
  // grow, and a schema migration for every new toggle would be friction for no
  // gain. The explicit `type` is mandatory — TypeORM cannot infer a Postgres
  // column type from a `Record<...>` TS type, and without it the app compiles
  // but crashes at startup ([[typeorm-nullable-union-column-type]]).
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  field_config!: Record<EmployeeConfigurableField, boolean>;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
