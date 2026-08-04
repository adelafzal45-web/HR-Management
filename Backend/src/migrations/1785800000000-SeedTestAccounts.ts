import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcryptjs';

/**
 * Seeds one login per role so the 3-role appraisal flow can actually be
 * exercised. SeedThreeRoleRbac1785600000000 creates the roles, permissions and
 * grants but zero users, and there is no public register endpoint — AuthController
 * exposes only `login` and `me`, and POST /users sits behind the global
 * JwtAuthGuard. So without this migration there is no way to obtain a first token.
 *
 * The Team Lead and the Employee are deliberately put in the SAME department:
 * with no users.manager_id column, department co-membership is the only authority
 * signal the facade has (appraisal-facade.service.ts), so a Lead in a different
 * department would get an empty /appraisal/my-team and a 403 from
 * POST /appraisal/evaluate/:id.
 *
 * Idempotent: ON CONFLICT on the UNIQUE columns (department_name, title, email).
 * Passwords are bcrypt-hashed; AuthService.validateUser compares with bcrypt when
 * the stored value starts with "$2".
 */
export class SeedTestAccounts1785800000000 implements MigrationInterface {
  name = 'SeedTestAccounts1785800000000';

  private static readonly DEPARTMENT = 'Engineering';
  private static readonly DESIGNATION = 'Software Engineer';

  /** [email, first, last, employee_code, role_name, in the seeded department?] */
  private static readonly USERS: Array<
    [string, string, string, string, string, boolean]
  > = [
    ['hr.admin@hrms.local', 'Hira', 'Admin', 'EMP-HR-001', 'HR Admin', false],
    ['team.lead@hrms.local', 'Tariq', 'Lead', 'EMP-TL-001', 'Team Lead', true],
    ['employee@hrms.local', 'Erum', 'Employee', 'EMP-EM-001', 'Employee', true],
  ];

  private static readonly PASSWORD = 'Password@123';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dept = SeedTestAccounts1785800000000.DEPARTMENT;
    const title = SeedTestAccounts1785800000000.DESIGNATION;

    await queryRunner.query(
      `INSERT INTO "departments" ("department_name", "description")
       VALUES ($1, $2)
       ON CONFLICT ("department_name") DO NOTHING`,
      [dept, 'Seeded department for the appraisal test accounts'],
    );

    // designations.department_id is NOT NULL, so the department must exist first.
    await queryRunner.query(
      `INSERT INTO "designations" ("title", "department_id")
       SELECT $1, d."department_id"
       FROM "departments" d
       WHERE d."department_name" = $2
       ON CONFLICT ("title") DO NOTHING`,
      [title, dept],
    );

    const hash = bcrypt.hashSync(SeedTestAccounts1785800000000.PASSWORD, 10);

    for (const [
      email,
      firstName,
      lastName,
      code,
      roleName,
      inDepartment,
    ] of SeedTestAccounts1785800000000.USERS) {
      await queryRunner.query(
        `INSERT INTO "users" (
           "employee_code", "first_name", "last_name", "email", "password",
           "employee_type", "joining_date", "status",
           "role_id", "department_id", "designation_id"
         )
         VALUES (
           $1, $2, $3, $4, $5,
           'Full-Time', CURRENT_DATE, true,
           (SELECT "role_id" FROM "roles" WHERE "role_name" = $6),
           CASE WHEN $7::boolean THEN (SELECT "department_id" FROM "departments" WHERE "department_name" = $8) END,
           CASE WHEN $7::boolean THEN (SELECT "designation_id" FROM "designations" WHERE "title" = $9) END
         )
         ON CONFLICT ("email") DO NOTHING`,
        [
          code,
          firstName,
          lastName,
          email,
          hash,
          roleName,
          inDepartment,
          dept,
          title,
        ],
      );

      // If the row already existed (a rerun, or a hand-made account with the same
      // email), still make sure it carries the role this seed is about — otherwise
      // a half-set-up account silently keeps failing the permission checks.
      await queryRunner.query(
        `UPDATE "users"
         SET "role_id" = (SELECT "role_id" FROM "roles" WHERE "role_name" = $2)
         WHERE "email" = $1 AND "role_id" IS NULL`,
        [email, roleName],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const emails = SeedTestAccounts1785800000000.USERS.map(([e]) => e);

    await queryRunner.query(
      `DELETE FROM "users" WHERE "email" = ANY($1::varchar[])`,
      [emails],
    );

    // Only drop the designation/department if nothing else came to depend on them.
    await queryRunner.query(
      `DELETE FROM "designations" d
       WHERE d."title" = $1
         AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."designation_id" = d."designation_id")`,
      [SeedTestAccounts1785800000000.DESIGNATION],
    );

    await queryRunner.query(
      `DELETE FROM "departments" d
       WHERE d."department_name" = $1
         AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."department_id" = d."department_id")
         AND NOT EXISTS (SELECT 1 FROM "designations" g WHERE g."department_id" = d."department_id")`,
      [SeedTestAccounts1785800000000.DEPARTMENT],
    );
  }
}
