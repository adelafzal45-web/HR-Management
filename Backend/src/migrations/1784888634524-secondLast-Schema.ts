import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecondLastSchema1784888634524 implements MigrationInterface {
  name = 'SecondLastSchema1784888634524';

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
      `CREATE TABLE "designations" ("designation_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(100) NOT NULL, "department_id" uuid NOT NULL, CONSTRAINT "UQ_0b1bfb4e00d37970d8873de885f" UNIQUE ("title"), CONSTRAINT "PK_ae42f77642a5b08a85d7226fb06" PRIMARY KEY ("designation_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "departments" ("department_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "department_name" character varying(100) NOT NULL, "description" text, CONSTRAINT "UQ_7772b894808a76fe3ac670f380b" UNIQUE ("department_name"), CONSTRAINT "PK_202cd845b076ed15836884084eb" PRIMARY KEY ("department_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "shifts" ("shift_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "shift_name" character varying(100) NOT NULL, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, "grace_period_minutes" integer NOT NULL DEFAULT '0', "status" character varying(20) NOT NULL DEFAULT 'Active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_29071d8ddc79022a6f60b917c86" UNIQUE ("shift_name"), CONSTRAINT "PK_c3077046266a8fd616a6acb511f" PRIMARY KEY ("shift_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "attendance" ("attendance_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "attendance_date" date NOT NULL, "check_in" TIME NOT NULL, "check_out" TIME, "working_hours" numeric(5,2), "attendance_status" character varying(20) NOT NULL, "overtime_hours" numeric(5,2), "is_overtime" boolean NOT NULL DEFAULT false, "user_id" uuid NOT NULL, "shift_id" uuid, CONSTRAINT "PK_b1577f082402d8226bcd4aed679" PRIMARY KEY ("attendance_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "leave_requests" ("leave_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "leave_type" character varying(30) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "reason" text, "status" character varying(20) NOT NULL DEFAULT 'Pending', "applied_date" TIMESTAMP NOT NULL DEFAULT now(), "approved_date" TIMESTAMP, "user_id" uuid NOT NULL, "approved_by" uuid, CONSTRAINT "PK_6101f650abfdf11a858855119a5" PRIMARY KEY ("leave_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "job_categories" ("job_category_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "job_category_name" character varying(100) NOT NULL, "description" text, CONSTRAINT "UQ_124363dd57bd917876a5d3cb5aa" UNIQUE ("job_category_name"), CONSTRAINT "PK_c6bb4b4413210d9b78442b60ed1" PRIMARY KEY ("job_category_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "payroll" ("payroll_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "payroll_month" date NOT NULL, "basic_salary" numeric(12,2) NOT NULL, "allowance" numeric(12,2) NOT NULL DEFAULT '0', "bonus" numeric(12,2) NOT NULL DEFAULT '0', "deduction" numeric(12,2) NOT NULL DEFAULT '0', "tax" numeric(12,2) NOT NULL DEFAULT '0', "net_salary" numeric(12,2) NOT NULL, "payment_date" date NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "PK_14419a71701a710c311f23dc538" PRIMARY KEY ("payroll_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("notification_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(200) NOT NULL, "message" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" uuid NOT NULL, CONSTRAINT "PK_eaedfe19f0f765d26afafa85956" PRIMARY KEY ("notification_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("user_id" uuid NOT NULL DEFAULT uuid_generate_v4(), "employee_code" character varying(20) NOT NULL, "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "email" character varying(255) NOT NULL, "password" character varying NOT NULL, "phone" character varying(20), "profile_image" text, "date_of_birth" date, "gender" character varying(10), "address" text, "employee_type" character varying(30) NOT NULL, "joining_date" date NOT NULL, "salary" numeric(12,2), "status" boolean NOT NULL DEFAULT true, "working_hours" numeric(5,2), "overtime_hours" numeric(5,2), "is_overtime" boolean NOT NULL DEFAULT false, "attendance_status" character varying(20) NOT NULL DEFAULT 'Absent', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "designation_id" uuid, "role_id" uuid, "department_id" uuid, "shift_id" uuid, "job_category_id" uuid, CONSTRAINT "UQ_8ae048b57cb451eb306035b1e69" UNIQUE ("employee_code"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_96aac72f1574b88752e9fb00089" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_17022daf3f885f7d35423e9971e" FOREIGN KEY ("permission_id") REFERENCES "permissions"("permission_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "designations" ADD CONSTRAINT "FK_97884615dba807341722aa7aa4b" FOREIGN KEY ("department_id") REFERENCES "departments"("department_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_0bedbcc8d5f9b9ec4979f519597" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_fc40f41a0b3686e8c43ed290d70" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_6d320737541c7c4d2a6f0f9d911" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_fe3e6c3fea2c56aaaad8cedbc20" FOREIGN KEY ("approved_by") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll" ADD CONSTRAINT "FK_33b3121c809973d825ecc9b938f" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_19629e8eb1e6023c4c73e661c82" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_9568a0fda18937f1082a82ecbaf" FOREIGN KEY ("designation_id") REFERENCES "designations"("designation_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_0921d1972cf861d568f5271cd85" FOREIGN KEY ("department_id") REFERENCES "departments"("department_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_586a7696616297adaf104f78b21" FOREIGN KEY ("shift_id") REFERENCES "shifts"("shift_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_1144aa8669db47ec82be24b285e" FOREIGN KEY ("job_category_id") REFERENCES "job_categories"("job_category_id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_1144aa8669db47ec82be24b285e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_586a7696616297adaf104f78b21"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_0921d1972cf861d568f5271cd85"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_9568a0fda18937f1082a82ecbaf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_19629e8eb1e6023c4c73e661c82"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll" DROP CONSTRAINT "FK_33b3121c809973d825ecc9b938f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_fe3e6c3fea2c56aaaad8cedbc20"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_6d320737541c7c4d2a6f0f9d911"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT "FK_fc40f41a0b3686e8c43ed290d70"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT "FK_0bedbcc8d5f9b9ec4979f519597"`,
    );
    await queryRunner.query(
      `ALTER TABLE "designations" DROP CONSTRAINT "FK_97884615dba807341722aa7aa4b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_17022daf3f885f7d35423e9971e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_178199805b901ccd220ab7740ec"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "payroll"`);
    await queryRunner.query(`DROP TABLE "job_categories"`);
    await queryRunner.query(`DROP TABLE "leave_requests"`);
    await queryRunner.query(`DROP TABLE "attendance"`);
    await queryRunner.query(`DROP TABLE "shifts"`);
    await queryRunner.query(`DROP TABLE "departments"`);
    await queryRunner.query(`DROP TABLE "designations"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
  }
}
