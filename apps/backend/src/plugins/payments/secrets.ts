// Credenciales de comercios cifradas en el servidor (CLAUDE.md): AES-256-GCM con una clave de .env.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { PaymentMethod } from "@vendure/core";
import { type EntitySubscriberInterface, EventSubscriber, type InsertEvent, type UpdateEvent } from "typeorm";

const PREFIX = "enc:v1:";

function key(): Buffer {
  const secret = process.env.SPORA_ENCRYPTION_KEY;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("Falta la variable SPORA_ENCRYPTION_KEY");
  return createHash("sha256")
    .update(secret ?? "solo-desarrollo")
    .digest();
}

export function encrypt(plain: string): string {
  if (plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function decrypt(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** Handlers de Spora cuyos argumentos (número SINPE, IBAN, llaves de pasarela) se guardan cifrados. */
export const SECRET_HANDLERS = new Set(["sinpe-movil", "transferencia", "paypal", "tilopay"]);

const mapArgs = (method: Partial<PaymentMethod> | undefined, fn: (v: string) => string) => {
  if (!method?.handler || !SECRET_HANDLERS.has(method.handler.code)) return;
  method.handler.args = method.handler.args.map((arg) => ({ ...arg, value: fn(arg.value) }));
};

/** Cifra al guardar y descifra al leer: en la base nunca hay credenciales en claro; los servicios las ven en claro. */
@EventSubscriber()
export class PaymentMethodSecrets implements EntitySubscriberInterface<PaymentMethod> {
  listenTo() {
    return PaymentMethod;
  }
  beforeInsert(event: InsertEvent<PaymentMethod>) {
    mapArgs(event.entity, encrypt);
  }
  beforeUpdate(event: UpdateEvent<PaymentMethod>) {
    mapArgs(event.entity as PaymentMethod, encrypt);
  }
  afterInsert(event: InsertEvent<PaymentMethod>) {
    mapArgs(event.entity, decrypt);
  }
  afterUpdate(event: UpdateEvent<PaymentMethod>) {
    mapArgs(event.entity as PaymentMethod, decrypt);
  }
  afterLoad(entity: PaymentMethod) {
    mapArgs(entity, decrypt);
  }
}
