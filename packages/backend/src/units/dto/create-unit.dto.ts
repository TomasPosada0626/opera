import { MaxLength, MinLength } from 'class-validator';

export class CreateUnitDto {
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @MinLength(1)
  @MaxLength(20)
  abbreviation: string;
}
