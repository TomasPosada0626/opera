import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAdminDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @MaxLength(200)
  name: string;
}
