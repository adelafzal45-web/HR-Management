import { IsArray, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Categories arrive alongside the files in the same multipart body.
 *
 * Multipart has no notion of an array, so a single-file upload sends one plain
 * string and a multi-file upload sends a repeated field, which Express surfaces
 * as `string[]`. Both are normalised to an array here so the service only ever
 * deals with one shape.
 */
export class UploadDocumentsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
  })
  categories: string[] = [];
}
