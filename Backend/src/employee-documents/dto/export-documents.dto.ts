import { IsArray, IsUUID } from 'class-validator';

export class ExportDocumentsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds: string[];
}
