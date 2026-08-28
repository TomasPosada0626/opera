import { IsEmail, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordWithCodeDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  // Exactamente 6 dígitos — mismo formato que MailService.sendPasswordResetCode genera.
  @Matches(/^\d{6}$/, { message: 'code debe ser un código de 6 dígitos' })
  code: string;

  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}
