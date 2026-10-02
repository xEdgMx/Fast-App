/**
 * Abstracción de pasarela de pago. Cambiar de "sandbox" a un proveedor real
 * (PagoFlash, Mega Soft, o Pago Móvil C2P de un banco) = implementar esta interfaz.
 */

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export interface CashInInstructions {
  reference: string;
  payTo: { bank: string; phone: string; cedula: string };
  instructions: string;
}

export interface PayoutTarget {
  bank: string;
  phone: string;
  cedula: string;
}

export interface PaymentProvider {
  readonly name: string;

  /** Inicia un cobro: genera referencia e instrucciones de Pago Móvil para el usuario. */
  initCashIn(amountCents: number): Promise<CashInInstructions>;

  /**
   * Verifica si el cobro con esa referencia fue recibido.
   * Sandbox: siempre true. Producción: consulta la API del agregador/banco
   * (o se recibe por webhook y este método concilia).
   */
  verifyCashIn(reference: string): Promise<boolean>;

  /** Envía un pago (payout) a la contraparte vía Pago Móvil. */
  sendPayout(
    amountCents: number,
    to: PayoutTarget,
  ): Promise<{ reference: string; ok: boolean }>;
}
