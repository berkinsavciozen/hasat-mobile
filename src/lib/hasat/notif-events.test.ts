// @ts-nocheck — node:test dosyası; app tsconfig'inde @types/node yok (webLinksAccess.test.ts ile aynı durum).
// Run with: node --experimental-strip-types --test src/lib/hasat/notif-events.test.ts
// MOB-WA: bildirim tercihleri ekranında WhatsApp kanalı render edilmez.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NOTIF_CHANNELS,
  NOTIF_EVENTS,
  NOTIF_PREF_DEFAULTS,
  notifEventsForRole,
  visibleChannels,
} from "./notif-events.ts";

test("WhatsApp kanalı render edilmez: hiçbir rol/event için görünür kanallarda yok", () => {
  assert.deepEqual(
    NOTIF_CHANNELS.map((c) => c.key),
    ["push", "sms"],
  );
  for (const role of ["farmer", "buyer"] as const) {
    for (const e of notifEventsForRole(role)) {
      const keys = visibleChannels(e).map((c) => c.key);
      assert.ok(!keys.includes("whatsapp"), `${role}/${e.key}`);
      assert.ok(!visibleChannels(e).some((c) => /whatsapp/i.test(c.label)), `${role}/${e.key}`);
    }
  }
});

test("SMS ve push kanalları aynen kalır (WhatsApp kolonu olan event'ler dahil)", () => {
  for (const e of NOTIF_EVENTS) {
    const expected = (["push", "sms"] as const).filter((k) => e.cols[k]);
    assert.deepEqual(
      visibleChannels(e).map((c) => c.key),
      expected,
      e.key,
    );
  }
  const newOffer = NOTIF_EVENTS.find((e) => e.key === "new_offer")!;
  assert.deepEqual(visibleChannels(newOffer).map((c) => c.key), ["push", "sms"]);
  const harvest = NOTIF_EVENTS.find((e) => e.key === "harvest_time")!;
  assert.deepEqual(visibleChannels(harvest).map((c) => c.key), ["push", "sms"]);
});

test("*_whatsapp kolonları veri katmanında korunur (tip + varsayılanlar)", () => {
  assert.equal(NOTIF_PREF_DEFAULTS.new_offer_whatsapp, true);
  assert.equal(NOTIF_PREF_DEFAULTS.harvest_time_whatsapp, true);
  assert.equal(NOTIF_EVENTS.find((e) => e.key === "new_offer")!.cols.whatsapp, "new_offer_whatsapp");
});

test("notif-prefs ekranı kanalları yalnız visibleChannels()'tan alır, WhatsApp/Yakında metni yok", () => {
  const screen = readFileSync(new URL("../../../app/notif-prefs.tsx", import.meta.url), "utf8");
  const code = screen
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
  assert.match(code, /visibleChannels\(e\)/);
  assert.doesNotMatch(code, /NOTIF_CHANNELS/);
  assert.doesNotMatch(code, /whatsapp/i);
  assert.doesNotMatch(code, /Yakında/);
});
