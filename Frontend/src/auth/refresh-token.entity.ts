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
 * A server-side record of one issued refresh token.
 *
 * The raw token is never stored — only a SHA-256 hash. A database leak
 * therefore does not hand an attacker usable refresh tokens, the same reasoning
 * that applies to password hashing (though a fast digest is appropriate here:
 * the token is 256 bits of server-generated entropy, so it isn't brute-forcible
 * the way a human-chosen password is).
 *
 * Rows are kept after revocation rather than deleted, so a replayed token can
 * be recognised as revoked instead of merely "unknown".
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  refresh_token_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** SHA-256 hex digest of the token. Unique so a digest can't be double-issued. */
  @Index()
  @Column({ type: 'varchar', length: 64, unique: true })
  token_hash!: string;

  @Column({ type: 'timestamptz' })
  expires_at!: Date;

  /** Set when the token is rotated away or explicitly logged out. */
  @Column({ type: 'timestamptz', nullable: true })
  revoked_at?: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
