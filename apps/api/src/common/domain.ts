/**
 * Constantes de dominio compartidas.
 * (Como SQLite no soporta enums en Prisma, estos tipos se validan en la app.)
 */

export const Roles = {
  CLIENTE: 'CLIENTE',
  CONDUCTOR: 'CONDUCTOR',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Roles)[keyof typeof Roles];
export const ALL_ROLES: Role[] = Object.values(Roles);

/** Roles que un usuario puede elegir al auto-registrarse. ADMIN se crea aparte. */
export const SELF_SIGNUP_ROLES: Role[] = [Roles.CLIENTE, Roles.CONDUCTOR];

export const KycStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

/** Tipos de movimiento del ledger. */
export const LedgerType = {
  CASH_IN: 'CASH_IN', // fondear wallet desde fuera (pasarela)
  HOLD: 'HOLD', // congelar fondos al crear una orden (escrow) — Fase 2
  RELEASE: 'RELEASE', // liberar escrow al conductor — Fase 2
  REFUND: 'REFUND', // devolver escrow al cliente — Fase 2
  CASH_OUT: 'CASH_OUT', // retiro a cuenta bancaria
  PAYOUT: 'PAYOUT', // acreditar fondos liberados al conductor — Fase 2
  FEE: 'FEE', // comisión de la plataforma — Fase 2
} as const;
export type LedgerType = (typeof LedgerType)[keyof typeof LedgerType];

/** Tipo de orden. */
export const OrderType = {
  COMPRA: 'COMPRA', // delivery de compras (Fase 2)
  VIAJE: 'VIAJE', // traslado en mototaxi (Fase 4)
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

/** Estados del ciclo de vida de una orden. */
export const OrderStatus = {
  CREADA: 'CREADA', // borrador con estimación, sin escrow aún
  PUBLICADA: 'PUBLICADA', // escrow congelado, visible en el feed
  ACEPTADA: 'ACEPTADA', // un conductor la tomó
  COMPRANDO: 'COMPRANDO', // conductor en la tienda
  ESPERA_APROBACION: 'ESPERA_APROBACION', // falta que el cliente apruebe recarga extra
  EN_CAMINO: 'EN_CAMINO', // compra lista, en ruta al cliente
  ENTREGADA: 'ENTREGADA', // conductor marcó entrega; falta confirmación del cliente
  CERRADA: 'CERRADA', // cliente confirmó, escrow liberado
  CANCELADA: 'CANCELADA',
  EN_DISPUTA: 'EN_DISPUTA', // en conflicto; lo resuelve un admin
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Estado de cada producto de la lista. */
export const OrderItemStatus = {
  PENDIENTE: 'PENDIENTE',
  COMPRADO: 'COMPRADO',
  AGOTADO: 'AGOTADO',
  REEMPLAZADO: 'REEMPLAZADO',
} as const;
export type OrderItemStatus =
  (typeof OrderItemStatus)[keyof typeof OrderItemStatus];

/** Ítems que cuentan para el total final de la compra. */
export const PURCHASED_ITEM_STATUSES: string[] = [
  OrderItemStatus.COMPRADO,
  OrderItemStatus.REEMPLAZADO,
];

/** Comisión de la plataforma, como fracción de la tarifa de delivery. */
export const PLATFORM_COMMISSION_RATE = 0.2;

/** Tarifa de delivery por defecto (en céntimos) si el cliente no especifica. */
export const DEFAULT_DELIVERY_FEE_CENTS = 200;

/** Tarifa de mototaxi: banderazo + costo por kilómetro (en céntimos). */
export const TRIP_BASE_FARE_CENTS = 100;
export const TRIP_PER_KM_CENTS = 55;

/** Distancia en km entre dos coordenadas (fórmula de Haversine). */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371; // radio terrestre en km
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Tarifa del viaje en céntimos a partir de la distancia. */
export function tripFareCents(distanceKm: number): number {
  return Math.round(TRIP_BASE_FARE_CENTS + TRIP_PER_KM_CENTS * distanceKm);
}

/** Usuario interno que recauda las comisiones de la plataforma. */
export const PLATFORM_EMAIL = 'plataforma@superapp.local';

/** Métodos y estados de pago (cash-in / cash-out). */
export const PaymentKind = {
  CASH_IN: 'CASH_IN', // fondear wallet
  CASH_OUT: 'CASH_OUT', // retirar a cuenta/Pago Móvil
} as const;
export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind];

export const PaymentMethod = {
  PAGO_MOVIL: 'PAGO_MOVIL', // riel dominante en Venezuela
  EFECTIVO: 'EFECTIVO',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDIENTE: 'PENDIENTE',
  CONFIRMADO: 'CONFIRMADO',
  FALLIDO: 'FALLIDO',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/**
 * Datos de Pago Móvil de la plataforma (dónde paga el usuario para fondear).
 * Valores de demo; en producción se configuran por variables de entorno con los
 * datos reales de la cuenta de la plataforma (y luego los del agregador/banco).
 */
export const PLATFORM_PAGO_MOVIL = {
  bank: process.env.PM_BANK ?? '0102', // Banco de Venezuela (ejemplo)
  phone: process.env.PM_PHONE ?? '0414-5550000',
  cedula: process.env.PM_CEDULA ?? 'J-406543210',
};

/** La moneda interna se maneja en céntimos (enteros). */
export const MINOR_UNITS = 100;

export function toCents(amount: number): number {
  return Math.round(amount * MINOR_UNITS);
}

export function fromCents(cents: number): number {
  return cents / MINOR_UNITS;
}
