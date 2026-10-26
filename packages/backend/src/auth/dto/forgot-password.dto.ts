import { IsEmail, MaxLength } from 'class-validator';
import { NormalizeLoginIdentifier } from '../login-identifier';

export class ForgotPasswordDto {
  @NormalizeLoginIdentifier()
  @IsEmail()
  @MaxLength(254)
  email: string;
}
