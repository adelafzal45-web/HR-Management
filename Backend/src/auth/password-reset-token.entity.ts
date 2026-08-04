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
 * One issued password-reset link.
 *
 * Deliberately modelled on {@link RefreshToken}: only a SHA-256 digest of the
 * token is stored, and rows are kept after use rather than deleted. That
 * combination is what lets the redeem path distinguish "this link was already
 * used" from "this link was never valid" — a distinction the user needs, since
 * the first means check your inbox for the newer mail and the second means the
 * URL was mangled.
 *
 * A fast digest is correct here for the same reason it is on refresh tokens:
 * the value is 256 bits of server-generated entropy, not a human-chosen secret,
 * so there is no offline-guessing threat for a slow KDF to blunt.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  password_reset_token_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  user_id!: string;

  /** SHA-256 hex digest of the raw token. Unique — a digest can't be double-issued. */
  @Index()
  @Column({ type: 'varchar', length: 64, unique: true })
  token_hash!: string;

  /**
   * The address the link was actually sent to, captured at issue time.
   *
   * Denormalised from `user.email` on purpose: if the employee later changes
   * their address, the status trail must still show where the link went. Reading
   * it back through the relation would silently rewrite history.
   */
  @Column({ type: 'varchar', length: 255 })
  delivery_email!: string;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  /** Set on successful redemption. Single-use is enforced against this column. */
  @Column({ type: 'timestamptz', nullable: true })
  used_at?: Date | null;

  /**
   * Set when a token is superseded rather than spent — a newer link was issued,
   * or the password changed by another route. Kept separate from `used_at` so
   * "you already used this" and "this link was replaced" stay distinguishable.
   */
  @Column({ type: 'timestamptz', nullable: true })
  invalidated_at?: Date | null;

  /**
   * The admin who issued the link, or NULL for a self-service request. This is
   * what separates "the employee asked for a reset" from "an administrator sent
   * them one", which is the more sensitive of the two.
   */
  @Column({ type: 'uuid', nullable: true })
  created_by_user_id?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  created_ip?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
