import { MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @MinLength(2)
  @MaxLength(200)
  name: string;
}
