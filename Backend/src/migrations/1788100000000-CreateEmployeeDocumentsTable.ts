import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateEmployeeDocumentsTable1788100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'employee_documents',
        columns: [
          {
            name: 'document_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'employeeId',
            type: 'uuid',
          },
          {
            name: 'category',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'original_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'stored_name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'mime_type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'size_bytes',
            type: 'int',
          },
          {
            name: 'uploaded_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'uploaded_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'employee_documents',
      new TableForeignKey({
        columnNames: ['employeeId'],
        referencedColumnNames: ['user_id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.query(
      `CREATE INDEX "idx_employee_documents_employee" ON "employee_documents" ("employeeId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_employee_documents_employee"`,
    );
    await queryRunner.dropTable('employee_documents');
  }
}
