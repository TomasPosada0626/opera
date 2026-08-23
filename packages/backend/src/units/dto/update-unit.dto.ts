import { IsOptional, MaxLength, MinLength } from 'class-validator';

export class UpdateUnitDto {
  @IsOptional()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @MinLength(1)
  @MaxLength(20)
  abbreviation?: string;
}
