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
 * A password hash this user has previously held.
 *
 * Exists so a "new" password can be rejected for being one already used. Note
 * what this table is *not*: it stores bcrypt hashes, not passwords, so reuse is
 * detected by comparing a candidate against each stored hash — there is no way
 * to read back what the old password was. That also means the check costs one
 * bcrypt comparison per retained entry, which is the reason the retained window
 * is small (see PASSWORD_HISTORY_DEPTH).
 *
 * The current password lives in `users.password`; a row is written here at the
 * moment it is *replaced*, so history holds strictly former passwords.
 */
@Entity('password_history')
@Index(['user_id', 'created_at'])
export class PasswordHistory {
  @PrimaryGeneratedColumn('uuid')
  password_history_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'varchar', length: 255 })
  password_hash!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
