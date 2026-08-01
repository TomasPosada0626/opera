import { MinLength } from 'class-validator';

export class ResetPasswordDto {
  @MinLength(8)
  newPassword: string;
}
