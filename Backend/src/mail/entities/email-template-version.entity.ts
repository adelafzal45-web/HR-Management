import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

import { User } from '../../users/user.entity';
import { EmailTemplate } from './email-template.entity';

/**
 * An append-only snapshot of a template's content at one version.
 *
 * Written before each edit is applied, so version N holds what the template
 * looked like at version N and the newest row always matches the live template.
 * Never updated or deleted — that is what makes "restore version 3" possible and
 * what stops the history from being quietly rewritten.
 *
 * `changed_by_email` is denormalised alongside the FK for the same reason
 * AuditLog does it: the history must stay attributable after the editor's
 * account is deleted.
 */
@Entity('email_template_versions')
@Index(['email_template_id', 'version'], { unique: true })
export class EmailTemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  email_template_version_id!: string;

  @ManyToOne(() => EmailTemplate, (template) => template.versions, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'email_template_id' })
  template!: EmailTemplate;

  @Column({ type: 'uuid' })
  email_template_id!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'text' })
  body_html!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'changed_by_user_id' })
  changedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  changed_by_user_id?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  changed_by_email?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;
}
