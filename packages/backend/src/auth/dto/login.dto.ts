import { MaxLength, MinLength } from 'class-validator';
import {
  IsLoginIdentifier,
  NormalizeLoginIdentifier,
} from '../login-identifier';

export class LoginDto {
  // Correo o nombre de usuario (ver login-identifier.ts).
  @NormalizeLoginIdentifier()
  @IsLoginIdentifier()
  @MaxLength(254)
  email: string;

  @MinLength(8)
  @MaxLength(128)
  password: string;
}
