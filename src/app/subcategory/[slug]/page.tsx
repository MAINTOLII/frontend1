"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import LeftRail from "./components/LeftRail";
import StickyCartBar from "./components/StickyCartBar";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import TopNavbar from "@/components/TopNavbar";
import {
  fetchSubcategoryBySlug,
  fetchSubSubcategoriesBySubcategoryId,
  fetchProductsBySubcategoryId,
  safeImg,
} from "@/lib/db";
import ProductGrid from "./components/ProductGrid";
import ProductAdd from "./components/ProductAdd";
import {
  money,
  parseNum,
  normalizeQty,
  normalizeConfigLite,
  pickUnitPriceLite,
  fmtQty,
  getLabel,
  prettyTitleFromSlug,
  pctOff,
  type OnlineConfigLite,
  type OnlineOptionLite,
} from "./helpers";
/** ===== helpers ===== */

function BulkHint({ cfg }: { cfg: OnlineConfigLite }) {
  const bulk = cfg.options.filter((o) => o.type === "bulk") as OnlineOptionLite[];
  if (!bulk.length) return null;
  const best = bulk.sort((a, b) => Number(a.min_qty ?? 0) - Number(b.min_qty ?? 0))[0];
  const minq = Number(best.min_qty ?? 0);
  if (!Number.isFinite(minq) || minq <= 0) return null;
  return (
    <div className="mt-1 text-[10px] text-gray-600 font-semibold">
      Bulk: {money(best.unit_price)} / {cfg.unit} from {minq}+ {cfg.unit}
    </div>
  );
}

/** ===== page ===== */
export default function SubcategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { items } = useCart();
  const { lang } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [currentSub, setCurrentSub] = useState<any | null>(null);
  const [ssList, setSsList] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [activeSS, setActiveSS] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

  const paneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setActiveSS(null);

    (async () => {
      try {
        const sub = await fetchSubcategoryBySlug(String(slug));
        if (!alive) return;

        if (!sub) {
          setCurrentSub(null);
          setSsList([]);
          setProducts([]);
          return;
        }

        let sss: any[] = [];
        let prods: any[] = [];

        try {
          const res = await Promise.all([
            fetchSubSubcategoriesBySubcategoryId(sub.id),
            fetchProductsBySubcategoryId(sub.id),
          ]);
          if (!alive) return;
          sss = (res?.[0] ?? []) as any[];
          prods = (res?.[1] ?? []) as any[];
        } catch (inner: any) {
          console.error("SUBCATEGORY DATA LOAD ERROR", inner?.message ?? inner, inner?.details ?? "", inner);
          if (!alive) return;
          sss = [];
          prods = [];
        }

        setCurrentSub(sub);
        setSsList(Array.isArray(sss) ? sss : []);
        setProducts(Array.isArray(prods) ? prods : []);

        // init per-product qty drafts (min)
        setQtyDraft((prev) => {
          const next = { ...prev };
          for (const p of prods ?? []) {
            const pid = String((p as any)?.id);
            if (!pid) continue;
            if (next[pid] === undefined) {
              const cfg = normalizeConfigLite((p as any)?.online_config, p);
              next[pid] = String(cfg.min);
            }
          }
          return next;
        });

        requestAnimationFrame(() => {
          try {
            paneRef.current?.scrollTo({ top: 0 });
          } catch {}
        });
      } catch (e: any) {
        console.error("SUBCATEGORY LOAD ERROR", e?.message ?? e, e?.details ?? "", e);
        if (!alive) return;
        setCurrentSub(null);
        setSsList([]);
        setProducts([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (justAddedId === null) return;
    const t = setTimeout(() => setJustAddedId(null), 900);
    return () => clearTimeout(t);
  }, [justAddedId]);

  /** ===== Product image (products.img) ===== */
  const getProductImageUrl = (p: any) => {
    const raw = String(p?.img ?? "").trim();
    if (!raw) return "";

    const direct = safeImg(raw);
    if (direct) return direct;

    const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
    if (!base) return "";

    if (raw.startsWith("product-images/")) {
      return encodeURI(`${base}/storage/v1/object/public/${raw}`);
    }

    if (raw.startsWith("products/") || raw.startsWith("subcategories/") || raw.startsWith("categories/")) {
      return encodeURI(`${base}/storage/v1/object/public/product-images/${raw}`);
    }

    if (
      !raw.includes("/") &&
      (raw.endsWith(".png") || raw.endsWith(".jpg") || raw.endsWith(".jpeg") || raw.endsWith(".webp") || raw.endsWith(".gif"))
    ) {
      return encodeURI(`${base}/storage/v1/object/public/product-images/products/${raw}`);
    }

    return encodeURI(`${base}/storage/v1/object/public/${raw}`);
  };

  const getProductPrice = (p: any) => Number(p?.price ?? 0);

  const baseList = useMemo(() => products, [products]);

  const filtered = useMemo(() => {
    let list = baseList as any[];

    if (activeSS) {
      const ss = ssList.find((x: any) => x.slug === activeSS);
      if (ss) {
        list = list.filter((p: any) => String(p.subsubcategory_id) === String(ss.id));
      }
    }

    return list;
  }, [activeSS, baseList, ssList]);

  const activeObj = activeSS ? ssList.find((x: any) => x.slug === activeSS) : null;

  // ONE language only
  const titlePrimary = activeObj ? getLabel(activeObj, lang) : getLabel(currentSub, lang);

  const seoLine =
    lang === "so"
      ? `Ka hel ${titlePrimary} online MatoMart – raashin iyo alaabooyin tayo leh oo lagu keeno gudaha Soomaaliya.`
      : `Shop ${titlePrimary} online in Somalia with MatoMart – quality groceries and essentials delivered fast.`;

  /** ===== Cart totals ===== */
  const cartTotals = useMemo(() => {
    let total = 0;
    let count = 0;

    for (const it of items ?? []) {
      const pid = String((it as any).productId);
      const p: any = (products ?? []).find((x: any) => String(x.id) === pid);
      if (!p) continue;

      const qty = Number((it as any).qty ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const basePrice = Number(p?.price ?? 0);
      const cfg = normalizeConfigLite(p?.online_config, p);
      const unitPrice = pickUnitPriceLite(cfg, basePrice, qty);

      total += unitPrice * qty;
      count += qty;
    }

    return { total, count };
  }, [items, products]);

  /** ===== JSON-LD ===== */
  const jsonLdString = useMemo(() => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = origin ? `${origin}/subcategory/${String(slug)}` : undefined;

      const list = (baseList as any[]).map((p, index) => {
        const ps = p?.slug ? encodeURIComponent(String(p.slug)) : "";
        const prodUrl = origin ? `${origin}/product/${ps}` : `/product/${ps}`;
        return {
          "@type": "Product",
          position: index + 1,
          name: prettyTitleFromSlug(p.slug ?? ""),
          url: prodUrl,
        };
      });

      const ld: any = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: titlePrimary,
        description: seoLine,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: list.length,
          itemListElement: list,
        },
      };

      if (url) ld.url = url;
      return JSON.stringify(ld);
    } catch {
      return "";
    }
  }, [slug, baseList, titlePrimary, seoLine]);

  if (!loading && !currentSub) {
    return <main className="min-h-screen bg-white p-6 text-black">Subcategory not found.</main>;
  }

  const ProductAddBound = ({ p }: { p: any }) => (
    <ProductAdd p={p} setJustAddedId={setJustAddedId} setQtyDraft={setQtyDraft} />
  );

  const hasRail = ssList.length > 0;

  return (
    <>
      {jsonLdString && (
        <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: jsonLdString }} />
      )}

<main className="h-screen bg-[#F5FAFF] pb-0 overflow-hidden flex flex-col"><TopNavbar />

        {/* TITLE (single language) */}
        <section className="bg-white border-b">
          <div className="mx-auto max-w-md px-4 py-2 flex items-center justify-between">
            <div className="leading-tight">
              <div className="text-[15px] font-extrabold tracking-tight text-gray-900">{loading ? "..." : titlePrimary}</div>
            </div>
            <div className="w-8" />
          </div>
        </section>

        {/* MAIN */}
<section
  className={`mx-auto max-w-md grid flex-1 min-h-0 ${hasRail ? "grid-cols-[130px_1fr]" : "grid-cols-1"}`}
>
          {/* LEFT RAIL */}
{hasRail && (
  <LeftRail
    ssList={ssList}
    activeSS={activeSS}
    setActiveSS={setActiveSS}
    lang={lang}
    paneRef={paneRef}
  />
)}

          {/* RIGHT GRID (scrollable) */}
         <ProductGrid
  paneRef={paneRef}
  loading={loading}
  filtered={filtered}
  lang={lang}
  justAddedId={justAddedId}
  qtyDraft={qtyDraft}
  seoLine={seoLine}
  money={money}
  parseNum={parseNum}
  normalizeQty={normalizeQty}
  normalizeConfigLite={normalizeConfigLite}
  pickUnitPriceLite={pickUnitPriceLite}
  pctOff={pctOff}
  fmtQty={fmtQty}
  prettyTitleFromSlug={prettyTitleFromSlug}
  getProductPrice={getProductPrice}
  getProductImageUrl={getProductImageUrl}
  BulkHint={BulkHint}
  ProductAdd={ProductAddBound}
/>
        </section>

        {/* STICKY CART BAR */}
<StickyCartBar count={cartTotals.count} total={cartTotals.total} lang={lang} />
      </main>
    </>
  );
}