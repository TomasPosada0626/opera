import { IsDateString, IsOptional } from 'class-validator';

// Rango semiabierto [from, to) — el llamador compara `to` con `<`, no `<=`,
// contra la fecha exacta dada. Para incluir un día completo, quien llama
// manda el inicio del día siguiente como `to`, no la fecha de ese día a
// medianoche (evita adivinar si "hasta" incluye el día completo o no).
export class DateRangeQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
