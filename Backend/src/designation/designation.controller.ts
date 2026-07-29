import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { DesignationService } from './designation.service';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@Controller('designations')
export class DesignationController {
  constructor(private readonly designationService: DesignationService) {}

  @Post()
  @UseGuards(PermissionGuard)
@RequirePermission('designation.create')
  create(@Body() createDesignationDto: CreateDesignationDto) {
    return this.designationService.create(createDesignationDto);
  }

  @Get()
  @UseGuards(PermissionGuard)
@RequirePermission('designation.view')
  findAll() {
    return this.designationService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
@RequirePermission('designation.view')
  findOne(@Param('id') id: string) {
    return this.designationService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
@RequirePermission('designation.update')
  update(
    @Param('id') id: string,
    @Body() updateDesignationDto: UpdateDesignationDto,
  ) {
    return this.designationService.update(id, updateDesignationDto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
@RequirePermission('designation.delete')
  remove(@Param('id') id: string) {
    return this.designationService.remove(id);
  }
}
