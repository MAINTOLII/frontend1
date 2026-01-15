"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import SearchBar from "@/components/SearchBar";

import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";

import {
  fetchSubcategoryBySlug,
  fetchSubSubcategoriesBySubcategoryId,
  fetchProductsBySubcategoryId,
  safeImg,
} from "@/lib/db";

/** ===== helpers ===== */
function money(n: number) {
  return `$${Number(n ?? 0).toFixed(2)}`;
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
  // exact
  qty?: number | null;
  // bulk
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

  // exact first by qty, then bulk by min_qty
  const exact = options.filter((o) => o.type === "exact").sort((a, b) => Number(a.qty ?? 0) - Number(b.qty ?? 0));
  const bulk = options.filter((o) => o.type === "bulk").sort((a, b) => Number(a.min_qty ?? 0) - Number(b.min_qty ?? 0));

  return { unit, is_weight, min, step, options: [...exact, ...bulk] };
}

function pickUnitPriceLite(cfg: OnlineConfigLite, basePrice: number, qty: number): number {
  const q2 = Number(qty.toFixed(3));

  const exact = cfg.options.find((o: any) => o.type === "exact" && Number(((o as any).qty ?? 0).toFixed(3)) === q2) as any;
  if (exact) return Number(exact.unit_price) || 0;

  const bulk = (cfg.options as any[])
    .filter((o) => o.type === "bulk" && Number(o.min_qty ?? 0) <= qty && (o.max_qty == null || qty <= Number(o.max_qty)))
    .sort((a, b) => Number(b.min_qty ?? 0) - Number(a.min_qty ?? 0))[0];

  if (bulk) return Number(bulk.unit_price) || 0;

  return Number(basePrice) || 0;
}

function fmtQty(qty: number, unit: string, isWeight: boolean) {
  if (!isWeight) return `${Math.round(qty)} ${unit}`;
  if (qty > 0 && qty < 1) return `${Math.round(qty * 1000)} g`;
  return `${Number(qty.toFixed(2))} ${unit}`;
}

function getLabel(obj: any, lang: "so" | "en") {
  const so = obj?.name_so ?? obj?.name ?? obj?.slug ?? "";
  const en = obj?.name_en ?? obj?.name ?? obj?.slug ?? "";
  return lang === "en" ? en : so;
}

function getSecondary(obj: any, lang: "so" | "en") {
  const so = obj?.name_so ?? obj?.name ?? obj?.slug ?? "";
  const en = obj?.name_en ?? obj?.name ?? obj?.slug ?? "";
  return lang === "en" ? so : en;
}

function prettyTitleFromSlug(input: any) {
  // turns `qamar-milk-powder-2.5kg` into `Qamar Milk Powder 2.5kg`
  let s = String(input ?? "").trim();
  if (!s) return "";

  // if it's URL-encoded, decode it safely
  try {
    s = decodeURIComponent(s);
  } catch {
    // ignore
  }

  // if you ever store file paths or full URLs by mistake, just return the last segment
  if (s.includes("/")) {
    const last = s.split("/").filter(Boolean).pop();
    if (last) s = last;
  }

  // normalize separators to spaces
  s = s.replace(/[_+]/g, " ").replace(/-+/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  // Title Case each word (keep numbers as-is)
  s = s
    .split(" ")
    .map((w) => {
      if (!w) return "";
      // keep words that start with a digit as-is (e.g. 2.5kg)
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");

  return s;
}

/** ===== page ===== */
export default function SubcategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { items, addItem, setQty } = useCart();
  const { lang } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [currentSub, setCurrentSub] = useState<any | null>(null);
  const [ssList, setSsList] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [activeSS, setActiveSS] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

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
          // If one of the parallel fetches fails (RLS, missing table, etc.),
          // still show the subcategory shell instead of crashing.
          console.error(
            "SUBCATEGORY DATA LOAD ERROR",
            inner?.message ?? inner,
            inner?.details ?? "",
            inner
          );
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
      } catch (e: any) {
        console.error(
          "SUBCATEGORY LOAD ERROR",
          e?.message ?? e,
          e?.details ?? "",
          e
        );
        if (!alive) return;
        // keep UI usable and avoid stale state
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

  /** ===== Product image (FIXED) + base price ===== */
  /** ===== Product image (products.img) ===== */
const getProductImageUrl = (p: any) => {
  const raw = String(p?.img ?? "").trim();
  if (!raw) return "";

  // already a full URL or local path
  const direct = safeImg(raw);
  if (direct) return direct;

  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!base) return "";

  // 1) "product-images/products/qamar.webp"
  if (raw.startsWith("product-images/")) {
    return encodeURI(`${base}/storage/v1/object/public/${raw}`);
  }

  // 2) "products/qamar.webp" (assume bucket is product-images)
  if (raw.startsWith("products/") || raw.startsWith("subcategories/") || raw.startsWith("categories/")) {
    return encodeURI(`${base}/storage/v1/object/public/product-images/${raw}`);
  }

  // 3) "qamar.webp" (bare filename)
  if (
    !raw.includes("/") &&
    (raw.endsWith(".png") || raw.endsWith(".jpg") || raw.endsWith(".jpeg") || raw.endsWith(".webp") || raw.endsWith(".gif"))
  ) {
    return encodeURI(`${base}/storage/v1/object/public/product-images/products/${raw}`);
  }

  // fallback
  return encodeURI(`${base}/storage/v1/object/public/${raw}`);
};

  const getProductPrice = (p: any) => Number(p?.price ?? 0);

  /** ===== Base list ===== */
  const baseList = useMemo(() => products, [products]);

  const filtered = useMemo(() => {
    let list = baseList as any[];

    if (activeSS) {
      const ss = ssList.find((x: any) => x.slug === activeSS);
      if (ss) {
        // CURRENT DB: products.subsubcategory_id
        list = list.filter((p: any) => String(p.subsubcategory_id) === String(ss.id));
      }
    }

    return list;
  }, [activeSS, baseList, ssList]);

  const activeObj = activeSS ? ssList.find((x: any) => x.slug === activeSS) : null;

  const titlePrimary = activeObj ? getLabel(activeObj, lang) : getLabel(currentSub, lang);
  const titleSecondary = activeObj ? getSecondary(activeObj, lang) : getSecondary(currentSub, lang);

  const seoLine =
    lang === "so"
      ? `Ka hel ${titlePrimary} (${titleSecondary}) online MatoMart – raashin iyo alaabooyin tayo leh oo lagu keeno gudaha Soomaaliya.`
      : `Shop ${titleSecondary} (${titlePrimary}) online in Somalia with MatoMart – quality groceries and essentials delivered fast.`;

  /** ===== Cart totals (use online_config pricing if present) ===== */
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

  /** ===== Subcategory JSON-LD ===== */
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

  function ProductAdd({ p }: { p: any }) {
    const productId = String(p?.id);
    const item = (items ?? []).find((i: any) => String(i.productId) === productId);
    const inCartQty = Number(item?.qty ?? 0);

    const cfg = normalizeConfigLite(p?.online_config, p);

    const rawDraft = qtyDraft[productId] ?? String(cfg.min);
    const draftNum = parseNum(rawDraft);
    const draftQty = normalizeQty(Number.isFinite(draftNum) ? draftNum : cfg.min, cfg.min, cfg.step, cfg.is_weight);

    const exactOptions = cfg.options.filter((o) => o.type === "exact");
    const bulkOptions = cfg.options.filter((o) => o.type === "bulk");

    const applyDraft = (nextQty: number) => {
      const normalized = normalizeQty(nextQty, cfg.min, cfg.step, cfg.is_weight);
      setQtyDraft((prev) => ({ ...prev, [productId]: String(normalized) }));
    };

    const addUsingDraft = () => {
      (addItem as any)(productId, null as any, draftQty);
      setJustAddedId(productId);
    };

    const minus = () => {
      const next = normalizeQty(inCartQty - cfg.step, cfg.min, cfg.step, cfg.is_weight);
      (setQty as any)(productId, null as any, next);
    };

    const plus = () => {
      const next = normalizeQty(inCartQty + cfg.step, cfg.min, cfg.step, cfg.is_weight);
      (setQty as any)(productId, null as any, next);
    };

    return (
      <div className="mt-2">
        {(exactOptions.length > 0 || bulkOptions.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {exactOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => applyDraft(Number(o.qty ?? cfg.min))}
                className="h-8 px-3 rounded-xl border border-gray-200 bg-white text-[11px] font-bold text-gray-900"
              >
                {o.label}
              </button>
            ))}

            {bulkOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => applyDraft(Number(o.min_qty ?? cfg.min))}
                className="h-8 px-3 rounded-xl border border-gray-200 bg-white text-[11px] font-bold text-gray-900"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <input
            className="h-10 w-[110px] rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-900"
            type="number"
            step={String(cfg.step)}
            min={cfg.min}
            value={qtyDraft[productId] ?? String(cfg.min)}
            onChange={(e) => setQtyDraft((prev) => ({ ...prev, [productId]: e.target.value }))}
          />
          <div className="text-[11px] text-gray-500 font-semibold">{fmtQty(draftQty, cfg.unit, cfg.is_weight)}</div>
        </div>

        {!item ? (
          <button
            onClick={addUsingDraft}
            className="mt-2 w-full h-10 rounded-xl border-2 border-[#0B6EA9] text-[#0B6EA9] font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition"
          >
            {lang === "en" ? "Add" : "Ku dar"}{" "}
            <span className="text-xs opacity-80">({fmtQty(draftQty, cfg.unit, cfg.is_weight)})</span>
          </button>
        ) : (
          <div className="mt-2 flex items-center justify-between">
            <button onClick={minus} className="w-10 h-10 rounded-full bg-[#0B6EA9] text-white text-xl font-bold grid place-items-center">
              −
            </button>

            <div className="text-sm font-extrabold text-gray-900">{fmtQty(inCartQty, cfg.unit, cfg.is_weight)}</div>

            <button onClick={plus} className="w-10 h-10 rounded-full bg-[#0B6EA9] text-white text-xl font-bold grid place-items-center">
              +
            </button>
          </div>
        )}
      </div>
    );
  }

  const hasRail = ssList.length > 0;

  return (
    <>
      {jsonLdString && <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: jsonLdString }} />}

      <main className="min-h-screen bg-[#F4F6F8] pb-28">
        <div className="bg-white border-b">
          <div className="mx-auto max-w-md px-4 py-3">
            <SearchBar />
          </div>
        </div>

        {/* TITLE */}
        <section className="bg-white border-b">
          <div className="mx-auto max-w-md px-4 py-2 flex items-center justify-between">
            <div className="leading-tight">
              <div className="text-[13px] font-semibold text-gray-900">{loading ? "..." : titlePrimary}</div>
              <div className="text-[10px] text-gray-500">{loading ? "" : titleSecondary}</div>
              {!loading && <p className="mt-0.5 text-[10px] text-gray-500 max-w-xs leading-snug">{seoLine}</p>}
            </div>
            <div className="w-8" />
          </div>
        </section>

        {/* MAIN */}
        <section className={`mx-auto max-w-md grid ${hasRail ? "grid-cols-[72px_1fr]" : "grid-cols-1"}`}>
          {/* LEFT RAIL */}
          {hasRail && (
            <aside className="bg-gray-50 border-r px-1.5 py-2 space-y-1.5">
              <button
                type="button"
                onClick={() => setActiveSS(null)}
                className={`w-full flex items-center justify-center rounded-xl px-2 py-3 ${
                  activeSS === null ? "bg-[#0B6EA9]/10 border border-[#0B6EA9]" : "bg-white border border-gray-200"
                }`}
              >
                <span className={`text-[11px] font-bold ${activeSS === null ? "text-[#0B6EA9]" : "text-gray-800"}`}>
                  {lang === "en" ? "ALL" : "DHAMMAAN"}
                </span>
              </button>

              {ssList.map((ss: any) => {
                const isActive = activeSS === ss.slug;
                const primary = getLabel(ss, lang);
                const img = safeImg(ss.img);

                return (
                  <button key={ss.id} type="button" onClick={() => setActiveSS(ss.slug)} className="w-full flex flex-col items-center rounded-xl px-1.5 py-2">
                    <div className={`w-14 h-14 rounded-xl overflow-hidden relative border ${isActive ? "border-[#0B6EA9]" : "border-gray-200"} bg-white`}>
                      {img ? (
                        <Image src={img} alt={primary} fill className="object-contain p-2" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[10px] text-gray-400">
                          {lang === "en" ? "No image" : "Sawir ma jiro"}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-center leading-tight">
                      <div className={isActive ? "text-[#0B6EA9] font-semibold" : "text-gray-800 font-semibold"}>{primary}</div>
                    </div>
                  </button>
                );
              })}
            </aside>
          )}

          {/* RIGHT GRID */}
          <div className="p-3">
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

                    // compute pricing based on current draft qty/options
                    const cfg = normalizeConfigLite(p?.online_config, p);
                    const rawDraft = qtyDraft[pid] ?? String(cfg.min);
                    const draftNum = parseNum(rawDraft);
                    const draftQty = normalizeQty(Number.isFinite(draftNum) ? draftNum : cfg.min, cfg.min, cfg.step, cfg.is_weight);

                    const unitPrice = pickUnitPriceLite(cfg, basePrice, draftQty);
                    const lineTotal = unitPrice * draftQty;

                    return (
                      <div key={pid} className="rounded-2xl shadow-sm overflow-hidden border relative flex flex-col bg-white border-gray-200">
                        <div className="relative pt-3 px-3 pb-2 flex-1">
                          {justAddedId === pid ? (
                            <div className="absolute left-2 top-2 text-[11px] px-2 py-1 rounded-full bg-green-600 text-white font-bold shadow">
                              {lang === "en" ? "Added ✓" : "Waa la daray ✓"}
                            </div>
                          ) : null}

                          <Link href={`/product/${encodeURIComponent(rawSlug)}`} className="block">
                            {imgUrl ? (
                              <Image src={imgUrl} alt={name || "Product"} width={220} height={220} className="mx-auto h-32 object-contain w-full" />
                            ) : (
                              <div className="mx-auto h-32 w-full grid place-items-center text-[11px] text-gray-400">
                                {lang === "en" ? "No image" : "Sawir ma jiro"}
                              </div>
                            )}
                          </Link>
                        </div>

                        <div className="px-3 pb-3">
                          <div className="text-[13px] font-semibold text-gray-900 line-clamp-2 min-h-[32px]">{name || "—"}</div>

                          {/* Price (updates based on qty/options) */}
                          <div className="mt-2 flex items-end justify-between gap-2">
                            <div>
                              <div className="text-[18px] font-extrabold text-gray-900 leading-none">{money(lineTotal)}</div>
                              <div className="mt-0.5 text-[10px] text-gray-500 font-semibold">
                                {money(unitPrice)} / {cfg.unit} • {fmtQty(draftQty, cfg.unit, cfg.is_weight)}
                              </div>
                            </div>
                          </div>

                          <div className="h-[8px]" />

                          <div className="mt-1">
                            <ProductAdd p={p} />
                          </div>

                          <div className="mt-1 text-[11px] font-semibold text-[#0F8A4B]">⚡ {lang === "en" ? "Quick" : "Degdeg"}</div>
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
          </div>
        </section>

        {/* STICKY CART BAR (already pushed up above bottom nav) */}
        {cartTotals.count > 0 && (
          <div className="fixed left-0 right-0 z-50" style={{ bottom: "calc(88px + env(safe-area-inset-bottom))" }}>
            <div className="mx-auto max-w-md px-3">
              <Link href="/cart" className="flex items-center justify-between bg-[#0B6EA9] text-white rounded-2xl px-4 py-3 shadow-lg">
                <div>
                  <div className="text-xs opacity-90">
                    {cartTotals.count} {lang === "en" ? "item" : "shay"}
                    {cartTotals.count > 1 ? "s" : ""} {lang === "en" ? "in cart" : "gaadhiga ku jira"}
                  </div>
                  <div className="text-lg font-extrabold">{money(cartTotals.total)}</div>
                </div>

                <div className="text-right leading-tight font-extrabold">
                  <div>{lang === "en" ? "Go to Cart →" : "U gudub Gaadhiga →"}</div>
                  <div className="text-[10px] opacity-80">{lang === "en" ? "U gudub Gaadhiga" : "Go to Cart"}</div>
                </div>
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}