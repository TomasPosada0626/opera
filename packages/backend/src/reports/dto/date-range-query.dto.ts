import { IsDateString, IsOptional } from 'class-validator';

// `to` se compara con < contra la fecha exacta dada (ver reports.service.ts)
// — para incluir un día completo, el llamador debe mandar el inicio del día
// siguiente, no la fecha de ese día a medianoche.
export class DateRangeQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
