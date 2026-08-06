import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets an attendance row exist without a check-in time.
 *
 * `attendance.check_in` has been NOT NULL since the original schema, which was
 * fine while every row came from someone clocking in. It stopped being fine the
 * moment the absence sweep started writing rows: an Absent day has no arrival
 * time by definition, so `markAbsentees()` failed on every employee with
 *
 *   null value in column "check_in" of relation "attendance" violates not-null
 *
 * and nobody was ever marked absent. The same applies to `On Leave` and to an HR
 * correction that records a status before any stamp exists.
 *
 * `UpdatedSchema1785409543305` carries this same statement, but that migration
 * is already recorded as run against the live database — the line was added to
 * the file afterwards, so it never executed. Re-running it is not an option;
 * hence this one.
 *
 * The `down()` deliberately fills the gaps with midnight rather than failing:
 * a rollback cannot restore times that were never recorded, and refusing to
 * roll back is worse than an obviously-synthetic 00:00:00 the Absent status
 * already explains.
 */
export class AttendanceCheckInNullable1787900000000
  implements MigrationInterface
{
  name = 'AttendanceCheckInNullable1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance"
      ALTER COLUMN "check_in" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "attendance"
      SET "check_in" = '00:00:00'
      WHERE "check_in" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance"
      ALTER COLUMN "check_in" SET NOT NULL
    `);
  }
}
