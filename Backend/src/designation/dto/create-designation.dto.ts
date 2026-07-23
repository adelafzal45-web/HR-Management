import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateDesignationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;
}
