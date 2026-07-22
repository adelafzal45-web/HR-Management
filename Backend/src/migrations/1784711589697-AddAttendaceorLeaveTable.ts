import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendaceorLeaveTable1784711589697
  implements MigrationInterface
{
  name = 'AddAttendaceorLeaveTable1784711589697';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "attendance" ("attendance_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "attendance_date" date NOT NULL, "check_in" TIME NOT NULL, "check_out" TIME, "working_hours" numeric(5,2), "attendance_status" character varying(20) NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "PK_b1577f082402d8226bcd4aed679" PRIMARY KEY ("attendance_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "leave_requests" ("leave_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "leave_type" character varying(30) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "reason" text, "status" character varying(20) NOT NULL DEFAULT 'Pending', "applied_date" TIMESTAMP NOT NULL DEFAULT now(), "approved_date" TIMESTAMP, "user_id" uuid NOT NULL, "approved_by" uuid, CONSTRAINT "PK_6101f650abfdf11a858855119a5" PRIMARY KEY ("leave_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_0bedbcc8d5f9b9ec4979f519597" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_6d320737541c7c4d2a6f0f9d911" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_fe3e6c3fea2c56aaaad8cedbc20" FOREIGN KEY ("approved_by") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_fe3e6c3fea2c56aaaad8cedbc20"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_6d320737541c7c4d2a6f0f9d911"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT "FK_0bedbcc8d5f9b9ec4979f519597"`,
    );
    await queryRunner.query(`DROP TABLE "leave_requests"`);
    await queryRunner.query(`DROP TABLE "attendance"`);
  }
}
