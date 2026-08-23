import { MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}
