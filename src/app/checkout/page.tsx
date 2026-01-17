"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useCart } from "@/context/CartContext";
import { supabase } from "@/lib/supabaseClient";
import { getProductsByIds } from "@/lib/db";

type CartItem = {
  productId: any; // uuid string or number
  variantId: any; // uuid string or number
  qty: number;
};

type ProductLite = {
  id: any;
  slug: string;
  price: number | string;
  cost: number | string;
  is_weight: boolean;
  is_online: boolean;
};

function moneyUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

function toNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isNumericId(x: any) {
  const s = String(x ?? "").trim();
  return s !== "" && /^\d+$/.test(s);
}

/** returns either number[] (if all numeric) OR string[] */
function normalizeIdList(list: any[]) {
  const raw = Array.from(new Set((list ?? []).filter((x) => x != null)));
  const allNumeric = raw.length > 0 && raw.every(isNumericId);
  return allNumeric ? raw.map((x) => Number(String(x).trim())) : raw.map((x) => String(x));
}

function supaErrToText(err: any) {
  if (!err) return "Unknown error";
  const msg = err?.message ?? "";
  const code = err?.code ?? "";
  const details = err?.details ?? "";
  const hint = err?.hint ?? "";
  return [msg, code && `code=${code}`, details && `details=${details}`, hint && `hint=${hint}`]
    .filter(Boolean)
    .join(" | ");
}

// ✅ language toggle reader (same idea you used elsewhere)
function readLanguage(): "so" | "en" {
  if (typeof window === "undefined") return "so";
  const raw =
    window.localStorage.getItem("lang") ||
    window.localStorage.getItem("language") ||
    window.localStorage.getItem("locale") ||
    "so";
  const v = String(raw).toLowerCase().trim();
  return v === "en" || v === "english" ? "en" : "so";
}

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const cartItems = (Array.isArray(items) ? (items as any) : []) as CartItem[];

  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState(false);
  const [orderId, setOrderId] = useState<any>(null);

  // Manual payment (no API)
  const [payTo, setPayTo] = useState<"612073874" | "62342424">("612073874");
  const [paidClicked, setPaidClicked] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Language toggle
  const [lang, setLang] = useState<"so" | "en">("so");
  useEffect(() => {
    setLang(readLanguage());
    const onStorage = () => setLang(readLanguage());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const t = useMemo(() => {
    const so = {
      back: "← Dib ugu noqo Cart",
      title: "Bixinta",
      subtitle: "Dhammaan dalabyadu waxay ahaanayaan PENDING inta aan lacagta si gacanta ah u hubinayno.",
      delivery: "Faahfaahinta keenista",
      fullName: "Magaca oo buuxa",
      phone: "Telefoon",
      address: "Cinwaan",
      note: "Fariin (ikhtiyaari)",
      orderSummary: "Soo koobid dalab",
      loading: "Wuu soo shubanayaa…",
      noSellable: "Ma jiro wax la iibin karo (alaabtu waa inay online noqotaa oo qiimo leedahay).",
      subtotal: "Wadarta (Subtotal)",
      vat: "VAT (5%)",
      total: "Wadar",
      payTitle: "Bixin (Mobile Money)",
      payDesc: "API ma jiro — marka aad bixiso, dalabkaagu wuu ahaanayaa PENDING ilaa aan ka xaqiijino.",
      payTo1: "Ku bixi: 612073874",
      payTo2: "Ku bixi: 62342424",
      dial: "Geli koodhkan (Dial):",
      copy: "Koobi",
      amount: "Wadarta:",
      iPaid: "Waxaan bixiyay",
      iPaidDone: "Waa la xaqiijiyay ✓",
      sendOrder: "Dir dalabka",
      confirming: "Hubinayaa…",
      fillForm: "Fadlan buuxi Magaca, Telefoonka, iyo Cinwaanka.",
      payFirst: "Fadlan marka hore bixi kadibna taabo 'Waxaan bixiyay'.",
      doneTitle: "Dalabka waa la sameeyay",
      statusLabel: "Xaalad:",
      pending: "PENDING",
      manualNote: "Lacagta waa la hubinayaa (manual). Haddii wax khaldan yihiin waan kula soo xiriiri doonaa.",
      trackCta: "La soco dalabkaaga: Riix halkan (WhatsApp)",
      copied: "Koodhka waa la koobiyeeyay",
      failed: "Failed to place order",
      orderId: "Order ID",
    };

    const en = {
      back: "← Back to cart",
      title: "Checkout",
      subtitle: "All orders save as PENDING while we manually confirm payment.",
      delivery: "Delivery details",
      fullName: "Full name",
      phone: "Phone",
      address: "Address",
      note: "Note (optional)",
      orderSummary: "Order summary",
      loading: "Loading…",
      noSellable: "No sellable items (product must be online and have a price).",
      subtotal: "Subtotal",
      vat: "VAT (5%)",
      total: "Total",
      payTitle: "Pay (Mobile Money)",
      payDesc: "No API — after you pay, your order stays PENDING until we confirm.",
      payTo1: "Pay to: 612073874",
      payTo2: "Pay to: 62342424",
      dial: "Dial this code:",
      copy: "Copy",
      amount: "Amount:",
      iPaid: "I have paid",
      iPaidDone: "Marked paid ✓",
      sendOrder: "Submit order",
      confirming: "Confirming…",
      fillForm: "Please fill Name, Phone, and Address.",
      payFirst: "Please pay first, then tap 'I have paid'.",
      doneTitle: "Order created",
      statusLabel: "Status:",
      pending: "PENDING",
      manualNote: "Payment is checked manually. If anything is wrong, we will contact you.",
trackCta: "Track your order: Click here (WhatsApp)",
      copied: "Code copied",
      failed: "Failed to place order",
      orderId: "Order ID",
    };

    return lang === "en" ? en : so;
  }, [lang]);

  // Simple form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");

  const [productMap, setProductMap] = useState<Record<string, ProductLite>>({});

  // Load products needed
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // Sellable now = product exists, is_online true, and price > 0
        const safe = (cartItems || []).filter((x) => x && x.productId != null);
        const productIds = Array.from(new Set(safe.map((x) => String(x.productId)).filter(Boolean)));

        if (!productIds.length) {
          if (!alive) return;
          setProductMap({});
          setLoading(false);
          return;
        }

        const prods = await getProductsByIds(productIds);

        const pm: Record<string, ProductLite> = {};
        for (const p of (prods ?? []) as any[]) pm[String(p.id)] = p;

        if (!alive) return;
        setProductMap(pm);
      } catch (e: any) {
        console.error(String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Rows: product must be online + have price > 0
  const rows = useMemo(() => {
    const safe = (cartItems || []).filter((x) => x && x.productId != null);

    return safe
      .map((ci) => {
        const p = productMap[String(ci.productId)];
        if (!p) return null;
        if (p.is_online === false) return null;

        const unitPrice = toNumber((p as any).price ?? 0);
        if (!(unitPrice > 0)) return null;

        // For weight items, qty can be decimal KG; for unit items, qty is integer
        const qty = Math.max(0.001, Number(ci.qty ?? 1));
        const displayQty = p.is_weight ? qty : Math.max(1, Math.round(qty));
        const lineTotal = unitPrice * displayQty;

        return {
          key: `${String(ci.productId)}-${String(ci.variantId ?? "no-variant")}`,
          productId: ci.productId,
          variantId: ci.variantId,
          slug: String((p as any).slug ?? "").trim(),
          name: String((p as any).slug ?? "").trim() || "Product",
          unitPrice,
          qty: displayQty,
          isWeight: !!p.is_weight,
          unitCost: toNumber((p as any).cost ?? 0),
          lineTotal,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      productId: any;
      variantId: any;
      slug: string;
      name: string;
      unitPrice: number;
      qty: number;
      isWeight: boolean;
      unitCost: number;
      lineTotal: number;
    }>;
  }, [cartItems, productMap]);

  const subtotal = useMemo(() => rows.reduce((s, r) => s + r.lineTotal, 0), [rows]);
  const vatFee = subtotal > 0 ? subtotal * 0.05 : 0;
  const total = subtotal + vatFee;

  const ussdAmount = useMemo(() => {
    const v = Number(total || 0);
    const fixed = v.toFixed(2);
    return fixed.replace(/\.00$/, "").replace(/(\.[1-9])0$/, "$1");
  }, [total]);

  const ussdCode = useMemo(() => {
    return `*712*${payTo}*${ussdAmount}#`;
  }, [payTo, ussdAmount]);

  async function placeOrder() {
    if (placing) return;

    if (rows.length === 0) {
      alert(t.noSellable);
      return;
    }

    const n = name.trim();
    const p = phone.trim();
    const a = address.trim();
    if (!n || !p || !a) {
      alert(t.fillForm);
      return;
    }

    setPlacing(true);

    try {
      const noteCombined = [
        `Name: ${n}`,
        `Phone: ${p}`,
        `Address: ${a}`,
        `Payment: Manual Mobile Money`,
        `Pay-to: ${payTo}`,
        `USSD: ${ussdCode}`,
        `User said paid: YES`,
        note.trim() ? `Note: ${note.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const orderInsert = await supabase
        .from("orders")
        .insert({
          phone: p,
          status: "pending", // ✅ FIX: enum supports pending
          channel: "website",
          total: Number.isFinite(Number(total)) ? Number(total) : 0,
          note: noteCombined,
          profit: 0,
        })
        .select("id")
        .single();

      if (orderInsert.error) throw new Error(`Order insert failed: ${supaErrToText(orderInsert.error)}`);
      const newOrderId = orderInsert.data?.id;
      if (!newOrderId) throw new Error("Order insert failed: missing id");

      const payload = rows.map((r) => {
        return {
          order_id: newOrderId,
          product_slug: r.slug,
          qty: Number(r.qty),
          unit_price: Number(r.unitPrice),
          line_total: Number(r.lineTotal),
          is_weight: !!r.isWeight,
          unit_cost: Number(r.unitCost ?? 0),
        };
      });

      const itemsInsert = await supabase.from("order_items").insert(payload);
      if (itemsInsert.error) throw new Error(`Order items insert failed: ${supaErrToText(itemsInsert.error)}`);

      clearCart();
      setOrderId(newOrderId);
      setDone(true);
    } catch (e: any) {
      console.error(String(e?.message ?? e));
      alert(String(e?.message ?? t.failed));
    } finally {
      setPlacing(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-md px-4 py-10">
          <div className="border rounded-2xl p-6 text-center">
            <div className="text-4xl">✅</div>
            <div className="mt-3 text-lg font-extrabold">{t.doneTitle}</div>
            <div className="mt-1 text-sm text-gray-600">
              {t.statusLabel} <span className="font-semibold">{t.pending}</span>
            </div>
            <div className="mt-2 text-xs text-gray-600">{t.manualNote}</div>

            {orderId ? (
              <div className="mt-1 text-xs text-gray-500">
                {t.orderId}: {String(orderId)}
              </div>
            ) : null}

<div className="mt-6">
  <a
    href={
      orderId
        ? `https://wa.me/?text=${encodeURIComponent(
            `MatoMart order tracking\nOrder ID: ${String(orderId)}\nPlease help me track my order.`
          )}`
        : "#"
    }
    target="_blank"
    rel="noreferrer"
    className={`h-11 w-full rounded-2xl text-white text-sm font-extrabold grid place-items-center ${
      orderId ? "bg-[#0E5C1C]" : "bg-gray-300"
    }`}
    onClick={(e) => {
      if (!orderId) e.preventDefault();
    }}
  >
    {t.trackCta}
  </a>
</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F6F8] text-black pb-24">
      <div className="mx-auto max-w-md px-4 py-4">
        <Link href="/cart" className="text-sm text-[#0B6EA9] font-semibold">
          {t.back}
        </Link>

        <h1 className="mt-2 text-xl font-extrabold">{t.title}</h1>
        <p className="text-xs text-gray-600">{t.subtitle}</p>

        <div className="mt-4 bg-white border rounded-2xl p-4">
          <div className="text-sm font-bold text-gray-900">{t.delivery}</div>

          <div className="mt-3 space-y-3">
            <label className="block text-xs text-gray-600">
              {t.fullName}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full h-11 rounded-xl border px-3 text-sm"
              />
            </label>

            <label className="block text-xs text-gray-600">
              {t.phone}
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full h-11 rounded-xl border px-3 text-sm"
              />
            </label>

            <label className="block text-xs text-gray-600">
              {t.address}
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full h-11 rounded-xl border px-3 text-sm"
              />
            </label>

            <label className="block text-xs text-gray-600">
              {t.note}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                rows={3}
              />
            </label>
          </div>
        </div>

        <div className="mt-3 bg-white border rounded-2xl p-4">
          <div className="text-sm font-bold text-gray-900">{t.orderSummary}</div>

          {loading ? (
            <div className="mt-3 text-sm text-gray-600">{t.loading}</div>
          ) : rows.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">{t.noSellable}</div>
          ) : (
            <div className="mt-3 space-y-2">
              {rows.map((r) => (
                <div key={r.key} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{r.name}</div>
                    <div className="text-xs text-gray-500">
                      {r.qty} × {moneyUSD(r.unitPrice)}
                    </div>
                  </div>
                  <div className="font-extrabold text-gray-900">{moneyUSD(r.lineTotal)}</div>
                </div>
              ))}

              <div className="mt-3 border-t pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t.subtotal}</span>
                  <span className="font-bold">{moneyUSD(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t.vat}</span>
                  <span className="font-bold">{moneyUSD(vatFee)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-extrabold">{t.total}</span>
                  <span className="font-extrabold">{moneyUSD(total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 bg-white border rounded-2xl p-4">
          <div className="text-sm font-bold text-gray-900">{t.payTitle}</div>
          <p className="mt-1 text-xs text-gray-600">{t.payDesc}</p>

          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="payto"
                checked={payTo === "612073874"}
                onChange={() => setPayTo("612073874")}
              />
              <span className="font-semibold">{t.payTo1}</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="payto"
                checked={payTo === "62342424"}
                onChange={() => setPayTo("62342424")}
              />
              <span className="font-semibold">{t.payTo2}</span>
            </label>
          </div>

          <div className="mt-3 rounded-2xl border bg-gray-50 p-3">
            <div className="text-xs text-gray-600 font-semibold">{t.dial}</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 font-extrabold text-gray-900 break-all">{ussdCode}</div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    if (navigator?.clipboard?.writeText) {
                      await navigator.clipboard.writeText(ussdCode);
                      alert(t.copied);
                    } else {
                      prompt(t.copy + ":", ussdCode);
                    }
                  } catch {
                    prompt(t.copy + ":", ussdCode);
                  }
                }}
                className="h-9 px-3 rounded-xl bg-white border text-xs font-bold"
              >
                {t.copy}
              </button>
            </div>
            <div className="mt-2 text-[12px] text-gray-600">
              {t.amount} <span className="font-bold">{ussdAmount}</span>
            </div>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => setPaidClicked(true)}
              disabled={paidClicked || placing || loading || rows.length === 0}
              className={`w-full h-12 rounded-2xl font-extrabold text-sm shadow-sm transition active:scale-[0.99] ${
                paidClicked ? "bg-[#0E5C1C] text-white" : "bg-white border text-gray-900"
              }`}
            >
              {paidClicked ? t.iPaidDone : t.iPaid}
            </button>

            <button
              type="button"
              onClick={async () => {
                if (!paidClicked) {
                  alert(t.payFirst);
                  return;
                }
                setConfirming(true);
                await placeOrder();
                setConfirming(false);
              }}
              disabled={confirming || placing || loading || rows.length === 0}
              className={`mt-2 w-full h-12 rounded-2xl font-extrabold text-sm shadow-sm transition active:scale-[0.99] ${
                confirming || placing || loading || rows.length === 0
                  ? "bg-gray-200 text-gray-500"
                  : "bg-[#0B6EA9] text-white"
              }`}
            >
              {confirming || placing ? t.confirming : `${t.sendOrder} • ${moneyUSD(total)}`}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}