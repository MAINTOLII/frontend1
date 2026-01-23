"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import {
  money,
  slugify,
  prettyTitleFromSlug,
  normalizeConfigLite,
  normalizeQty,
  pickUnitPriceLite,
  buildPublicImageUrl,
  type ProductRow,
} from "../helpers";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface BoughtTogetherProps {
  fbw: ProductRow[];
  addItem: any;
  triggerAddedFlash: (msg: string) => void;
}

export default function BoughtTogether({
  fbw,
  addItem,
  triggerAddedFlash,
}: BoughtTogetherProps) {
  const { lang } = useLanguage() as any;
  const isEn = lang === "en";

  const [rows, setRows] = useState<any[]>([]);

  const idsKey = useMemo(() => {
    return (fbw ?? []).map((r: any) => String(r?.id ?? "")).filter(Boolean).sort().join(",");
  }, [fbw]);

  useEffect(() => {
    let alive = true;

    async function run() {
      const baseRows = Array.isArray(fbw) ? fbw : [];
      if (baseRows.length === 0) {
        if (alive) setRows([]);
        return;
      }

      // default: no discounts
      let merged = baseRows.map((r: any) => ({ ...r, discount_price: r?.discount_price ?? null }));

      try {
        const ids = baseRows.map((r: any) => String(r?.id ?? "")).filter(Boolean);
        if (ids.length === 0) {
          if (alive) setRows(merged);
          return;
        }

        const dRes = await supabase
          .from("discounts")
          .select("product_id,discount_price,sort_order,is_active")
          .in("product_id", ids)
          .eq("is_active", true)
          .order("product_id", { ascending: true })
          .order("sort_order", { ascending: true });

        const best: Record<string, number> = {};
        for (const d of dRes.data ?? []) {
          const pid = String((d as any)?.product_id ?? "");
          const dp = Number((d as any)?.discount_price);
          if (!pid || !Number.isFinite(dp)) continue;
          if (best[pid] == null) best[pid] = dp; // lowest sort_order wins
        }

        merged = merged.map((r: any) => ({ ...r, discount_price: best[String(r.id)] ?? null }));
      } catch {
        // keep merged as-is
      }

      if (alive) setRows(merged);
    }

    run();
    return () => {
      alive = false;
    };
  }, [idsKey, fbw]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="px-4 pb-6">
      <div className="flex items-center justify-between">
        <div className="text-sm font-extrabold text-gray-900">
          {isEn ? "Frequently bought together" : "Badanaa lala iibsado"}
        </div>
        <div className="text-[11px] font-semibold text-gray-500">
          {isEn ? "Same section" : "Isla qayb"}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {rows.map((rp: any) => {
          const rTitle = prettyTitleFromSlug(rp.slug) || rp.slug;
          const rImg = buildPublicImageUrl(rp.img);
          const rCfg = normalizeConfigLite(rp.online_config, rp);
          const rStartQty = normalizeQty(rCfg.min, rCfg.min, rCfg.step, !!rCfg.is_weight);

          const originalUnit = Number(rp.price ?? 0);
          const discountedUnit = rp?.discount_price != null ? Number(rp.discount_price) : originalUnit;

          const rUnitPrice = pickUnitPriceLite(rCfg, discountedUnit, rStartQty);

          const rBaseTotal = originalUnit * rStartQty;
          const rLineTotal = rUnitPrice * rStartQty;
          const rIsDiscount = Number.isFinite(discountedUnit) && discountedUnit < originalUnit;

          return (
            <div key={rp.id} className="rounded-2xl border bg-white p-3">
              <Link href={`/product/${encodeURIComponent(slugify(rp.slug))}`} className="block">
                <div className="relative h-48 w-full rounded-xl overflow-hidden border">
                  <Image
                    src={rImg || "/example.png"}
                    alt={rTitle}
                    fill
                    className="object-cover scale-75"
                  />
                </div>

                <div className="mt-3 text-[14px] font-semibold text-gray-800 line-clamp-2 min-h-[40px]">
                  {rTitle}
                </div>

                <div className="mt-1">
                  <div className={`text-[14px] font-bold ${rIsDiscount ? "text-red-600" : "text-gray-900"}`}>
                    {money(rLineTotal)}
                  </div>

                  {rIsDiscount ? (
                    <div className="text-[10px] text-gray-400 font-bold line-through">{money(rBaseTotal)}</div>
                  ) : null}
                </div>
              </Link>

              <button
                type="button"
                onClick={() => {
                  if (typeof addItem === "function") {
                    (addItem as any)(String(rp.id), null as any, rStartQty);
                    triggerAddedFlash(isEn ? "Added to cart" : "Waa lagu daray Cart");
                  }
                }}
                className="mt-2 w-full h-9 rounded-xl bg-[#0B6EA9] hover:bg-[#095a88] text-white text-[12px] font-extrabold active:scale-[0.99] transition-colors"
              >
                {isEn ? "Add" : "Ku dar"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}