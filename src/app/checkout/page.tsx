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

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const cartItems = (Array.isArray(items) ? (items as any) : []) as CartItem[];

  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState(false);
  const [orderId, setOrderId] = useState<any>(null);

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

  async function placeOrder() {
    if (placing) return;

    if (rows.length === 0) {
      alert("No sellable items (product must be online and have a price).");
      return;
    }

    const n = name.trim();
    const p = phone.trim();
    const a = address.trim();
    if (!n || !p || !a) {
      alert("Please fill Name, Phone, and Address.");
      return;
    }

    setPlacing(true);

    try {
      const noteCombined = [
        `Name: ${n}`,
        `Phone: ${p}`,
        `Address: ${a}`,
        note.trim() ? `Note: ${note.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const orderInsert = await supabase
        .from("orders")
        .insert({
          phone: p,
          status: "pending",
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
      alert(String(e?.message ?? "Failed to place order"));
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
            <div className="mt-3 text-lg font-extrabold">Order created</div>
            <div className="mt-1 text-sm text-gray-600">
              Status: <span className="font-semibold">PENDING</span>
            </div>
            {orderId ? <div className="mt-1 text-xs text-gray-500">Order ID: {String(orderId)}</div> : null}

            <div className="mt-6 flex gap-2 justify-center">
              <Link href="/" className="h-10 px-4 rounded-full bg-[#0B6EA9] text-white text-sm font-bold grid place-items-center">
                Continue shopping
              </Link>
              <Link href="/cart" className="h-10 px-4 rounded-full border text-sm font-bold grid place-items-center">
                Back to cart
              </Link>
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
          ← Back to cart
        </Link>

        <h1 className="mt-2 text-xl font-extrabold">Checkout</h1>
        <p className="text-xs text-gray-600">All checkouts save as PENDING orders.</p>

        <div className="mt-4 bg-white border rounded-2xl p-4">
          <div className="text-sm font-bold text-gray-900">Delivery details</div>

          <div className="mt-3 space-y-3">
            <label className="block text-xs text-gray-600">
              Full name
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" />
            </label>

            <label className="block text-xs text-gray-600">
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" />
            </label>

            <label className="block text-xs text-gray-600">
              Address
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" />
            </label>

            <label className="block text-xs text-gray-600">
              Note (optional)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" rows={3} />
            </label>
          </div>
        </div>

        <div className="mt-3 bg-white border rounded-2xl p-4">
          <div className="text-sm font-bold text-gray-900">Order summary</div>

          {loading ? (
            <div className="mt-3 text-sm text-gray-600">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">
              No sellable items (product must be online and have a price).
            </div>
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
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-bold">{moneyUSD(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">VAT (5%)</span>
                  <span className="font-bold">{moneyUSD(vatFee)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-extrabold">Total</span>
                  <span className="font-extrabold">{moneyUSD(total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={placeOrder}
          disabled={placing || loading || rows.length === 0}
          className={`mt-4 w-full h-12 rounded-2xl font-extrabold text-sm shadow-sm transition active:scale-[0.99] ${
            placing || loading || rows.length === 0 ? "bg-gray-200 text-gray-500" : "bg-[#0B6EA9] text-white"
          }`}
        >
          {placing ? "Placing…" : `Place order • ${moneyUSD(total)}`}
        </button>
      </div>
    </main>
  );
}