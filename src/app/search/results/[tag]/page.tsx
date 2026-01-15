"use client";

import TopNavbar from "@/components/TopNavbar";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/context/CartContext";

import { supabase } from "@/lib/supabaseClient";
import { fetchProductImagesByProductIds, safeImg } from "@/lib/db";

function normalizeTag(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

function moneyUSD(n: number) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export default function SearchResultsPage() {
  const params = useParams() as { tag?: string };
  const decodedTag = normalizeTag(decodeURIComponent(params?.tag ?? ""));
  const { addItem } = useCart();

  const [products, setProducts] = useState<any[]>([]);
  const [productImages, setProductImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        // 1) Load products (include tags so we can match)
        const pRes = await supabase
          .from("products")
          .select("id,slug,tags,price,is_online")
          .limit(5000);

        // IMPORTANT: supabase does not throw on query errors; it returns them.
        if (pRes.error) {
          throw pRes.error;
        }

        if (!alive) return;
        const prods = Array.isArray(pRes.data) ? pRes.data : [];
        setProducts(prods);

        // 2) Find matched product IDs (be tolerant: tags can be text[], json, or a string)
        const matchedIds = prods
          .filter((p: any) => {
            const rawTags = (p as any)?.tags;

            // tags might be: text[] | json[] | string | null
            const asArray = Array.isArray(rawTags)
              ? rawTags
              : typeof rawTags === "string"
              ? rawTags.split(",")
              : [];

            const tags = asArray
              .map((t: any) => normalizeTag(t))
              .filter(Boolean);

            return decodedTag ? tags.includes(decodedTag) : false;
          })
          .map((p: any) => p.id);

        if (!decodedTag || matchedIds.length === 0) {
          setProductImages([]);
          return;
        }

        // 3) Load images for matched products only.
        // If images fail due to RLS or missing table/bucket, still show products.
        try {
          const imgs = await fetchProductImagesByProductIds(matchedIds);
          if (!alive) return;
          setProductImages(Array.isArray(imgs) ? imgs : []);
        } catch (imgErr: any) {
          console.warn(
            "SEARCH RESULTS IMAGES LOAD WARNING",
            imgErr?.message ?? imgErr,
            imgErr?.details ?? "",
            imgErr
          );
          if (!alive) return;
          setProductImages([]);
        }
      } catch (e: any) {
        console.error(
          "SEARCH RESULTS LOAD ERROR",
          e?.message ?? e,
          e?.details ?? "",
          e
        );
        if (!alive) return;
        // keep UI usable
        setProducts([]);
        setProductImages([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [decodedTag]);

  const matched = useMemo(() => {
    if (!decodedTag) return [];

    return products.filter((p: any) => {
      const rawTags = (p as any)?.tags;
      const asArray = Array.isArray(rawTags)
        ? rawTags
        : typeof rawTags === "string"
        ? rawTags.split(",")
        : [];

      const tags = asArray.map((t: any) => normalizeTag(t)).filter(Boolean);
      return tags.includes(decodedTag) && p.is_online !== false;
    });
  }, [products, decodedTag]);

  function getProductPrice(p: any) {
    const v = Number(p?.price ?? 0);
    return Number.isFinite(v) ? v : 0;
  }

  function getPrimaryImageUrl(productId: string | number) {
    const list = (productImages ?? [])
      .filter((im: any) => String(im.product_id) === String(productId))
      .slice()
      .sort((a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));

    const first = list[0];
    return first?.path ? safeImg(first.path) : "";
  }

  return (
    <>
      <TopNavbar />

      <main className="max-w-md mx-auto p-4 bg-white min-h-screen text-[#0B6EA9] flex flex-col gap-4">
        {/* Heading */}
        <h2 className="text-lg font-semibold">
          Results for: <span className="font-bold">&quot;{decodedTag}&quot;</span>
        </h2>

        {/* Loading State */}
        {loading && <div className="mt-10 text-center text-base">Loading products…</div>}

        {/* No Results */}
        {!loading && matched.length === 0 && (
          <div className="text-center mt-8 text-base">
            No results found.
            <br />
            <a
              href="https://wa.me/252622073874"
              className="underline font-bold text-[#0B6EA9]"
            >
              Contact us on WhatsApp 📩
            </a>
          </div>
        )}

        {/* Product Grid */}
        {!loading && matched.length > 0 && (
          <section className="grid grid-cols-2 gap-4">
            {matched.map((p: any) => {
              const img = getPrimaryImageUrl(p.id);
              const price = getProductPrice(p);

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl shadow-sm p-2 flex flex-col gap-2"
                >
                  <Link href={`/product/${encodeURIComponent(String(p.slug ?? ""))}`} className="block">
                    <div className="relative">
                      {img ? (
                        <Image
                          src={img}
                          alt={String(p.slug ?? "Product")}
                          width={200}
                          height={200}
                          className="object-contain w-full h-40 rounded-lg bg-white"
                        />
                      ) : (
                        <div className="w-full h-40 rounded-lg bg-gray-50 grid place-items-center text-xs text-gray-400">
                          No image
                        </div>
                      )}
                    </div>

                    <p className="mt-2 text-sm font-medium line-clamp-2">{String(p.slug ?? "—")}</p>

                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-bold text-md">
                        {price > 0 ? moneyUSD(price) : "—"}
                      </span>
                    </div>
                  </Link>

                  <button
                    onClick={() => {
                      addItem(String(p.id) as any, null as any, 1);
                      setJustAddedId(String(p.id));
                      window.setTimeout(() => setJustAddedId(null), 900);
                    }}
                    className="w-full bg-[#0B6EA9] text-white rounded-full py-2 mt-auto"
                  >
                    {justAddedId === String(p.id) ? "Added ✓" : "+ Add to Cart"}
                  </button>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </>
  );
}