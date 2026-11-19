import { Inject } from "@nestjs/common";
import { Query, Resolver } from "@nestjs/graphql";
import {
  Ctx,
  defaultOrderProcess,
  type Injector,
  LanguageCode,
  type OrderProcess,
  PluginCommonModule,
  type RequestContext,
  VendurePlugin,
} from "@vendure/core";
import gql from "graphql-tag";
import { ExchangeRate, ExchangeRateService, RATE_PROVIDER, rateProviderFromEnv } from "./exchange-rate";

declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomOrderFields {
    exchangeRate: string | null;
    exchangeRateDate: string | null;
  }
  interface CustomProductVariantFields {
    otherCurrencyPrice: number | null;
  }
}

const es = (value: string) => [{ languageCode: LanguageCode.es, value }];

/** Todo pedido guarda el tipo de cambio del día en que pasa a pago (CLAUDE.md, ADR 0004). */
let rates: ExchangeRateService;
const recordExchangeRate: OrderProcess<"ArrangingPayment"> = {
  init(injector: Injector) {
    rates = injector.get(ExchangeRateService);
  },
  async onTransitionEnd(_from, to, data) {
    if (to !== "ArrangingPayment") return;
    const rate = await rates.today(data.ctx);
    data.order.customFields.exchangeRate = rate.rate;
    data.order.customFields.exchangeRateDate = rate.date;
  },
};

@Resolver()
class ExchangeRateShopResolver {
  constructor(@Inject(ExchangeRateService) private rates: ExchangeRateService) {}

  @Query()
  exchangeRate(@Ctx() ctx: RequestContext) {
    return this.rates.today(ctx);
  }
}

/** Monedas (ADR 0004): tipo de cambio BCCR diario, precio manual en la otra moneda y tasa guardada en el pedido. */
@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [ExchangeRate],
  providers: [ExchangeRateService, { provide: RATE_PROVIDER, useFactory: () => rateProviderFromEnv() }],
  exports: [ExchangeRateService],
  shopApiExtensions: {
    schema: gql`
      type SporaExchangeRate {
        "Día de negocio en Costa Rica (YYYY-MM-DD)."
        date: String!
        "Colones por dólar (venta BCCR)."
        rate: String!
        source: String!
      }
      extend type Query {
        exchangeRate: SporaExchangeRate!
      }
    `,
    resolvers: [ExchangeRateShopResolver],
  },
  configuration: (config) => {
    config.orderOptions.process = [...(config.orderOptions.process ?? [defaultOrderProcess]), recordExchangeRate];
    config.customFields.Order.push(
      { name: "exchangeRate", type: "string", nullable: true, readonly: true, label: es("Tipo de cambio") },
      {
        name: "exchangeRateDate",
        type: "string",
        nullable: true,
        readonly: true,
        label: es("Fecha del tipo de cambio"),
      },
    );
    config.customFields.ProductVariant.push({
      name: "otherCurrencyPrice",
      type: "int",
      nullable: true,
      min: 0,
      label: es("Precio manual en la otra moneda"),
      description: es(
        "Opcional, en la unidad menor: céntimos si la otra moneda es CRC (₡12 500 = 1250000), centavos si es USD " +
          "($25 = 2500). Vacío: se convierte con el tipo de cambio del BCCR.",
      ),
    });
    return config;
  },
  compatibility: "^3.0.0",
})
export class CurrencyPlugin {}
