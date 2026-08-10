import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { TaxService } from './tax.service';
import { TaxSlabDto } from './dto/tax-slab.dto';
import { TaxType } from './enums/tax-type.enum';

@ApiTags('Tax')
@ApiBearerAuth()
@Controller('tax')
export class TaxController {
  constructor(
    private readonly taxService: TaxService,
  ) {}

  @Post('slabs')
  @ApiOperation({
    summary: 'Create tax slab',
  })
  async create(
    @Body() dto: TaxSlabDto,
  ) {
    return this.taxService.create(dto);
  }

  @Get('slabs')
  @ApiOperation({
    summary: 'Get tax slabs',
  })
  @ApiQuery({
    name: 'tax_type',
    required: false,
    enum: TaxType,
  })
  async findAll(
    @Query('tax_type')
    taxType?: TaxType,
  ) {
    return this.taxService.findAll(
      taxType,
    );
  }

  @Get('slabs/:id')
  @ApiOperation({
    summary: 'Get tax slab',
  })
  @ApiParam({
    name: 'id',
  })
  async findOne(
    @Param('id') id: string,
  ) {
    return this.taxService.findOne(id);
  }

  @Patch('slabs/:id')
  @ApiOperation({
    summary: 'Update tax slab',
  })
  @ApiParam({
    name: 'id',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: TaxSlabDto,
  ) {
    return this.taxService.update(
      id,
      dto,
    );
  }
}