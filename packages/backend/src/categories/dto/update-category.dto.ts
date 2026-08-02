import { IsOptional, MinLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @MinLength(2)
  name?: string;
}
