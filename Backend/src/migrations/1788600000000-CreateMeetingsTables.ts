import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the meeting scheduling tables.
 *
 * `meetings` holds the scheduled event plus the organizer's audience choice and
 * per-meeting notification flags; `meeting_participants` holds the resolved
 * invitee list. The list is stored rather than recomputed so that "everyone in
 * Engineering" keeps meaning the people who were in Engineering when the
 * invitation was sent.
 *
 * Written idempotently (`IF NOT EXISTS`) to match
 * 1788200000000-CreateLeaveEntitlementSystem.
 */
export class CreateMeetingsTables1788600000000 implements MigrationInterface {
  name = 'CreateMeetingsTables1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "meetings" (
        "meeting_id"             uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "title"                  varchar(200) NOT NULL,
        "scheduled_at"           timestamptz  NOT NULL,
        "location"               varchar(255),
        "agenda"                 text,
        "audience_type"          varchar(20)  NOT NULL DEFAULT 'Specific',
        "audience_department_id" uuid,
        "notify_email"           boolean      NOT NULL DEFAULT true,
        "notify_in_app"          boolean      NOT NULL DEFAULT true,
        "status"                 varchar(20)  NOT NULL DEFAULT 'Scheduled',
        "cancellation_reason"    text,
        "organizer_id"           uuid         NOT NULL,
        "created_at"             timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at"             timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_meetings" PRIMARY KEY ("meeting_id"),
        CONSTRAINT "fk_meetings_organizer"
          FOREIGN KEY ("organizer_id") REFERENCES "users"("user_id")
          ON DELETE CASCADE,
        CONSTRAINT "fk_meetings_audience_department"
          FOREIGN KEY ("audience_department_id") REFERENCES "departments"("department_id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "meeting_participants" (
        "meeting_participant_id" uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "meeting_id"             uuid        NOT NULL,
        "user_id"                uuid        NOT NULL,
        "created_at"             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "pk_meeting_participants" PRIMARY KEY ("meeting_participant_id"),
        CONSTRAINT "uq_meeting_participant" UNIQUE ("meeting_id", "user_id"),
        CONSTRAINT "fk_meeting_participants_meeting"
          FOREIGN KEY ("meeting_id") REFERENCES "meetings"("meeting_id")
          ON DELETE CASCADE,
        CONSTRAINT "fk_meeting_participants_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
          ON DELETE CASCADE
      )
    `);

    // scheduled_at drives the default ordering and every date-range filter;
    // the two FK indexes back the /meetings/me EXISTS lookup and organizer view.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_meetings_scheduled_at"
        ON "meetings" ("scheduled_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_meetings_organizer"
        ON "meetings" ("organizer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_meeting_participants_meeting"
        ON "meeting_participants" ("meeting_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_meeting_participants_user"
        ON "meeting_participants" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // meeting_participants first: its FK depends on meetings.
    await queryRunner.query(`DROP TABLE IF EXISTS "meeting_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "meetings"`);
  }
}
