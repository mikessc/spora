import { Inject, Injectable } from "@nestjs/common";
import { type DeepPartial, Logger, type RequestContext, TransactionalConnection, VendureEntity } from "@vendure/core";
import { businessDate, type ExchangeRate as Rate, rateUnits } from "@spora/shared";
import { Column, Entity } from "typeorm";

/** Tipo de cambio de venta del BCCR de un día de negocio (America/Costa_Rica). */
@Entity()
export class ExchangeRate extends VendureEntity {
  constructor(input?: DeepPartial<ExchangeRate>) {
    super(input);
  }

  @Column("varchar", { unique: true }) date!: string;

  /** Colones por dólar con hasta 4 decimales, como texto (`"515.25"`). */
  @Column("varchar") rate!: string;

  @Column("varchar") source!: "bccr" | "simulado";
}

export interface RateProvider {
  readonly source: ExchangeRate["source"];
  fetch(date: string): Promise<string>;
}

/** Sin credenciales del BCCR: tasa fija de `.env` (adaptador simulado del MVP). */
export class SimulatedRateProvider implements RateProvider {
  readonly source = "simulado" as const;
  constructor(private rate: string) {
    rateUnits(rate);
  }
  async fetch() {
    return this.rate;
  }
}

/**
 * Web service de indicadores del BCCR, indicador 318 (tipo de cambio de venta). Requiere suscripción gratuita:
 * https://www.bccr.fi.cr/indicadores-economicos/servicio-web
 */
export class BccrRateProvider implements RateProvider {
  readonly source = "bccr" as const;
  constructor(private credentials: { name: string; email: string; token: string }) {}

  async fetch(date: string) {
    const [y, m, d] = date.split("-");
    const day = `${d}/${m}/${y}`;
    const url = new URL(
      "https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx/ObtenerIndicadoresEconomicosXML",
    );
    const params = {
      Indicador: "318",
      FechaInicio: day,
      FechaFinal: day,
      Nombre: this.credentials.name,
      SubNiveles: "N",
      CorreoElectronico: this.credentials.email,
      Token: this.credentials.token,
    };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`BCCR respondió ${res.status}`);
    const rate = parseBccrRate(await res.text());
    if (!rate) throw new Error(`El BCCR no publicó tipo de cambio para ${date}`);
    return rate;
  }
}

/**
 * La respuesta del BCCR es XML con el XML del indicador escapado adentro; solo interesa `NUM_VALOR` (8 decimales).
 * El tipo de cambio oficial se publica con 2.
 */
export function parseBccrRate(xml: string): string | null {
  const value = /NUM_VALOR(?:>|&gt;)\s*(\d+(?:\.\d+)?)/.exec(xml)?.[1];
  return value ? (Math.round(Number(value) * 100) / 100).toFixed(2) : null;
}

export function rateProviderFromEnv(env = process.env): RateProvider {
  const { BCCR_NAME, BCCR_EMAIL, BCCR_TOKEN, BCCR_SIMULATED_RATE } = env;
  if (BCCR_EMAIL && BCCR_TOKEN) {
    return new BccrRateProvider({ name: BCCR_NAME ?? "Spora", email: BCCR_EMAIL, token: BCCR_TOKEN });
  }
  return new SimulatedRateProvider(BCCR_SIMULATED_RATE ?? "515.00");
}

export const RATE_PROVIDER = Symbol("RATE_PROVIDER");

@Injectable()
export class ExchangeRateService {
  constructor(
    @Inject(TransactionalConnection) private connection: TransactionalConnection,
    @Inject(RATE_PROVIDER) private provider: RateProvider,
  ) {}

  /**
   * La tasa del día de negocio de hoy. Se pide al proveedor una vez por día; si el BCCR no responde se usa la última
   * conocida (y se registra el error).
   */
  async today(ctx: RequestContext): Promise<Rate & { source: string }> {
    const date = businessDate();
    const repo = this.connection.getRepository(ctx, ExchangeRate);
    const found = await repo.findOneBy({ date });
    if (found) return found;
    try {
      const rate = await this.provider.fetch(date);
      rateUnits(rate);
      return await repo.save(new ExchangeRate({ date, rate, source: this.provider.source }));
    } catch (err) {
      // Otra petición pudo guardarla al mismo tiempo (fecha única).
      const raced = await repo.findOneBy({ date });
      if (raced) return raced;
      const last = await repo.findOne({ where: {}, order: { date: "DESC" } });
      Logger.error(`No se pudo obtener el tipo de cambio de ${date}: ${String(err)}`, "Spora");
      if (last) return last;
      throw err;
    }
  }
}
