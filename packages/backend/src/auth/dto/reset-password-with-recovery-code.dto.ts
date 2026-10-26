import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  IsLoginIdentifier,
  NormalizeLoginIdentifier,
} from '../login-identifier';

export class ResetPasswordWithRecoveryCodeDto {
  @NormalizeLoginIdentifier()
  @IsLoginIdentifier()
  @MaxLength(254)
  email: string;

  // Formato libre a propósito (con o sin guiones/espacios, minúsculas):
  // normalizeRecoveryCode() lo lleva a la forma canónica antes de comparar.
  @IsString()
  @MinLength(16)
  @MaxLength(40)
  recoveryCode: string;

  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}
