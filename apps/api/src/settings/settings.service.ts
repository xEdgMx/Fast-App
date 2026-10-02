import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_DELIVERY_FEE_CENTS,
  PLATFORM_COMMISSION_RATE,
  TRIP_BASE_FARE_CENTS,
  TRIP_PER_KM_CENTS,
} from '../common/domain';

export interface PlatformConfig {
  commissionRate: number; // fracción (0.2 = 20%)
  deliveryFeeCents: number;
  tripBaseFareCents: number;
  tripPerKmCents: number;
}

const DEFAULTS: PlatformConfig = {
  commissionRate: PLATFORM_COMMISSION_RATE,
  deliveryFeeCents: DEFAULT_DELIVERY_FEE_CENTS,
  tripBaseFareCents: TRIP_BASE_FARE_CENTS,
  tripPerKmCents: TRIP_PER_KM_CENTS,
};

/** Lee/escribe la configuración de la plataforma (con valores por defecto). */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<PlatformConfig> {
    const rows = await this.prisma.setting.findMany();
    const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
    return {
      commissionRate: map.get('commissionRate') ?? DEFAULTS.commissionRate,
      deliveryFeeCents: map.get('deliveryFeeCents') ?? DEFAULTS.deliveryFeeCents,
      tripBaseFareCents:
        map.get('tripBaseFareCents') ?? DEFAULTS.tripBaseFareCents,
      tripPerKmCents: map.get('tripPerKmCents') ?? DEFAULTS.tripPerKmCents,
    };
  }

  async updateConfig(patch: Partial<PlatformConfig>): Promise<PlatformConfig> {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    for (const [key, value] of entries) {
      await this.prisma.setting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    return this.getConfig();
  }

  /** Tarifa de un viaje según la configuración vigente. */
  async tripFareCents(distanceKm: number): Promise<number> {
    const cfg = await this.getConfig();
    return Math.round(cfg.tripBaseFareCents + cfg.tripPerKmCents * distanceKm);
  }
}
