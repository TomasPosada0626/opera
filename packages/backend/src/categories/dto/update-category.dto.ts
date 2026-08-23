import { IsOptional, MaxLength, MinLength } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @MinLength(2)
  @MaxLength(200)
  name?: string;
}
