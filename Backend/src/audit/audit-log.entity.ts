import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

import { User } from '../users/user.entity';

/**
 * Append-only record of who changed what.
 *
 * Never updated after insert — a correction is a new row, so the trail cannot
 * be rewritten. `actor_user_id` is ON DELETE SET NULL rather than CASCADE:
 * deleting a user must not erase the record of what they did, which is exactly
 * when an audit trail matters most. `actor_email` is denormalised for the same
 * reason — it stays readable after the account is gone.
 */
@Entity('audit_logs')
@Index(['entity_type', 'entity_id'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  audit_log_id!: string;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'actor_user_id',
  })
  actor?: User | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  actor_user_id?: string | null;

  /**
   * Kept independently of the FK so the trail survives user deletion.
   *
   * `type` is explicit on every nullable string column here. A `string | null`
   * property reflects as `Object` at runtime, which TypeORM cannot map to a
   * Postgres type — it fails at metadata build, taking down both migrations and
   * app boot.
   */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  actor_email?: string | null;

  /** e.g. 'employee.create', 'employee.password.reset'. */
  @Column({
    length: 80,
  })
  action!: string;

  /** e.g. 'User', 'UserLeaveBalance'. */
  @Column({
    length: 80,
  })
  entity_type!: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  entity_id?: string | null;

  /**
   * Field-level diff. jsonb so a new audited entity needs no schema change.
   * Sensitive values (password hashes, tokens) are redacted by AuditService
   * before they reach here.
   */
  @Column({
    type: 'jsonb',
    nullable: true,
  })
  before_state?: Record<string, unknown> | null;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  after_state?: Record<string, unknown> | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  ip_address?: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  user_agent?: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
