import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { TaxType } from './enums/tax-type.enum';

@Entity('tax_slabs')
@Index(['tax_type', 'min_income'])
export class TaxSlab {
  // ==========================================
  // PRIMARY KEY
  // ==========================================

  @ApiProperty({
    example:
      'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  })
  @PrimaryGeneratedColumn('uuid')
  tax_slab_id!: string;

  // ==========================================
  // TAX TYPE
  // ==========================================

  @ApiProperty({
    enum: TaxType,
    example: TaxType.MONTHLY,
  })
  @Column({
    type: 'enum',
    enum: TaxType,
  })
  tax_type!: TaxType;

  // ==========================================
  // INCOME RANGE
  // ==========================================

  @ApiProperty({
    example: 50000,
    description:
      'Minimum income for this tax slab.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  min_income!: number;

  @ApiPropertyOptional({
    example: 100000,
    description:
      'Maximum income for this slab. Null means no upper limit.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  max_income?: number | null;

  // ==========================================
  // TAX RATE
  // ==========================================

  @ApiProperty({
    example: 5,
    description:
      'Tax percentage applied to the applicable income.',
  })
  @Column({
    type: 'numeric',
    precision: 7,
    scale: 4,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  tax_rate!: number;

  // ==========================================
  // FIXED TAX
  // ==========================================

  @ApiProperty({
    example: 0,
    description:
      'Fixed tax amount added before percentage calculation.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  fixed_tax!: number;

  // ==========================================
  // DESCRIPTION
  // ==========================================

  @ApiPropertyOptional({
    example:
      'Monthly tax slab for middle-income employees.',
  })
  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string | null;

  // ==========================================
  // ACTIVE
  // ==========================================

  @ApiProperty({
    example: true,
  })
  @Column({
    type: 'boolean',
    default: true,
  })
  is_active!: boolean;

  // ==========================================
  // TIMESTAMPS
  // ==========================================

  @ApiProperty({
    example:
      '2026-08-01T10:00:00.000Z',
  })
  @CreateDateColumn({
    type: 'timestamp',
  })
  created_at!: Date;

  @ApiProperty({
    example:
      '2026-08-01T10:00:00.000Z',
  })
  @UpdateDateColumn({
    type: 'timestamp',
  })
  updated_at!: Date;
}