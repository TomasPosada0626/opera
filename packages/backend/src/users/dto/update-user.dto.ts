import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  IsLoginIdentifier,
  NormalizeLoginIdentifier,
} from '../../auth/login-identifier';

export class UpdateUserDto {
  @IsOptional()
  @NormalizeLoginIdentifier()
  @IsLoginIdentifier()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}
