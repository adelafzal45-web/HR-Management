import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';

/**
 * What produced the notification. Lets the bell filter/group without parsing
 * the human-readable title, and lets the leave module find its own notices.
 */
export enum NotificationCategory {
  GENERAL = 'General',
  LEAVE_SUBMITTED = 'Leave Submitted',
  LEAVE_APPROVED = 'Leave Approved',
  LEAVE_REJECTED = 'Leave Rejected',
  LEAVE_CANCELLED = 'Leave Cancelled',
  LEAVE_BALANCE_UPDATED = 'Leave Balance Updated',
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
   * Null means a company-wide announcement, which is what every row created
   * before this column existed is — the original table only recorded who
   * *authored* a notice, so addressing had to be added rather than assumed.
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
