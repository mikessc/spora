import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBccrRate, rateProviderFromEnv, SimulatedRateProvider } from "./exchange-rate";

test("lee NUM_VALOR de la respuesta del BCCR (XML escapado dentro de XML)", () => {
  const xml =
    '<?xml version="1.0" encoding="utf-8"?><string xmlns="http://ws.sdde.bccr.fi.cr">' +
    "&lt;Datos_de_INGC011_CAT_INDICADORECONOMIC&gt;&lt;INGC011_CAT_INDICADORECONOMIC&gt;" +
    "&lt;COD_INDICADORINTERNO&gt;318&lt;/COD_INDICADORINTERNO&gt;" +
    "&lt;DES_FECHA&gt;2026-11-19T00:00:00-06:00&lt;/DES_FECHA&gt;" +
    "&lt;NUM_VALOR&gt;515.24500000&lt;/NUM_VALOR&gt;" +
    "&lt;/INGC011_CAT_INDICADORECONOMIC&gt;&lt;/Datos_de_INGC011_CAT_INDICADORECONOMIC&gt;</string>";
  assert.equal(parseBccrRate(xml), "515.25");
  assert.equal(parseBccrRate("<string>&lt;Datos/&gt;</string>"), null);
});

test("sin credenciales del BCCR se usa la tasa simulada de .env", async () => {
  const provider = rateProviderFromEnv({ BCCR_SIMULATED_RATE: "510.10" });
  assert.equal(provider.source, "simulado");
  assert.equal(await provider.fetch("2026-11-19"), "510.10");
  assert.equal(rateProviderFromEnv({ BCCR_EMAIL: "a@b.cr", BCCR_TOKEN: "x" }).source, "bccr");
  assert.throws(() => new SimulatedRateProvider("quinientos"));
});
