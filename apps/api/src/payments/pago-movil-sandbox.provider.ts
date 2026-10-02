import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  CashInInstructions,
  PaymentProvider,
  PayoutTarget,
} from './payment-provider';
import { PLATFORM_PAGO_MOVIL, fromCents } from '../common/domain';

/**
 * Proveedor de pruebas que imita el flujo de Pago Móvil venezolano:
 * el usuario hace un Pago Móvil a la cuenta de la plataforma con la referencia,
 * y la confirmación llega por webhook (aquí se simula).
 *
 * Para producción, reemplazar por PagoFlashProvider / MegaSoftProvider /
 * BancoC2PProvider implementando la misma interfaz PaymentProvider.
 */
@Injectable()
export class PagoMovilSandboxProvider implements PaymentProvider {
  readonly name = 'pago-movil-sandbox';

  async initCashIn(amountCents: number): Promise<CashInInstructions> {
    const reference = this.ref('PM');
    return {
      reference,
      payTo: { ...PLATFORM_PAGO_MOVIL },
      instructions:
        `Haz un Pago Móvil de Bs. ${fromCents(amountCents).toFixed(2)} ` +
        `al banco ${PLATFORM_PAGO_MOVIL.bank}, teléfono ${PLATFORM_PAGO_MOVIL.phone}, ` +
        `cédula/RIF ${PLATFORM_PAGO_MOVIL.cedula}. ` +
        `Usa la referencia ${reference} y confirma cuando lo hayas hecho.`,
    };
  }

  async verifyCashIn(_reference: string): Promise<boolean> {
    // Sandbox: se da por recibido. En producción: consulta al agregador/banco.
    return true;
  }

  async sendPayout(
    _amountCents: number,
    _to: PayoutTarget,
  ): Promise<{ reference: string; ok: boolean }> {
    // Sandbox: el payout "se envía" al instante.
    return { reference: this.ref('OUT'), ok: true };
  }

  private ref(prefix: string): string {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomInt(1000, 9999)}`;
  }
}
