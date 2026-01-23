"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";
import { useCart } from "@/context/CartContext";

export default function ProductGrid({
  paneRef,
  loading,
  filtered,
  lang,
  justAddedId,
  qtyDraft,
  seoLine,
  money,
  parseNum,
  normalizeQty,
  normalizeConfigLite,
  pickUnitPriceLite,
  pctOff,
  fmtQty,
  prettyTitleFromSlug,
  getProductPrice,
  getProductImageUrl,
  BulkHint,
  ProductAdd,
}: any) {
  const { items: cartItems, addItem, setQty } = useCart();

  return (
    <div ref={paneRef} className="min-h-0 overflow-y-auto p-0.5 pb-28 bg-white">
      <div className="grid grid-cols-2 gap-2">
        {loading ? (
          <div className="col-span-2 bg-white rounded-2xl border p-4 text-sm text-gray-600">Loading...</div>
        ) : (
          <>
            {filtered.map((p: any) => {
              const pid = String(p.id);
              const rawSlug = String(p.slug ?? "");
              const name = prettyTitleFromSlug(rawSlug) || rawSlug;
              const basePrice = getProductPrice(p);
              const imgUrl = getProductImageUrl(p);

              const cfg = normalizeConfigLite(p?.online_config, p);
              const rawDraft = qtyDraft[pid] ?? String(cfg.min);
              const draftNum = parseNum(rawDraft);
              const draftQty = normalizeQty(
                Number.isFinite(draftNum) ? draftNum : cfg.min,
                cfg.min,
                cfg.step,
                cfg.is_weight
              );

              const unitPrice = pickUnitPriceLite(cfg, basePrice, draftQty);
              const lineTotal = unitPrice * draftQty;
              const baseTotal = Number(basePrice) * draftQty;
              const off = pctOff(baseTotal, lineTotal);
              const hasTiers = (cfg.options?.length ?? 0) > 0;

              const cartItem = (cartItems ?? []).find((i: any) => String(i.productId) === pid);
              const inCartQty = Number(cartItem?.qty ?? 0);
              const inCart = inCartQty > 0;
              const outOfStock = Number(p?.qty ?? 0) <= 0;

              const onPlus = () => {
                if (outOfStock) return;
                if (!inCart) {
                  const startQty = normalizeQty(cfg.min, cfg.min, cfg.step, cfg.is_weight);
                  try {
                    (addItem as any)(pid, null as any, startQty);
                  } catch {}
                  return;
                }
                const next = normalizeQty(inCartQty + cfg.step, cfg.min, cfg.step, cfg.is_weight);
                try {
                  (setQty as any)(pid, null as any, next);
                } catch {}
              };

              const onRemove = () => {
                try {
                  (setQty as any)(pid, null as any, 0);
                } catch {}
              };

              return (
                <div key={pid} className="rounded-2xl overflow-visible">
                  <div className="px-1 pt-1">
                    <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-white">
                      {justAddedId === pid ? (
                        <div className="absolute left-2 top-2 text-[10px] px-2 py-1 rounded-full bg-[#0B6EA9] text-white font-extrabold shadow">
                          {lang === "en" ? "Added" : "Waa la daray"} ✓
                        </div>
                      ) : null}

                      <Link href={`/product/${encodeURIComponent(rawSlug)}`} className="block">
                        <div className="relative w-full h-48">
                          {imgUrl ? (
                            <Image src={imgUrl} alt={name || "Product"} fill className="object-contain p-2" />
                          ) : (
                            <div className="w-full h-48 grid place-items-center text-[11px] text-gray-400">
                              {lang === "en" ? "No image" : "Sawir ma jiro"}
                            </div>
                          )}
                        </div>
                      </Link>

                      {/**
<div className="absolute left-2 bottom-2">
  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-sm px-2.5 py-1 border border-[#0B6EA9]/30 text-[#0B6EA9] font-black text-[11px] shadow-sm">
    <span>NOW</span>
  </div>
</div>
*/}

                      <div className={inCart ? "absolute left-1/2 -translate-x-1/2 bottom-2" : "absolute right-1 bottom-1"}>
                        <div className="flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-xl px-2.5 py-1.5 shadow">
                          {!inCart ? (
                            <button
                              type="button"
                              onClick={onPlus}
                              disabled={outOfStock}
                              className={`h-9 w-9 rounded-lg text-white text-lg font-black grid place-items-center shadow active:scale-[0.98] transition ${
                                outOfStock ? "bg-gray-400 cursor-not-allowed" : "bg-[#084F85]"
                              }`}
                              aria-label="add"
                            >
                              +
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextRaw = inCartQty - cfg.step;
                                  if (nextRaw <= 0) {
                                    onRemove();
                                  } else {
                                    const next = normalizeQty(nextRaw, cfg.min, cfg.step, cfg.is_weight);
                                    try {
                                      (setQty as any)(pid, null as any, next);
                                    } catch {}
                                  }
                                }}
                                className="h-9 w-9 rounded-lg bg-gray-200 text-gray-800 text-lg font-black grid place-items-center active:scale-[0.98] transition"
                                aria-label="decrease"
                              >
                                −
                              </button>

                              <div className="min-w-[24px] text-center text-[13px] font-extrabold text-gray-900">
                                {fmtQty(inCartQty, cfg.unit, cfg.is_weight)}
                              </div>

                              <button
                                type="button"
                                onClick={onPlus}
                                className="h-9 w-9 rounded-lg bg-[#084F85] text-white text-lg font-black grid place-items-center shadow active:scale-[0.98] transition"
                                aria-label="increase"
                              >
                                +
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-2 pt-0.5 pb-1.5">
                    <div className="text-[13px] font-medium tracking-wide text-gray-800 line-clamp-2 min-h-[26px]">
                      {name || "—"}
                    </div>

                    <div className="mt-0.5 flex items-end justify-between gap-1">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <div className="text-[18px] font-extrabold tracking-tight text-gray-900 leading-none">
                            {money(lineTotal)}
                          </div>
                          {off >= 5 ? (
                            <div className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#E6F4FF] text-[#0B6EA9]">
                              -{off}%
                            </div>
                          ) : null}
                        </div>

                        {hasTiers ? <BulkHint cfg={cfg} /> : null}
                      </div>

                      {off >= 5 ? (
                        <div className="text-right">
                          <div className="text-[10px] text-gray-400 line-through font-bold">{money(baseTotal)}</div>
                        </div>
                      ) : null}
                    </div>

                    {Number(p?.qty ?? 0) <= 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-[11px] font-extrabold text-red-600">
                        {lang === "en" ? "Out of stock" : "Waa ka dhammaatay"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="col-span-2 bg-white rounded-2xl border p-4 text-sm text-gray-600">
                {lang === "en" ? "No products found in this section." : "Alaab lagama helin qaybtaan."}
              </div>
            )}
          </>
        )}
      </div>

      {!loading && (
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-3 text-[10px] text-gray-500 leading-snug">
          {seoLine}
        </div>
      )}
    </div>
  );
}