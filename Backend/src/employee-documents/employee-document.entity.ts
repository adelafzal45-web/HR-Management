import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../users/user.entity';

/**
 * One stored file belonging to one employee.
 *
 * Only metadata lives in the database; the bytes are written under
 * `uploads/employee-documents/` with a generated name, the same split the
 * profile-photo upload already uses. `stored_name` is that generated name, kept
 * separate from `original_name` so the client's filename never reaches a path.
 */
@Entity('employee_documents')
@Index(['employeeId'])
export class EmployeeDocument {
  @PrimaryGeneratedColumn('uuid')
  document_id!: string;

  @Column({ type: 'uuid' })
  employeeId!: string;

  /**
   * Cascade on delete: a document that outlived its employee would be an
   * unreachable row pointing at a file nobody can ask for.
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: User;

  @Column({ length: 50 })
  category!: string;

  /** What the uploader called it. Shown in the UI and used inside the zip. */
  @Column({ length: 255 })
  original_name!: string;

  /** The generated `<uuid>.<ext>` name on disk. Never client-supplied. */
  @Column({ length: 100 })
  stored_name!: string;

  @Column({ length: 100 })
  mime_type!: string;

  /** Capped at 10 MB by validation, so a plain int is wide enough. */
  @Column({ type: 'int' })
  size_bytes!: number;

  @Column({ type: 'uuid', nullable: true })
  uploaded_by?: string | null;

  @CreateDateColumn()
  uploaded_at!: Date;
}
