import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { SalaryComponentsService } from './salary-components.service';
import { CreateSalaryComponentDto } from './dto/create-salary-component.dto';
import { UpdateSalaryComponentDto } from './dto/update-salary-component.dto';
import { TestFormulaDto } from './dto/test-formula.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Salary Components')
@Controller('salary-components')
export class SalaryComponentsController {
  constructor(
    private readonly salaryComponentsService: SalaryComponentsService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-components.create')
  @ApiOperation({ summary: 'Create a salary component' })
  @ApiBody({ type: CreateSalaryComponentDto })
  @ApiResponse({ status: 201, description: 'Component created.' })
  @ApiResponse({ status: 400, description: 'Validation or formula error.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-components.create permission.',
  })
  @ApiResponse({
    status: 409,
    description: 'A component with that code exists.',
  })
  create(@Body() dto: CreateSalaryComponentDto) {
    return this.salaryComponentsService.create(dto);
  }

  /**
   * The variables a formula may reference — feeds the builder's variable picker.
   * Reads-only reference data, gated by the same view permission as the list.
   */
  @Get('variables')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-components.view')
  @ApiOperation({
    summary: 'List the approved formula variables',
    description:
      'Returns the whitelist of variable names and descriptions a formula may use.',
  })
  @ApiResponse({ status: 200, description: 'Variables retrieved.' })
  listVariables() {
    return this.salaryComponentsService.listVariables();
  }

  /**
   * "Test Rule" (spec §15): evaluate a formula against sample values without
   * saving anything. Uses `payroll.preview` — it is a calculation dry-run, and
   * anyone who can preview a run should be able to test a formula.
   */
  @Post('test-formula')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.preview')
  @ApiOperation({
    summary: 'Test a formula against sample values',
    description:
      'Evaluates the formula with the supplied sample variables (or built-in demo values) and returns the result or a readable error. Persists nothing.',
  })
  @ApiBody({ type: TestFormulaDto })
  @ApiResponse({ status: 200, description: 'Evaluation result.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll.preview permission.',
  })
  testFormula(@Body() dto: TestFormulaDto) {
    return this.salaryComponentsService.testFormula(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-components.view')
  @ApiOperation({ summary: 'List all salary components' })
  @ApiResponse({ status: 200, description: 'Components retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-components.view permission.',
  })
  findAll() {
    return this.salaryComponentsService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-components.view')
  @ApiOperation({ summary: 'Get a salary component by id' })
  @ApiParam({ name: 'id', description: 'Component UUID' })
  @ApiResponse({ status: 200, description: 'Component retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-components.view permission.',
  })
  @ApiResponse({ status: 404, description: 'Component not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salaryComponentsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-components.update')
  @ApiOperation({ summary: 'Update a salary component' })
  @ApiParam({ name: 'id', description: 'Component UUID' })
  @ApiBody({ type: UpdateSalaryComponentDto })
  @ApiResponse({ status: 200, description: 'Component updated.' })
  @ApiResponse({ status: 400, description: 'Validation or formula error.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-components.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Component not found.' })
  @ApiResponse({
    status: 409,
    description: 'A component with that code exists.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalaryComponentDto,
  ) {
    return this.salaryComponentsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-components.delete')
  @ApiOperation({ summary: 'Delete a salary component' })
  @ApiParam({ name: 'id', description: 'Component UUID' })
  @ApiResponse({ status: 200, description: 'Component deleted.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-components.delete permission.',
  })
  @ApiResponse({ status: 404, description: 'Component not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.salaryComponentsService.remove(id);
  }
}
