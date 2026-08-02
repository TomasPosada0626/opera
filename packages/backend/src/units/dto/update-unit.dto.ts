import { IsOptional, MinLength } from 'class-validator';

export class UpdateUnitDto {
  @IsOptional()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @MinLength(1)
  abbreviation?: string;
}
