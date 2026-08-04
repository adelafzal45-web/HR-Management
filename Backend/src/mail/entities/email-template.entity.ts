import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';

import { User } from '../../users/user.entity';
import { EmailTemplateVersion } from './email-template-version.entity';

/**
 * An administrator-editable email template.
 *
 * `template_key` is the stable identifier that application code enqueues
 * against (`MailService.enqueue({ templateKey: 'password_reset', ... })`), so it
 * is unique and never renamed once shipped. `name` is the human label and is
 * free to be reworded.
 *
 * Only the current version lives here; every prior revision is a row in
 * `email_template_versions`. Keeping history out of this table means the render
 * path — which runs on every outbound email — reads one row by key with no
 * "latest version" filtering.
 */
@Entity('email_templates')
export class EmailTemplate {
  @PrimaryGeneratedColumn('uuid')
  email_template_id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 60 })
  template_key!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** Supports the same `{{placeholder}}` syntax as the body. */
  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  /**
   * The body fragment, not a whole document — TemplateRendererService wraps it
   * in the shared branded shell at render time. Storing only the fragment means
   * a branding change in Company Settings reaches all eleven templates without
   * editing any of them.
   */
  @Column({ type: 'text' })
  body_html!: string;

  /**
   * A disabled template causes its trigger to be skipped silently rather than
   * to fail. Turning off the welcome email must not break employee creation.
   */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  /** Incremented on every content edit; matches the newest version row. */
  @Column({ type: 'integer', default: 1 })
  version!: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_user_id' })
  updatedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  updated_by_user_id?: string | null;

  @OneToMany(() => EmailTemplateVersion, (version) => version.template)
  versions?: EmailTemplateVersion[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;
}
