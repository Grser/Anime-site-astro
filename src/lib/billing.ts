import db from './db';

export type PeriodoSuscripcion = 'mensual' | 'anual';

export const normalizePeriodo = (value: unknown): PeriodoSuscripcion => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw.includes('anual') || raw === 'year' || raw === 'yearly' || raw === 'anio') return 'anual';
  return 'mensual';
};

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

export const formatPeriodo = (periodo: PeriodoSuscripcion): string =>
  periodo === 'anual' ? 'Anual' : 'Mensual';

/** Fecha de fin del período de facturación, dada su fecha de inicio. */
export const computePeriodEnd = (start: Date, periodo: PeriodoSuscripcion): Date => {
  const end = new Date(start.getTime());
  if (periodo === 'anual') end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
};

/** Formatea una Date como YYYY-MM-DD para columnas DATE. */
export const toDateColumn = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Formatea una Date como DATETIME de MySQL. */
export const toDateTimeColumn = (date: Date): string =>
  `${toDateColumn(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/**
 * Genera un número de factura único con prefijo CV-<AÑO>-<SECUENCIA>.
 * No consulta DB; usa timestamp + 4 dígitos random para evitar colisión. El
 * UNIQUE en la tabla cubre la carrera (si colisiona, reintenta el caller).
 */
export const generateInvoiceNumber = (date = new Date()): string => {
  const year = date.getFullYear();
  const seq = `${date.getTime().toString(36).toUpperCase().slice(-6)}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  return `CV-${year}-${seq}`;
};

export interface IssueInvoiceInput {
  usuarioId: number;
  planNombre: string;
  periodo: PeriodoSuscripcion;
  monto: number;
  moneda?: string;
  metodoPago?: string;
  /** Fecha de inicio del período (default: ahora). */
  periodoInicio?: Date;
}

export interface IssueInvoiceResult {
  id: number;
  numeroFactura: string;
  periodoInicio: Date;
  periodoFin: Date;
}

/**
 * Emite una factura y actualiza al usuario con la nueva suscripción y la fecha
 * hasta la que está pagada. Hoy el "pago" es simulado — el método real queda
 * para cuando se integre una pasarela (Stripe/MP/PayPal).
 */
export const issueInvoice = async (input: IssueInvoiceInput): Promise<IssueInvoiceResult> => {
  const periodoInicio = input.periodoInicio ?? new Date();
  const periodoFin = computePeriodEnd(periodoInicio, input.periodo);
  const numero = generateInvoiceNumber(periodoInicio);

  const [result] = await db.query<any>(
    `INSERT INTO facturas
       (usuario_id, suscripcion_nombre, periodo, monto, moneda, metodo_pago, estado,
        periodo_inicio, periodo_fin, numero_factura)
     VALUES (?, ?, ?, ?, ?, ?, 'pagada', ?, ?, ?)`,
    [
      input.usuarioId,
      input.planNombre,
      input.periodo,
      input.monto,
      input.moneda ?? 'USD',
      input.metodoPago ?? 'simulado',
      toDateColumn(periodoInicio),
      toDateColumn(periodoFin),
      numero,
    ],
  );

  await db.query(
    `UPDATE usuarios
        SET suscripcion = ?, suscripcion_periodo = ?, suscripcion_hasta = ?
      WHERE id = ?`,
    [input.planNombre, input.periodo, toDateTimeColumn(periodoFin), input.usuarioId],
  );

  return {
    id: Number((result as any).insertId),
    numeroFactura: numero,
    periodoInicio,
    periodoFin,
  };
};
