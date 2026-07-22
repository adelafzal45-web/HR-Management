import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1784630435834 implements MigrationInterface {
  name = 'InitSchema1784630435834';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "permissions" ("permission_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "permission_name" character varying(100) NOT NULL, "description" text, CONSTRAINT "UQ_b990eff1fc3540798960d80e452" UNIQUE ("permission_name"), CONSTRAINT "PK_1717db2235a5b169822e7f753b1" PRIMARY KEY ("permission_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("role_permission_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "role_id" uuid, "permission_id" uuid, CONSTRAINT "PK_a10e0ecd5c78ec07e3a3ad46b6a" PRIMARY KEY ("role_permission_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("role_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "role_name" character varying(50) NOT NULL, "description" text, CONSTRAINT "UQ_ac35f51a0f17e3e1fe121126039" UNIQUE ("role_name"), CONSTRAINT "PK_09f4c8130b54f35925588a37b6a" PRIMARY KEY ("role_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "departments" ("department_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "department_name" character varying(100) NOT NULL, "description" text, CONSTRAINT "UQ_7772b894808a76fe3ac670f380b" UNIQUE ("department_name"), CONSTRAINT "PK_202cd845b076ed15836884084eb" PRIMARY KEY ("department_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("user_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "email" character varying(255) NOT NULL, "password" character varying NOT NULL, "phone" character varying(20), "profile_image" text, "employee_type" character varying(30), "designation" character varying(100), "joining_date" date NOT NULL, "salary" numeric(12,2), "status" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "roleRoleId" uuid, "departmentDepartmentId" uuid, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_96aac72f1574b88752e9fb00089" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_17022daf3f885f7d35423e9971e" FOREIGN KEY ("permission_id") REFERENCES "permissions"("permission_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_f32dd66b36a5aa53fc615781bed" FOREIGN KEY ("roleRoleId") REFERENCES "roles"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_cf6f2f96104e0b0184a7b5375ae" FOREIGN KEY ("departmentDepartmentId") REFERENCES "departments"("department_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_cf6f2f96104e0b0184a7b5375ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_f32dd66b36a5aa53fc615781bed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_17022daf3f885f7d35423e9971e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_178199805b901ccd220ab7740ec"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "departments"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
  }
}
