import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  IsLoginIdentifier,
  NormalizeLoginIdentifier,
} from '../../auth/login-identifier';

export class CreateAdminDto {
  @NormalizeLoginIdentifier()
  @IsLoginIdentifier()
  @MaxLength(254)
  email: string;

  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @MaxLength(200)
  name: string;
}
