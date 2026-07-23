import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDesignationTable1784797304432 implements MigrationInterface {
  name = 'AddDesignationTable1784797304432';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_f32dd66b36a5aa53fc615781bed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_cf6f2f96104e0b0184a7b5375ae"`,
    );
    await queryRunner.query(
      `CREATE TABLE "designations" ("designation_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(100) NOT NULL, CONSTRAINT "UQ_0b1bfb4e00d37970d8873de885f" UNIQUE ("title"), CONSTRAINT "PK_ae42f77642a5b08a85d7226fb06" PRIMARY KEY ("designation_id"))`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "designation"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "roleRoleId"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "departmentDepartmentId"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "designation_id" uuid`);
    await queryRunner.query(`ALTER TABLE "users" ADD "role_id" uuid`);
    await queryRunner.query(`ALTER TABLE "users" ADD "department_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_9568a0fda18937f1082a82ecbaf" FOREIGN KEY ("designation_id") REFERENCES "designations"("designation_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_0921d1972cf861d568f5271cd85" FOREIGN KEY ("department_id") REFERENCES "departments"("department_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_0921d1972cf861d568f5271cd85"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_9568a0fda18937f1082a82ecbaf"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "department_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "designation_id"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "departmentDepartmentId" uuid`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "roleRoleId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "designation" character varying(100)`,
    );
    await queryRunner.query(`DROP TABLE "designations"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_cf6f2f96104e0b0184a7b5375ae" FOREIGN KEY ("departmentDepartmentId") REFERENCES "departments"("department_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_f32dd66b36a5aa53fc615781bed" FOREIGN KEY ("roleRoleId") REFERENCES "roles"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
