import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
  TableUnique,
} from 'typeorm';

export class CreatePayrollAttendanceLeaveTables1788900000000
  implements MigrationInterface
{
  name = 'CreatePayrollAttendanceLeaveTables1788900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================================
    // ENUM TYPES
    // ============================================================

    await queryRunner.query(`
      CREATE TYPE "loan_status_enum" AS ENUM (
        'PENDING',
        'ACTIVE',
        'COMPLETED',
        'REJECTED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "loan_installment_status_enum" AS ENUM (
        'PENDING',
        'PAID',
        'SKIPPED',
        'OVERDUE'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "reimbursement_status_enum" AS ENUM (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'PAID',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "tax_type_enum" AS ENUM (
        'MONTHLY',
        'YEARLY'
      )
    `);

    // ============================================================
    // LEAVE TYPES
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'leave_types',
        columns: [
          {
            name: 'leave_type_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isUnique: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_paid',
            type: 'boolean',
            default: true,
          },
          {
            name: 'max_days_per_year',
            type: 'integer',
            default: 0,
          },
          {
            name: 'carry_forward_allowed',
            type: 'boolean',
            default: false,
          },
          {
            name: 'max_carry_forward_days',
            type: 'integer',
            default: 0,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // ============================================================
    // USER LEAVE BALANCES
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'user_leave_balances',
        columns: [
          {
            name: 'user_leave_balance_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'leave_type_id',
            type: 'uuid',
          },
          {
            name: 'allocated_days',
            type: 'numeric',
            precision: 6,
            scale: 2,
            default: 0,
          },
          {
            name: 'used_days',
            type: 'numeric',
            precision: 6,
            scale: 2,
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'user_leave_balances',
      new TableForeignKey({
        name: 'FK_user_leave_balances_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_leave_balances',
      new TableForeignKey({
        name: 'FK_user_leave_balances_leave_type',
        columnNames: ['leave_type_id'],
        referencedTableName: 'leave_types',
        referencedColumnNames: ['leave_type_id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createUniqueConstraint(
      'user_leave_balances',
      new TableUnique({
        name: 'UQ_user_leave_balance_user_leave_type',
        columnNames: ['user_id', 'leave_type_id'],
      }),
    );

    // ============================================================
    // ATTENDANCE
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'attendance',
        columns: [
          {
            name: 'attendance_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'attendance_date',
            type: 'date',
          },
          {
            name: 'check_in',
            type: 'time',
            isNullable: true,
          },
          {
            name: 'check_out',
            type: 'time',
            isNullable: true,
          },
          {
            name: 'working_hours',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'attendance_status',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'overtime_hours',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'is_overtime',
            type: 'boolean',
            default: false,
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'shift_id',
            type: 'uuid',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'attendance',
      new TableForeignKey({
        name: 'FK_attendance_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'attendance',
      new TableForeignKey({
        name: 'FK_attendance_shift',
        columnNames: ['shift_id'],
        referencedTableName: 'shifts',
        referencedColumnNames: ['shift_id'],
        onDelete: 'SET NULL',
      }),
    );

    // ============================================================
    // LEAVE REQUESTS
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'leave_requests',
        columns: [
          {
            name: 'leave_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'leave_type',
            type: 'varchar',
            length: '30',
          },
          {
            name: 'leave_type_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'start_date',
            type: 'date',
          },
          {
            name: 'end_date',
            type: 'date',
          },
          {
            name: 'is_half_day',
            type: 'boolean',
            default: false,
          },
          {
            name: 'duration_type',
            type: 'varchar',
            length: '20',
            default: "'Full Day'",
          },
          {
            name: 'days_count',
            type: 'numeric',
            precision: 6,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'attachment_path',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'attachment_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'approval_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'rejection_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'cancellation_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'Pending'",
          },
          {
            name: 'applied_date',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'approved_date',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'approved_by',
            type: 'uuid',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'leave_requests',
      new TableForeignKey({
        name: 'FK_leave_requests_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'leave_requests',
      new TableForeignKey({
        name: 'FK_leave_requests_leave_type',
        columnNames: ['leave_type_id'],
        referencedTableName: 'leave_types',
        referencedColumnNames: ['leave_type_id'],
        onDelete: 'NO ACTION',
      }),
    );

    await queryRunner.createForeignKey(
      'leave_requests',
      new TableForeignKey({
        name: 'FK_leave_requests_approved_by',
        columnNames: ['approved_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'NO ACTION',
      }),
    );

    // ============================================================
    // TAX SLABS
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'tax_slabs',
        columns: [
          {
            name: 'tax_slab_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'tax_type',
            type: 'enum',
            enumName: 'tax_type_enum',
            enum: ['MONTHLY', 'YEARLY'],
          },
          {
            name: 'min_income',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },
          {
            name: 'max_income',
            type: 'numeric',
            precision: 14,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'tax_rate',
            type: 'numeric',
            precision: 7,
            scale: 4,
            default: 0,
          },
          {
            name: 'fixed_tax',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'tax_slabs',
      new TableIndex({
        name: 'IDX_tax_slabs_tax_type_min_income',
        columnNames: ['tax_type', 'min_income'],
      }),
    );

    // ============================================================
    // PAYROLLS
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'payrolls',
        columns: [
          {
            name: 'payroll_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },

          {
            name: 'user_id',
            type: 'uuid',
          },

          {
            name: 'period_start',
            type: 'date',
          },

          {
            name: 'period_end',
            type: 'date',
          },

          {
            name: 'salary_days',
            type: 'smallint',
            default: 30,
          },

          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'DRAFT'",
          },

          {
            name: 'generated_at',
            type: 'timestamp',
            isNullable: true,
          },

          {
            name: 'approved_at',
            type: 'timestamp',
            isNullable: true,
          },

          {
            name: 'approved_by',
            type: 'uuid',
            isNullable: true,
          },

          {
            name: 'approved_by_id',
            type: 'uuid',
            isNullable: true,
          },

          {
            name: 'locked_at',
            type: 'timestamp',
            isNullable: true,
          },

          {
            name: 'locked_by',
            type: 'uuid',
            isNullable: true,
          },

          {
            name: 'locked_by_id',
            type: 'uuid',
            isNullable: true,
          },

          // Salary snapshot
          {
            name: 'total_salary',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          {
            name: 'basic_salary',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          {
            name: 'compute_allowance',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          {
            name: 'medical_allowance',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          // Attendance / Leave
          {
            name: 'working_days',
            type: 'numeric',
            precision: 6,
            scale: 2,
            default: 22,
          },

          {
            name: 'paid_weekend_days',
            type: 'numeric',
            precision: 6,
            scale: 2,
            default: 8,
          },

          {
            name: 'unpaid_leave_days',
            type: 'numeric',
            precision: 6,
            scale: 2,
            default: 0,
          },

          {
            name: 'unauthorized_absence_days',
            type: 'numeric',
            precision: 6,
            scale: 2,
            default: 0,
          },

          {
            name: 'half_days',
            type: 'numeric',
            precision: 6,
            scale: 2,
            default: 0,
          },

          {
            name: 'weekend_work_days',
            type: 'numeric',
            precision: 6,
            scale: 2,
            default: 0,
          },

          {
            name: 'public_holiday_work_days',
            type: 'numeric',
            precision: 6,
            scale: 2,
            default: 0,
          },

          // Earnings
          {
            name: 'weekend_work_earning',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'public_holiday_work_earning',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'commission',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'bonus',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'approved_reimbursement',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          // Deductions
          {
            name: 'unpaid_leave_deduction',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'unauthorized_absence_deduction',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'half_day_deduction',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'provident_fund',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'loan_deduction',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'government_tax',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          // Taxable income
          {
            name: 'taxable_income',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          // Totals
          {
            name: 'gross_earnings',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'total_deductions',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'net_salary',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'daily_basic_salary',
            type: 'numeric',
            precision: 14,
            scale: 2,
            default: 0,
          },

          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },

          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },

          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'payrolls',
      new TableForeignKey({
        name: 'FK_payrolls_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'payrolls',
      new TableForeignKey({
        name: 'FK_payrolls_approved_by',
        columnNames: ['approved_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'payrolls',
      new TableForeignKey({
        name: 'FK_payrolls_locked_by',
        columnNames: ['locked_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createIndex(
      'payrolls',
      new TableIndex({
        name: 'IDX_payrolls_user_period',
        columnNames: ['user_id', 'period_start', 'period_end'],
        isUnique: true,
      }),
    );

    // ============================================================
    // PAYROLL ITEMS
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'payroll_items',
        columns: [
          {
            name: 'payroll_item_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },

          {
            name: 'payroll_id',
            type: 'uuid',
          },

          {
            name: 'item_type',
            type: 'varchar',
            length: '40',
          },

          {
            name: 'description',
            type: 'varchar',
            length: '255',
          },

          {
            name: 'amount',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          {
            name: 'category',
            type: 'varchar',
            length: '20',
          },

          {
            name: 'is_taxable',
            type: 'boolean',
            default: true,
          },

          {
            name: 'quantity',
            type: 'numeric',
            precision: 8,
            scale: 2,
            isNullable: true,
          },

          {
            name: 'rate',
            type: 'numeric',
            precision: 14,
            scale: 2,
            isNullable: true,
          },

          {
            name: 'source',
            type: 'varchar',
            length: '30',
            isNullable: true,
          },

          {
            name: 'source_id',
            type: 'uuid',
            isNullable: true,
          },

          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },

          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'payroll_items',
      new TableForeignKey({
        name: 'FK_payroll_items_payroll',
        columnNames: ['payroll_id'],
        referencedTableName: 'payrolls',
        referencedColumnNames: ['payroll_id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'payroll_items',
      new TableIndex({
        name: 'IDX_payroll_items_payroll_item_type',
        columnNames: ['payroll_id', 'item_type'],
      }),
    );

    // ============================================================
    // PAYROLL ADJUSTMENTS
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'payroll_adjustments',
        columns: [
          {
            name: 'payroll_adjustment_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },

          {
            name: 'payroll_id',
            type: 'uuid',
          },

          {
            name: 'adjustment_type',
            type: 'varchar',
            length: '30',
          },

          {
            name: 'amount',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          {
            name: 'is_taxable',
            type: 'boolean',
            default: true,
          },

          {
            name: 'reason',
            type: 'text',
          },

          {
            name: 'created_by',
            type: 'uuid',
          },

          {
            name: 'created_by_id',
            type: 'uuid',
          },

          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'payroll_adjustments',
      new TableForeignKey({
        name: 'FK_payroll_adjustments_payroll',
        columnNames: ['payroll_id'],
        referencedTableName: 'payrolls',
        referencedColumnNames: ['payroll_id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'payroll_adjustments',
      new TableForeignKey({
        name: 'FK_payroll_adjustments_created_by',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createIndex(
      'payroll_adjustments',
      new TableIndex({
        name: 'IDX_payroll_adjustments_payroll_type',
        columnNames: ['payroll_id', 'adjustment_type'],
      }),
    );

    // ============================================================
    // PAYROLL AUDIT LOGS
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'payroll_audit_logs',
        columns: [
          {
            name: 'payroll_audit_log_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },

          {
            name: 'payroll_id',
            type: 'uuid',
          },

          {
            name: 'actor_id',
            type: 'uuid',
          },

          {
            name: 'action',
            type: 'varchar',
            length: '50',
          },

          {
            name: 'field_name',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },

          {
            name: 'old_value',
            type: 'jsonb',
            isNullable: true,
          },

          {
            name: 'new_value',
            type: 'jsonb',
            isNullable: true,
          },

          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },

          {
            name: 'ip_address',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },

          {
            name: 'user_agent',
            type: 'text',
            isNullable: true,
          },

          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'payroll_audit_logs',
      new TableForeignKey({
        name: 'FK_payroll_audit_logs_payroll',
        columnNames: ['payroll_id'],
        referencedTableName: 'payrolls',
        referencedColumnNames: ['payroll_id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'payroll_audit_logs',
      new TableForeignKey({
        name: 'FK_payroll_audit_logs_actor',
        columnNames: ['actor_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createIndex(
      'payroll_audit_logs',
      new TableIndex({
        name: 'IDX_payroll_audit_logs_payroll_created',
        columnNames: ['payroll_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'payroll_audit_logs',
      new TableIndex({
        name: 'IDX_payroll_audit_logs_actor_created',
        columnNames: ['actor_id', 'created_at'],
      }),
    );

    // ============================================================
    // LOANS
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'loans',
        columns: [
          {
            name: 'loan_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },

          {
            name: 'user_id',
            type: 'uuid',
          },

          {
            name: 'principal_amount',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          {
            name: 'installment_amount',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          {
            name: 'total_installments',
            type: 'smallint',
          },

          {
            name: 'paid_installments',
            type: 'smallint',
            default: 0,
          },

          {
            name: 'remaining_amount',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          {
            name: 'start_date',
            type: 'date',
          },

          {
            name: 'end_date',
            type: 'date',
            isNullable: true,
          },

          {
            name: 'status',
            type: 'enum',
            enumName: 'loan_status_enum',
            enum: [
              'PENDING',
              'ACTIVE',
              'COMPLETED',
              'REJECTED',
              'CANCELLED',
            ],
            default: "'ACTIVE'",
          },

          {
            name: 'reason',
            type: 'text',
            isNullable: true,
          },

          {
            name: 'approved_by',
            type: 'uuid',
            isNullable: true,
          },

          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },

          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'loans',
      new TableForeignKey({
        name: 'FK_loans_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'loans',
      new TableForeignKey({
        name: 'FK_loans_approved_by',
        columnNames: ['approved_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createIndex(
      'loans',
      new TableIndex({
        name: 'IDX_loans_user_status',
        columnNames: ['user_id', 'status'],
      }),
    );

    // ============================================================
    // LOAN INSTALLMENTS
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'loan_installments',
        columns: [
          {
            name: 'loan_installment_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },

          {
            name: 'loan_id',
            type: 'uuid',
          },

          {
            name: 'installment_number',
            type: 'smallint',
          },

          {
            name: 'amount',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          {
            name: 'due_date',
            type: 'date',
          },

          {
            name: 'status',
            type: 'enum',
            enumName: 'loan_installment_status_enum',
            enum: [
              'PENDING',
              'PAID',
              'SKIPPED',
              'OVERDUE',
            ],
            default: "'PENDING'",
          },

          {
            name: 'paid_at',
            type: 'timestamp',
            isNullable: true,
          },

          {
            name: 'skip_reason',
            type: 'text',
            isNullable: true,
          },

          {
            name: 'skipped_at',
            type: 'timestamp',
            isNullable: true,
          },

          {
            name: 'skipped_by_id',
            type: 'uuid',
            isNullable: true,
          },

          {
            name: 'payroll_id',
            type: 'uuid',
            isNullable: true,
          },

          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },

          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'loan_installments',
      new TableForeignKey({
        name: 'FK_loan_installments_loan',
        columnNames: ['loan_id'],
        referencedTableName: 'loans',
        referencedColumnNames: ['loan_id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'loan_installments',
      new TableForeignKey({
        name: 'FK_loan_installments_skipped_by',
        columnNames: ['skipped_by_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'loan_installments',
      new TableForeignKey({
        name: 'FK_loan_installments_payroll',
        columnNames: ['payroll_id'],
        referencedTableName: 'payrolls',
        referencedColumnNames: ['payroll_id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createIndex(
      'loan_installments',
      new TableIndex({
        name: 'IDX_loan_installments_status_due_date',
        columnNames: ['status', 'due_date'],
      }),
    );

    await queryRunner.createIndex(
      'loan_installments',
      new TableIndex({
        name: 'UQ_loan_installments_loan_number',
        columnNames: ['loan_id', 'installment_number'],
        isUnique: true,
      }),
    );

    // ============================================================
    // REIMBURSEMENTS
    // ============================================================

    await queryRunner.createTable(
      new Table({
        name: 'reimbursements',
        columns: [
          {
            name: 'reimbursement_id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },

          {
            name: 'user_id',
            type: 'uuid',
          },

          {
            name: 'amount',
            type: 'numeric',
            precision: 14,
            scale: 2,
          },

          {
            name: 'reimbursement_type',
            type: 'varchar',
            length: '50',
          },

          {
            name: 'description',
            type: 'text',
          },

          {
            name: 'expense_date',
            type: 'date',
          },

          {
            name: 'attachment_path',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },

          {
            name: 'attachment_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },

          {
            name: 'status',
            type: 'enum',
            enumName: 'reimbursement_status_enum',
            enum: [
              'PENDING',
              'APPROVED',
              'REJECTED',
              'PAID',
              'CANCELLED',
            ],
            default: "'PENDING'",
          },

          {
            name: 'approval_reason',
            type: 'text',
            isNullable: true,
          },

          {
            name: 'rejection_reason',
            type: 'text',
            isNullable: true,
          },

          {
            name: 'approved_by',
            type: 'uuid',
            isNullable: true,
          },

          {
            name: 'approved_by_id',
            type: 'uuid',
            isNullable: true,
          },

          {
            name: 'approved_at',
            type: 'timestamp',
            isNullable: true,
          },

          {
            name: 'payroll_id',
            type: 'uuid',
            isNullable: true,
          },

          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },

          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'reimbursements',
      new TableForeignKey({
        name: 'FK_reimbursements_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.createForeignKey(
      'reimbursements',
      new TableForeignKey({
        name: 'FK_reimbursements_approved_by',
        columnNames: ['approved_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['user_id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createIndex(
      'reimbursements',
      new TableIndex({
        name: 'IDX_reimbursements_user_status',
        columnNames: ['user_id', 'status'],
      }),
    );
  }

  // ==============================================================
  // DOWN
  // ==============================================================

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove tables in reverse dependency order.

    await queryRunner.dropTable('reimbursements', true);
    await queryRunner.dropTable('loan_installments', true);
    await queryRunner.dropTable('loans', true);

    await queryRunner.dropTable('payroll_audit_logs', true);
    await queryRunner.dropTable('payroll_adjustments', true);
    await queryRunner.dropTable('payroll_items', true);
    await queryRunner.dropTable('payrolls', true);

    await queryRunner.dropTable('tax_slabs', true);

    await queryRunner.dropTable('leave_requests', true);
    await queryRunner.dropTable('attendance', true);
    await queryRunner.dropTable('user_leave_balances', true);
    await queryRunner.dropTable('leave_types', true);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "reimbursement_status_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "loan_installment_status_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "loan_status_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "tax_type_enum"
    `);
  }
}