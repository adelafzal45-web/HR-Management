import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { Department } from '../department/department.entity';
import { MeetingParticipant } from './meeting-participant.entity';

/**
 * How the organizer chose the invitee list.
 *
 * Stored alongside the resolved `meeting_participants` rows rather than instead
 * of them: the rows are the record of who was actually invited and emailed, and
 * this is the *intent* behind them, so a list of forty people can be rendered
 * as "Everyone in Engineering" instead of forty chips.
 */
export enum MeetingAudienceType {
  SPECIFIC = 'Specific',
  DEPARTMENT = 'Department',
  ALL = 'All',
}

export enum MeetingStatus {
  SCHEDULED = 'Scheduled',
  CANCELLED = 'Cancelled',
  COMPLETED = 'Completed',
}

@Entity('meetings')
export class Meeting {
  @PrimaryGeneratedColumn('uuid')
  meeting_id!: string;

  @Column({ length: 200 })
  title!: string;

  /**
   * When the meeting starts. `timestamptz` (not the bare `timestamp` used by
   * the older leave columns) because a meeting time is a real instant that
   * participants in different offsets must agree on, where a leave *date* is a
   * calendar day and deliberately offset-free.
   */
  @Column({ type: 'timestamptz' })
  scheduled_at!: Date;

  /**
   * Physical room or a joining URL — one field, because the spec asks for one
   * and because the distinction is not something the backend acts on. The
   * frontend renders it as a link when it parses as a URL.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  location?: string | null;

  @Column({ type: 'text', nullable: true })
  agenda?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: MeetingAudienceType.SPECIFIC,
  })
  audience_type!: MeetingAudienceType;

  @ManyToOne(() => Department, { nullable: true, eager: true })
  @JoinColumn({ name: 'audience_department_id' })
  audienceDepartment?: Department | null;

  /** Set only when `audience_type` is `Department`. */
  @Column({ type: 'uuid', nullable: true })
  audience_department_id?: string | null;

  /**
   * Per-meeting delivery choices. The organizer picks these in the form; the
   * notifier checks each one before touching that channel, so an unchecked box
   * means no queued mail and no bell entry rather than a suppressed-but-sent
   * notification.
   */
  @Column({ type: 'boolean', default: true })
  notify_email!: boolean;

  @Column({ type: 'boolean', default: true })
  notify_in_app!: boolean;

  @Column({
    type: 'varchar',
    length: 20,
    default: MeetingStatus.SCHEDULED,
  })
  status!: MeetingStatus;

  /** Required at cancel time and echoed into the notification participants see. */
  @Column({ type: 'text', nullable: true })
  cancellation_reason?: string | null;

  @ManyToOne(() => User, { nullable: false, eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizer_id' })
  organizer!: User;

  @Column({ type: 'uuid' })
  organizer_id!: string;

  @OneToMany(() => MeetingParticipant, (participant) => participant.meeting, {
    cascade: ['insert'],
  })
  participants!: MeetingParticipant[];

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at!: Date;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updated_at!: Date;
}
