import assert from "node:assert/strict";
import { test } from "node:test";
import { pymexpressQuote } from "./providers";
import { signTrackingAppWebhook, verifyTrackingAppSignature } from "./shipping.plugin";

test("firma de TrackingApp: t=<unix>,v1=HMAC(t.cuerpo); se rechaza alterada, con otro secreto o vieja", () => {
  const body = '{"id":"e1","type":"package.delivered"}';
  const now = Date.UTC(2026, 10, 19, 12, 0, 0);
  const header = signTrackingAppWebhook(body, "whsec_x", now);
  assert.ok(verifyTrackingAppSignature(header, Buffer.from(body), "whsec_x", now));
  assert.ok(!verifyTrackingAppSignature(header, Buffer.from(body.replace("delivered", "returned")), "whsec_x", now));
  assert.ok(!verifyTrackingAppSignature(header, Buffer.from(body), "whsec_otro", now));
  assert.ok(!verifyTrackingAppSignature(header, Buffer.from(body), "whsec_x", now + 6 * 60_000));
  assert.ok(!verifyTrackingAppSignature("basura", Buffer.from(body), "whsec_x", now));
});

test("Pymexpress simulado: primer kilo por zona (GAM o resto) y kilos adicionales", () => {
  assert.equal(pymexpressQuote(150, "San José"), 230000);
  assert.equal(pymexpressQuote(1000, "Heredia"), 230000);
  assert.equal(pymexpressQuote(2500, "Limón"), 290000 + 2 * 65000);
});
