"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useCart } from "@/context/CartContext";
import { getProductsByIds, safeImg } from "@/lib/db";

type CartItem = {
  productId: string; // ✅ UUID
  variantId: string | null; // legacy (may exist from old DB), can be null
  qty: number;
};

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function parseNum(v: unknown): number {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function roundToStep(value: number, step: number) {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(step) || step <= 0) return value;
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
}

function normalizeQty(value: number, min: number, step: number, isWeight: boolean) {
  const safeMin = Number.isFinite(min) && min > 0 ? min : isWeight ? 0.5 : 1;
  const safeStep = Number.isFinite(step) && step > 0 ? step : isWeight ? 0.5 : 1;
  const v = Number.isFinite(value) ? value : safeMin;
  const clamped = v < safeMin ? safeMin : v;
  const stepped = isWeight ? roundToStep(clamped, safeStep) : Math.round(clamped / safeStep) * safeStep;
  const out = Math.max(safeMin, stepped);
  return Number(out.toFixed(isWeight ? 3 : 0));
}

type OnlineOptionLite = {
  id: string;
  type: "exact" | "bulk";
  label: string;
  unit_price: number;
  qty?: number | null;
  min_qty?: number | null;
  max_qty?: number | null;
};

type OnlineConfigLite = {
  unit: string;
  is_weight: boolean;
  min: number;
  step: number;
  options: OnlineOptionLite[];
};

function defaultRulesFor(p: any) {
  const isW = !!p?.is_weight;
  return {
    unit: isW ? "kg" : "pcs",
    min: Number(p?.min_order_qty ?? (isW ? 0.5 : 1)) || (isW ? 0.5 : 1),
    step: Number(p?.qty_step ?? (isW ? 0.5 : 1)) || (isW ? 0.5 : 1),
    is_weight: isW,
  };
}

function normalizeConfigLite(raw: any, p: any): OnlineConfigLite {
  const base = defaultRulesFor(p);
  const unit = String(raw?.unit || base.unit);
  const is_weight = !!(raw?.is_weight ?? base.is_weight);

  const minRaw = parseNum(raw?.min);
  const stepRaw = parseNum(raw?.step);

  const min = Number.isFinite(minRaw) && minRaw > 0 ? minRaw : base.min;
  const step = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : base.step;

  const optsRaw = Array.isArray(raw?.options) ? raw.options : [];
  const options: OnlineOptionLite[] = optsRaw
    .map((o: any) => {
      const type = o?.type;
      const label = String(o?.label ?? "").trim();
      if ((type !== "exact" && type !== "bulk") || !label) return null;

      const up = parseNum(o?.unit_price);
      if (!Number.isFinite(up) || up < 0) return null;

      if (type === "exact") {
        const q = parseNum(o?.qty);
        if (!Number.isFinite(q) || q <= 0) return null;
        return { id: String(o?.id || `${label}_${q}`), type: "exact", label, qty: q, unit_price: up };
      }

      const minq = parseNum(o?.min_qty);
      const maxq = o?.max_qty == null || String(o?.max_qty).trim() === "" ? null : parseNum(o?.max_qty);

      if (!Number.isFinite(minq) || minq < 0) return null;
      if (maxq != null && (!Number.isFinite(maxq) || maxq < minq)) return null;

      return {
        id: String(o?.id || `${label}_${minq}`),
        type: "bulk",
        label,
        min_qty: minq,
        max_qty: maxq ?? null,
        unit_price: up,
      };
    })
    .filter(Boolean) as OnlineOptionLite[];

  const exact = options
    .filter((o) => o.type === "exact")
    .sort((a, b) => Number(a.qty ?? 0) - Number(b.qty ?? 0));
  const bulk = options
    .filter((o) => o.type === "bulk")
    .sort((a, b) => Number(a.min_qty ?? 0) - Number(b.min_qty ?? 0));

  return { unit, is_weight, min, step, options: [...exact, ...bulk] };
}

function pickUnitPriceLite(cfg: OnlineConfigLite, basePrice: number, qty: number): number {
  const q2 = Number(qty.toFixed(3));

  const exact = cfg.options.find(
    (o) => o.type === "exact" && Number(((o as any).qty ?? 0).toFixed(3)) === q2
  ) as any;
  if (exact) return Number(exact.unit_price) || 0;

  const bulk = (cfg.options as any[])
    .filter(
      (o) =>
        o.type === "bulk" &&
        Number(o.min_qty ?? 0) <= qty &&
        (o.max_qty == null || qty <= Number(o.max_qty))
    )
    .sort((a, b) => Number(b.min_qty ?? 0) - Number(a.min_qty ?? 0))[0];

  if (bulk) return Number(bulk.unit_price) || 0;

  return Number(basePrice) || 0;
}

function fmtQty(qty: number, unit: string, isWeight: boolean) {
  if (!isWeight) return `${Math.round(qty)} ${unit}`;
  if (qty > 0 && qty < 1) return `${Math.round(qty * 1000)} g`;
  return `${Number(qty.toFixed(2))} ${unit}`;
}

function prettyTitleFromSlug(s: string) {
  const raw = String(s ?? "").trim();
  if (!raw) return "";
  // if you stored pretty names with spaces already, keep as-is
  if (raw.includes(" ")) return raw;
  // otherwise convert kebab-case to title case
  const parts = raw.split("-").filter(Boolean);
  const titled = parts
    .map((p) => {
      // keep numbers like 2.5kg
      if (/^\d/.test(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
  return titled;
}

export default function CartPage() {
  const { items, setQty, removeItem, clearCart } = useCart();
  const cartItems: CartItem[] = Array.isArray(items) ? (items as any) : [];

  // Loaded data
  const [productMap, setProductMap] = useState<Record<string, any>>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      const pids = Array.from(new Set(cartItems.map((x) => String(x.productId)).filter(Boolean)));

      if (!pids.length) {
        if (!alive) return;
        setProductMap({});
        return;
      }

      try {
        // 1) Products (current schema)
        const products = await getProductsByIds(pids);

        if (!alive) return;

        // Build product map
        const pm: Record<string, any> = {};
        for (const p of products ?? []) pm[String((p as any).id)] = p;

        setProductMap(pm);
      } catch (e) {
        console.error("cart load error", e);
        if (!alive) return;
        setProductMap({});
      }
    })();

    return () => {
      alive = false;
    };
  }, [cartItems]);

  const rows = useMemo(() => {
    const list = (cartItems ?? [])
      .map((ci) => {
        const product = productMap[String(ci.productId)];
        if (!product) return null;

        // Only show online products
        if (product.is_online === false) return null;

        const cfg = normalizeConfigLite(product?.online_config, product);

        const basePrice = Number(product.price ?? 0);
        const qty = normalizeQty(Number(ci.qty ?? cfg.min), cfg.min, cfg.step, cfg.is_weight);
        const unitPrice = pickUnitPriceLite(cfg, basePrice, qty);
        const lineTotal = unitPrice * qty;

        const imgUrl = safeImg(product?.img) || "";

        const rawSlug = String(product.slug ?? "").trim();
        const title = prettyTitleFromSlug(rawSlug) || "Product";

        const baseTotal = basePrice * qty;
        const discountAmount = Math.max(0, baseTotal - lineTotal);

        return {
          key: `${ci.productId}-${ci.variantId ?? "no-variant"}`,
          ci,
          title,
          slug: rawSlug,
          imgUrl,
          cfg,
          unitPrice,
          basePrice,
          qty,
          lineTotal,
          baseTotal,
          discountAmount,
        };
      })
      .filter(Boolean) as any[];

    return list;
  }, [cartItems, productMap]);

  const subtotal = useMemo(() => rows.reduce((s, r) => s + (r?.lineTotal ?? 0), 0), [rows]);
  const originalSubtotal = useMemo(() => rows.reduce((s, r) => s + (r?.baseTotal ?? 0), 0), [rows]);
  const discountTotal = useMemo(() => rows.reduce((s, r) => s + (r?.discountAmount ?? 0), 0), [rows]);
  const total = subtotal;

  const canCheckout = rows.length > 0;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-md px-4 py-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold">Cart</h1>
          {rows.length ? (
            <button
              onClick={clearCart}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 border rounded-2xl p-8 text-center">
            <p className="text-base font-semibold">Your cart is empty</p>
            <p className="text-sm text-gray-600 mt-1">Add items to checkout.</p>
            <Link
              href="/"
              className="inline-flex mt-5 px-5 py-2 rounded-full bg-[#0B6EA9] text-white text-sm font-semibold"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="border rounded-2xl p-3">
                <div className="flex gap-3">
                  {r.imgUrl ? (
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 grid place-items-center">
                      <Image
                        src={r.imgUrl}
                        alt={r.title}
                        width={120}
                        height={120}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gray-50 flex-shrink-0 grid place-items-center text-xs text-gray-400">
                      No photo
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={r.slug ? `/product/${encodeURIComponent(r.slug)}` : "#"}
                          className="font-semibold line-clamp-2"
                        >
                          {r.title}
                        </Link>
                        <div className="mt-1 text-sm text-gray-600">
                          <span className="font-semibold">{money(r.unitPrice)}</span>
                          <span className="text-xs text-gray-500"> / {r.cfg?.unit ?? "pcs"}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => removeItem(r.ci.productId, r.ci.variantId)}
                        className="p-2 rounded-xl hover:bg-gray-50 text-sm text-gray-700"
                        aria-label="Remove item"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="inline-flex items-center border rounded-full overflow-hidden">
                        <button
                          onClick={() => {
                            const step = Number(r.cfg?.step ?? 1);
                            const min = Number(r.cfg?.min ?? 1);
                            const isW = !!r.cfg?.is_weight;
                            const next = Number(r.qty) - step;

                            // if next would drop below min, remove item from cart
                            if (next < min || next <= 0) {
                              removeItem(r.ci.productId, r.ci.variantId);
                              return;
                            }

                            setQty(r.ci.productId, r.ci.variantId, normalizeQty(next, min, step, isW));
                          }}
                          className="px-4 py-2 hover:bg-gray-50"
                        >
                          −
                        </button>
                        <span className="px-4 py-2 text-sm font-semibold">
                          {fmtQty(Number(r.qty), r.cfg?.unit ?? "pcs", !!r.cfg?.is_weight)}
                        </span>
                        <button
                          onClick={() => {
                            const step = Number(r.cfg?.step ?? 1);
                            const min = Number(r.cfg?.min ?? 1);
                            const isW = !!r.cfg?.is_weight;
                            const next = Number(r.qty) + step;
                            setQty(r.ci.productId, r.ci.variantId, normalizeQty(next, min, step, isW));
                          }}
                          className="px-4 py-2 hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-sm font-extrabold">{money(r.lineTotal)}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="border rounded-2xl p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Subtotal</span>
                <span className="font-semibold">{money(subtotal)}</span>
              </div>

              {discountTotal > 0.0001 ? (
                <>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-gray-500">Original</span>
                    <span className="text-gray-400 line-through font-semibold">{money(originalSubtotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-gray-700">Discount</span>
                    <span className="text-red-600 font-extrabold">- {money(discountTotal)}</span>
                  </div>
                </>
              ) : null}

              <div className="border-t mt-3 pt-3 flex justify-between">
                <span className="font-extrabold">Total</span>
                <span className="font-extrabold">{money(total)}</span>
              </div>

              <Link
                href={canCheckout ? "/checkout" : "#"}
                className={`mt-4 inline-flex w-full justify-center rounded-full py-3 text-sm font-semibold ${
                  !canCheckout
                    ? "bg-gray-200 text-gray-500 pointer-events-none"
                    : "bg-[#0B6EA9] text-white hover:opacity-95"
                }`}
              >
                Checkout
              </Link>

              <div className="mt-3 text-xs text-gray-500 text-center">
                Secure checkout • Fast delivery
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
