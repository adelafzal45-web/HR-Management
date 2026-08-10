import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TaxSlab } from './tax-slab.entity';
import { TaxSlabDto } from './dto/tax-slab.dto';

import { TaxType } from './enums/tax-type.enum';

@Injectable()
export class TaxService {
  constructor(
    @InjectRepository(TaxSlab)
    private readonly taxSlabRepository:
      Repository<TaxSlab>,
  ) {}

  // ==========================================
  // CREATE
  // ==========================================

  async create(dto: TaxSlabDto) {
    this.validateSlab(dto);

    const slab =
      this.taxSlabRepository.create({
        ...dto,
        fixed_tax: dto.fixed_tax ?? 0,
        is_active:
          dto.is_active ?? true,
      });

    return this.taxSlabRepository.save(slab);
  }

  // ==========================================
  // VALIDATION
  // ==========================================

  private validateSlab(dto: TaxSlabDto) {
    if (
      dto.max_income !== undefined &&
      dto.max_income !== null &&
      dto.max_income < dto.min_income
    ) {
      throw new BadRequestException(
        'Maximum income cannot be lower than minimum income.',
      );
    }

    if (dto.tax_rate < 0) {
      throw new BadRequestException(
        'Tax rate cannot be negative.',
      );
    }
  }

  // ==========================================
  // GET ALL
  // ==========================================

  async findAll(
    taxType?: TaxType,
  ) {
    const query =
      this.taxSlabRepository
        .createQueryBuilder('slab');

    if (taxType) {
      query.where(
        'slab.tax_type = :taxType',
        { taxType },
      );
    }

    return query
      .orderBy(
        'slab.min_income',
        'ASC',
      )
      .getMany();
  }

  // ==========================================
  // GET ONE
  // ==========================================

  async findOne(id: string) {
    const slab =
      await this.taxSlabRepository.findOne({
        where: {
          tax_slab_id: id,
        },
      });

    if (!slab) {
      throw new NotFoundException(
        'Tax slab not found.',
      );
    }

    return slab;
  }

  // ==========================================
  // UPDATE
  // ==========================================

  async update(
    id: string,
    dto: TaxSlabDto,
  ) {
    const slab =
      await this.findOne(id);

    this.validateSlab(dto);

    Object.assign(slab, {
      ...dto,
      fixed_tax:
        dto.fixed_tax ?? slab.fixed_tax,
      is_active:
        dto.is_active ?? slab.is_active,
    });

    return this.taxSlabRepository.save(
      slab,
    );
  }

  // ==========================================
  // FIND SLAB FOR INCOME
  // ==========================================

  async findSlab(
    income: number,
    taxType: TaxType = TaxType.MONTHLY,
  ) {
    const slab =
      await this.taxSlabRepository
        .createQueryBuilder('slab')
        .where(
          'slab.tax_type = :taxType',
          { taxType },
        )
        .andWhere(
          'slab.is_active = true',
        )
        .andWhere(
          'slab.min_income <= :income',
          { income },
        )
        .andWhere(
          '(slab.max_income IS NULL OR slab.max_income >= :income)',
          { income },
        )
        .orderBy(
          'slab.min_income',
          'DESC',
        )
        .getOne();

    return slab;
  }

  // ==========================================
  // CALCULATE TAX
  // ==========================================

  async calculateTax(
    taxableIncome: number,
    taxType: TaxType = TaxType.MONTHLY,
  ) {
    if (taxableIncome <= 0) {
      return 0;
    }

    const slab = await this.findSlab(
      taxableIncome,
      taxType,
    );

    if (!slab) {
      return 0;
    }

    const percentageTax =
      taxableIncome *
      (slab.tax_rate / 100);

    return Number(
      (
        slab.fixed_tax +
        percentageTax
      ).toFixed(2),
    );
  }
}