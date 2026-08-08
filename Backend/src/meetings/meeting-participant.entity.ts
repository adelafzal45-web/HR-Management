import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';

import { User } from '../users/user.entity';
import { Meeting } from './meetings.entity';

/**
 * One invited person on one meeting.
 *
 * An explicit join entity rather than a bare `ManyToMany`, following how
 * `leave_entitlements` is modelled: it gives the row its own identity, so RSVP
 * state or per-recipient delivery tracking can be added later as columns instead
 * of a schema rewrite. It is also the persisted record of who was actually
 * invited — see the note on audience resolution in `MeetingsService`.
 */
@Entity('meeting_participants')
@Unique('uq_meeting_participant', ['meeting_id', 'user_id'])
export class MeetingParticipant {
  @PrimaryGeneratedColumn('uuid')
  meeting_participant_id!: string;

  @ManyToOne(() => Meeting, (meeting) => meeting.participants, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'meeting_id' })
  meeting!: Meeting;

  @Index('idx_meeting_participants_meeting')
  @Column({ type: 'uuid' })
  meeting_id!: string;

  /**
   * Eager so the notifier can mail participants straight from these rows
   * without a second query per recipient.
   */
  @ManyToOne(() => User, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index('idx_meeting_participants_user')
  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  created_at!: Date;
}
