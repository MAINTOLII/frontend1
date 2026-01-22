/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// DB shape (recommended): discounts.product_id -> products.id
// We select the discount row + the related product.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

type DiscountRow = {
  id: string;
  product_id: string;
  discount_price: number;
  is_active: boolean | null;
  sort_order: number | null;
  product?: ProductRow | null;
};

type ProductRow = {
  id: string;
  slug: string | null;
  img: string | null;
  price: number | null;
  subsubcategory_id: number | null;
};

function money(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  // keep simple: $12.00
  return `$${Number(n).toFixed(2)}`;
}

export default function Promo({
  lang = "en",
  limit = 10,
  seeAllHref = "/discounts",
  onAddToCart,
  variant = "row",
  showHeader = true,
  showSeeAll = true,
  title = "Discounted Items",
  minPercent = 0,
  categoryGroup = "All",
}: {
  lang?: "en" | "so";
  limit?: number;
  seeAllHref?: string;
  onAddToCart?: (productId: string) => void;
  variant?: "row" | "grid";
  showHeader?: boolean;
  showSeeAll?: boolean;
  title?: string;
  minPercent?: number;
  categoryGroup?: "All" | "food" | "baby" | "cosmetics" | "household" | "other";
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DiscountRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      if (!supabase) {
        console.error("Supabase not configured");
        setRows([]);
        setLoading(false);
        return;
      }

      try {
        // STEP 1: fetch active discounts
        const discountsRes = await supabase
          .from("discounts")
          .select("id, product_id, discount_price, is_active, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .limit(limit);

        if (discountsRes.error) {
          console.error("DISCOUNTS ERROR:", discountsRes.error);
          throw new Error(discountsRes.error.message);
        }

        const discountRows = discountsRes.data ?? [];

        // STEP 2: fetch related products
        const productIds = discountRows.map((d: any) => d.product_id);

        let productsMap: Record<string, any> = {};

        if (productIds.length > 0) {
          const productsRes = await supabase
            .from("products")
            .select("id, slug, img, price, subsubcategory_id")
            .in("id", productIds);

          if (productsRes.error) {
            console.error("PRODUCTS ERROR:", productsRes.error);
            throw new Error(productsRes.error.message);
          }

          const products = productsRes.data ?? [];
          productsMap = Object.fromEntries(products.map((p: any) => [p.id, p]));
        }

        const merged = discountRows.map((d: any) => ({
          ...d,
          product: productsMap[d.product_id] ?? null,
        }));

        if (!cancelled) setRows(merged);
      } catch (err: any) {
        console.error("PROMO LOAD ERROR:", err?.message ?? err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  const items = useMemo(() => {
    const mapped = rows
      .map((r) => {
        const p = (r as any).product as ProductRow | null | undefined;
        if (!p || !p.id) return null;

        const name = (p.slug ?? "").trim();
        const img =
          typeof p.img === "string" && p.img.trim().length > 0
            ? p.img.trimEnd()
            : "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/subcategories/baleware.webp";

        const originalPrice = p.price ?? 0;
        const discountPrice = r.discount_price ?? 0;

        const percent =
          originalPrice > 0
            ? Math.round(((originalPrice - discountPrice) / originalPrice) * 100)
            : 0;

        const rawSub = p.subsubcategory_id ? String(p.subsubcategory_id) : "";
        const categoryGroup = rawSub.startsWith("1")
          ? "food"
          : rawSub.startsWith("2")
          ? "baby"
          : rawSub.startsWith("3")
          ? "cosmetics"
          : rawSub.startsWith("4")
          ? "household"
          : "other";

        return {
          discountId: r.id,
          productId: p.id,
          slug: p.slug ?? "",
          name,
          img,
          originalPrice,
          discountPrice,
          percent,
          categoryGroup,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.percent - a.percent);

    return mapped as Array<{
      discountId: string;
      productId: string;
      slug: string;
      name: string;
      img: string;
      originalPrice: number;
      discountPrice: number;
      percent: number;
      categoryGroup: string;
    }>;
  }, [rows, lang]);

  const filteredItems = useMemo(() => {
    return items
      .filter((it) => it.percent >= minPercent)
      .filter((it) => (categoryGroup === "All" ? true : it.categoryGroup === categoryGroup));
  }, [items, minPercent, categoryGroup]);

  if (!loading && filteredItems.length === 0) return null;

  return (
    <section className={"bg-white px-4 pt-2 " + (variant === "grid" ? "pb-4" : "")}>
      <div className="mx-auto max-w-md">
        {showHeader ? (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-baseline gap-2">
              <div className="text-[16px] font-extrabold text-[#0B3C6E]">{title}</div>
              <div className="text-[12px] font-extrabold text-[#F59E0B] animate-pulse">Qiimo Dhimis</div>
            </div>
            {showSeeAll ? (
              <Link href={seeAllHref} className="text-[13px] font-bold text-[#0B6EA9]">
                See All ›
              </Link>
            ) : null}
          </div>
        ) : null}

        <div
          className={
            variant === "grid"
              ? "grid grid-cols-2 gap-3"
              : "flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory"
          }
        >
          {(loading ? new Array(3).fill(null) : filteredItems).map((it, i) => {
            if (!it) {
              return (
                <div
                  key={`sk-${i}`}
                  className={
                    (variant === "grid"
                      ? "w-full"
                      : "min-w-[150px] snap-start") +
                    " rounded-2xl border border-[#D9E7F5] bg-white shadow-sm overflow-hidden"
                  }
                >
                  <div className="h-[105px] bg-gray-100 animate-pulse" />
                  <div className="p-3">
                    <div className="h-4 bg-gray-100 rounded w-4/5 animate-pulse" />
                    <div className="mt-2 h-6 bg-gray-100 rounded w-1/2 animate-pulse" />
                    <div className="mt-3 h-10 bg-gray-100 rounded animate-pulse" />
                  </div>
                </div>
              );
            }

            const href = it.slug ? `/product/${encodeURIComponent(it.slug)}` : "#";

            return (
              <div
                key={it.discountId}
                className={
                  (variant === "grid"
                    ? "w-full"
                    : "min-w-[150px] snap-start") +
                  " rounded-2xl border border-[#D9E7F5] bg-white shadow-sm overflow-hidden"
                }
              >
                {/* Image area + discount badge */}
                <Link href={href} className="block relative bg-[#F3F8FF]">
                  <div className="absolute left-2 top-2 z-10">
                    <div className="bg-[#F59E0B] text-white font-extrabold text-[11px] px-2 py-1 rounded-xl shadow">
                      {it.percent}% OFF
                    </div>
                  </div>

                  <div className="absolute right-2 top-2 z-10">
                    <div className="bg-white/90 text-[#0B3C6E] font-extrabold text-[11px] px-2 py-1 rounded-xl shadow-sm border border-gray-200">
                      Was {money(it.originalPrice)}
                    </div>
                  </div>

                  <div className="h-[105px] w-full flex items-center justify-center">
                    <Image
                      src={it.img}
                      alt={it.name || "Discount"}
                      width={150}
                      height={105}
                      className="w-full h-full object-contain p-2"
                    />
                  </div>
                </Link>

                {/* Text + pricing + CTA */}
                <div className="p-3">
                  <div className="text-[13px] font-extrabold text-[#0B3C6E] leading-tight line-clamp-2">
                    {it.name}
                  </div>

                  <div className="mt-2 flex items-end gap-2">
                    <div className="text-[20px] font-extrabold text-red-600">
                      {money(it.discountPrice)}
                    </div>
                    <div className="text-[12px] text-gray-400">
                      Was <span className="line-through">{money(it.originalPrice)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (onAddToCart) onAddToCart(it.productId);
                    }}
                    className="mt-2 w-full rounded-full bg-[#0B6EA9] text-white font-extrabold py-2 text-[12px] flex items-center justify-center gap-2 active:scale-[0.99]"
                    disabled={!onAddToCart}
                    title={!onAddToCart ? "Hook this button to your cart handler via onAddToCart" : ""}
                  >
                    <span className="text-[16px]">🛒</span>
                    <span>Add to Cart</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}