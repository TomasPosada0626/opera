import { MinLength } from 'class-validator';

export class CreateCategoryDto {
  @MinLength(2)
  name: string;
}
