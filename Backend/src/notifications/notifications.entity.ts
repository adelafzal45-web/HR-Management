import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { Department } from '../department/department.entity';

/**
 * What produced the notification. Lets the bell filter/group without parsing
 * the human-readable title, and lets the leave module find its own notices.
 *
 * Two kinds of value live here. The first block is what an author picks in the
 * compose form; the rest are stamped by the module that raised the notice. They
 * share one column because the bell filters over both — an employee looking for
 * "Leave" wants the HR announcement *and* their own approval notice.
 */
export enum NotificationCategory {
  GENERAL = 'General',
  ANNOUNCEMENT = 'Announcement',
  PAYROLL = 'Payroll',
  ATTENDANCE = 'Attendance',
  APPRAISAL = 'Appraisal',
  LEAVE = 'Leave',
  LEAVE_SUBMITTED = 'Leave Submitted',
  LEAVE_APPROVED = 'Leave Approved',
  LEAVE_REJECTED = 'Leave Rejected',
  LEAVE_CANCELLED = 'Leave Cancelled',
  LEAVE_BALANCE_UPDATED = 'Leave Balance Updated',
  MEETING_INVITED = 'Meeting Invitation',
  MEETING_UPDATED = 'Meeting Updated',
  MEETING_CANCELLED = 'Meeting Cancelled',
}

/** The categories an author may choose when composing. */
export const AUTHORABLE_CATEGORIES: NotificationCategory[] = [
  NotificationCategory.GENERAL,
  NotificationCategory.ANNOUNCEMENT,
  NotificationCategory.LEAVE,
  NotificationCategory.PAYROLL,
  NotificationCategory.ATTENDANCE,
  NotificationCategory.APPRAISAL,
];

/**
 * How the author chose who receives a notification.
 *
 * Mirrors `MeetingAudienceType`. Recorded alongside the fanned-out recipient
 * rows rather than inferred from them, so "everyone in Engineering" still reads
 * that way after somebody transfers out of Engineering.
 */
export enum NotificationAudienceType {
  SPECIFIC = 'Specific',
  DEPARTMENT = 'Department',
  ALL = 'All',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  notification_id!: string;

  @Column({
    type: 'varchar',
    length: 200,
  })
  title!: string;

  @Column({
    type: 'text',
  })
  message!: string;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at!: Date;

  @Column({
    type: 'varchar',
    length: 40,
    default: NotificationCategory.GENERAL,
  })
  category!: NotificationCategory;

  /**
   * Who the notification is *for*.
   *
   * Composed notifications are fanned out — one row per resolved recipient —
   * so this is set on everything written since audience targeting landed. A
   * null recipient means a legacy company-wide row: before targeting existed,
   * `create()` saved a single unaddressed row and the bell showed it to
   * everybody. Those rows are still displayed, but they carry no per-user read
   * state (one `read_at` shared by the whole company), which is precisely why
   * new sends do not use that shape.
   */
  @ManyToOne(() => User, (user) => user.receivedNotifications, {
    nullable: true,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'recipient_id' })
  recipient?: User | null;

  @Column({ type: 'uuid', nullable: true })
  recipient_id?: string | null;

  /**
   * Groups the rows written by one send.
   *
   * Without it a notification to forty people is forty indistinguishable rows:
   * the Sent view would list it forty times, and editing a typo would fix one
   * person's copy. Null on legacy rows, which are each their own batch.
   */
  @Column({ type: 'uuid', nullable: true })
  batch_id?: string | null;

  /** How the recipient list was chosen. See `NotificationAudienceType`. */
  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationAudienceType.ALL,
  })
  audience_type!: NotificationAudienceType;

  @ManyToOne(() => Department, { nullable: true, eager: true })
  @JoinColumn({ name: 'audience_department_id' })
  audienceDepartment?: Department | null;

  /** Set only when `audience_type` is `Department`. */
  @Column({ type: 'uuid', nullable: true })
  audience_department_id?: string | null;

  /** Unread while null. */
  @Column({ type: 'timestamp', nullable: true })
  read_at?: Date | null;

  /** In-app route the bell should navigate to, e.g. `/leave/requests`. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  link?: string | null;

  /** The row this notice is about, for de-duplication and deep links. */
  @Column({ type: 'uuid', nullable: true })
  reference_id?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  reference_type?: string | null;

  /**
   * An optional uploaded document — the PDF behind a payroll or policy notice.
   *
   * Distinct from `link`, which points at an in-app route. These four repeat
   * across a fanned-out batch exactly as `title` and `message` do: the batch is
   * reassembled by grouping on `batch_id`, so the attachment travels with every
   * recipient's row and each of them can download it.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  attachment_url?: string | null;

  /**
   * The name the file had when it was uploaded, used for the download prompt.
   * Kept apart from the URL because the stored filename is a generated UUID —
   * without this the download would save as `9f3c1e08-….pdf`.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  attachment_name?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  attachment_mime?: string | null;

  /** Bytes. Shown next to the filename so the size is known before clicking. */
  @Column({ type: 'integer', nullable: true })
  attachment_size?: number | null;

  /**
   * The author. Nullable because system-generated notices (leave decisions,
   * balance updates) have no human author, and attributing them to the
   * approver would make "HR approved your leave" look self-sent in the
   * approver's own bell.
   */
  @ManyToOne(() => User, {
    nullable: true,
    eager: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'created_by',
  })
  createdBy?: User | null;
}
