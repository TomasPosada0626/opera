import { MinLength } from 'class-validator';

export class CreateUnitDto {
  @MinLength(2)
  name: string;

  @MinLength(1)
  abbreviation: string;
}
