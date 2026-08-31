// Genera codigos de seguimiento con el formato PM-{anio}-{secuencial}, ej. PM-2026-0042.
export function buildOrderCode(sequence: number, year = new Date().getFullYear()): string {
  return `PM-${year}-${String(sequence).padStart(4, '0')}`;
}
