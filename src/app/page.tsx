/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import Link from "next/link";
import TopNavbar from "@/components/TopNavbar";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Hero from "@/components/Hero";
import TopCategoriesStrip from "@/components/TopCategoriesStrip";
import Promo from "@/components/Promo";
// --- Minimal, self-contained hooks so the homepage works immediately.
// Later, we can move these into /context and /lib once the storefront structure is finalized.

type Lang = "en" | "so";

type CartItem = { productId: string; variantId?: string | null; qty: number };

function useLanguage() {
  const [lang, setLang] = useState<Lang>("en");

  // initial read
  useEffect(() => {
    try {
      const v = (localStorage.getItem("matomart_lang") as Lang | null) ?? "en";
      setLang(v === "so" ? "so" : "en");
    } catch {
      setLang("en");
    }
  }, []);

  // listen for updates (same tab + cross tab)
  useEffect(() => {
    const onLang = () => {
      try {
        const v = (localStorage.getItem("matomart_lang") as Lang | null) ?? "en";
        setLang(v === "so" ? "so" : "en");
      } catch {
        setLang("en");
      }
    };

    window.addEventListener("matomart_lang_change", onLang as any);
    window.addEventListener("storage", onLang);

    return () => {
      window.removeEventListener("matomart_lang_change", onLang as any);
      window.removeEventListener("storage", onLang);
    };
  }, []);

  const setLangPersist = (next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem("matomart_lang", next);
    } catch {}
    window.dispatchEvent(new Event("matomart_lang_change"));
  };

  return { lang, setLang: setLangPersist };
}

function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem("matomart_cart");
        const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
        setItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        setItems([]);
      }
    };

    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  return { items, setItems };
}

// --- Supabase client (requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// ✅ Match your DB: bigint ids + nullable fields
type CategoryRow = {
  id: number; // bigint
  slug: string | null;
  name_en: string | null;
  name_so: string | null;
  img: string | null;
};

type SubcategoryRow = {
  id: number; // bigint
  category_id: number | null;
  slug: string | null;
  name_en: string | null;
  name_so: string | null;
  img: string | null;
};

type VariantRow = {
  id: string;
  sell_price: number | string | null;
};

type ProductPriceRow = {
  id: string;
  price: number | string | null;
};

type CategoryWithSubcats = CategoryRow & { subcats: SubcategoryRow[] };

const HERO_SLIDES = [
  {
    id: 1,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad1.webp",
  },
  {
    id: 2,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad5.webp",
  },
  {
    id: 3,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad3.webp",
  },
  {
    id: 4,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad1.webp",
  },
  {
    id: 5,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad1.webp",
  },
];

function money(n: number) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

function PrimarySecondary({
  primary,
  secondary,
  center = true,
  primaryClass = "text-[11px] font-medium",
  secondaryClass = "text-[9px] text-gray-500",
}: {
  primary: string;
  secondary?: string;
  center?: boolean;
  primaryClass?: string;
  secondaryClass?: string;
}) {
  return (
    <div className={`${center ? "text-center" : "text-left"} leading-tight`}>
      <div className={primaryClass}>{primary}</div>
      {secondary ? <div className={secondaryClass}>{secondary}</div> : null}
    </div>
  );
}

const CATEGORY_BG: Record<string, string> = {
  groceries: "bg-[#0E5C1C]",
  baby: "bg-[#F8B8D0]",
  "health-beauty": "bg-[#E89A3D]",
  household: "bg-[#8FC5E8]",
};

function getCategoryBg(slug: string | undefined) {
  if (!slug) return "bg-[#F3F4F6]";
  return CATEGORY_BG[slug] ?? "bg-[#F3F4F6]";
}

// ✅ FIX: order by id because your DB has no created_at in categories/subcategories
async function getCategoriesWithSubcategories(): Promise<CategoryWithSubcats[]> {
  if (!supabase) return [];

  const [{ data: cats, error: catErr }, { data: subs, error: subErr }] = await Promise.all([
    supabase.from("categories").select("id,slug,name_en,name_so,img").order("id", { ascending: true }),
    supabase.from("subcategories").select("id,category_id,slug,name_en,name_so,img").order("id", { ascending: true }),
  ]);

  if (catErr) throw catErr;
  if (subErr) throw subErr;

  const subList = (subs ?? []) as SubcategoryRow[];

  // group subcats by category_id (bigint -> string key)
  const subByCat: Record<string, SubcategoryRow[]> = {};
  for (const s of subList) {
    if (s.category_id == null) continue;
    const k = String(s.category_id);
    if (!subByCat[k]) subByCat[k] = [];
    subByCat[k].push(s);
  }

  return ((cats ?? []) as CategoryRow[]).map((c) => ({
    ...c,
    subcats: subByCat[String(c.id)] ?? [],
  }));
}

async function getVariantsByIds(ids: string[]): Promise<VariantRow[]> {
  if (!supabase) return [];
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return [];
  const { data, error } = await supabase.from("product_variants").select("id,sell_price").in("id", uniq);
  if (error) throw error;
  return (data ?? []) as VariantRow[];
}

async function getProductsByIds(ids: string[]): Promise<ProductPriceRow[]> {
  if (!supabase) return [];
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return [];
  const { data, error } = await supabase.from("products").select("id,price").in("id", uniq);
  if (error) throw error;
  return (data ?? []) as ProductPriceRow[];
}

export default function HomePage() {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeSlide, setActiveSlide] = useState(0);

  const { items } = useCart();
  const { lang } = useLanguage();

  const [categoryMap, setCategoryMap] = useState<CategoryWithSubcats[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [activeCatSlug, setActiveCatSlug] = useState<string | null>(null);

  // Compact top categories when user scrolls down (hides images)
  const [compactTopCats, setCompactTopCats] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setActiveSlide((s) => (s + 1) % HERO_SLIDES.length), 3500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingCats(true);
        const cats = await getCategoriesWithSubcategories();
        if (!alive) return;
        setCategoryMap(cats);
      } catch (e: any) {
        console.error("HOME LOAD CATEGORIES ERROR:", e?.message ?? e);
      } finally {
        if (alive) setLoadingCats(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        setCompactTopCats(y > 120);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Observe category sections and update active slug when scrolling
  useEffect(() => {
    if (!categoryMap.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the section whose top is closest to the sticky header
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => ({
            slug: e.target.getAttribute("data-cat-slug") || "",
            top: e.boundingClientRect.top,
          }))
          .filter((x) => !!x.slug);

        if (visible.length === 0) return;

        const targetTop = compactTopCats ? 170 : 210;
        visible.sort((a, b) => Math.abs(a.top - targetTop) - Math.abs(b.top - targetTop));
        setActiveCatSlug(visible[0].slug);
      },
      {
        root: null,
        // Give more bottom room so the last section can become active near page end
        rootMargin: compactTopCats ? "-140px 0px -45% 0px" : "-180px 0px -45% 0px",
        threshold: 0.12,
      }
    );

    categoryMap.forEach((cat) => {
      if (!cat.slug) return;
      const el = sectionRefs.current[cat.slug];
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [categoryMap, compactTopCats]);

  // Fallback: when user reaches the bottom, ensure the last category becomes active
  useEffect(() => {
    if (!categoryMap.length) return;

    const last = [...categoryMap].reverse().find((c) => !!c.slug);
    if (!last?.slug) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const scrollY = window.scrollY || 0;
        const winH = window.innerHeight || 0;
        const docH = document.documentElement.scrollHeight || 0;

        // within 120px of bottom
        if (scrollY + winH >= docH - 120) {
          setActiveCatSlug(last.slug as string);
        }
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [categoryMap]);

  // Lookup map for cart totals
  const [variantMap, setVariantMap] = useState<Record<string, VariantRow>>({});
  const [productMap, setProductMap] = useState<Record<string, ProductPriceRow>>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      const cart = (Array.isArray(items) ? (items as any) : []) as CartItem[];
      const vids = cart.map((x) => x.variantId).filter((v): v is string => v != null);
      const pids = cart.map((x) => x.productId).filter((v): v is string => v != null);

      try {
        const [vs, ps] = await Promise.all([getVariantsByIds(vids), getProductsByIds(pids)]);
        if (!alive) return;

        const vm: Record<string, VariantRow> = {};
        for (const v of vs) vm[v.id] = v;
        setVariantMap(vm);

        const pm: Record<string, ProductPriceRow> = {};
        for (const p of ps) pm[p.id] = p;
        setProductMap(pm);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [items]);

  // Keep a generous offset so section titles never hide under the sticky TopNavbar + top categories strip.
const headerOffset = compactTopCats ? 180 : 200;
  const scrollToCategory = (slug: string) => {
    const el = sectionRefs.current[slug];
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const scrollTop = window.scrollY + rect.top - headerOffset;

    window.scrollTo({
      top: scrollTop,
      behavior: "smooth",
    });
  };

  const cartTotals = useMemo(() => {
    const cart = (Array.isArray(items) ? (items as any) : []) as CartItem[];

    let total = 0;
    let count = 0;

    for (const it of cart) {
      const v = it.variantId != null ? variantMap[it.variantId] : null;
      const p = it.productId != null ? productMap[it.productId] : null;
      const unit = it.variantId != null ? v?.sell_price : p?.price;
      const price = Number(unit ?? 0);

      total += price * (it.qty ?? 1);
      count += it.qty ?? 1;
    }

    return { total, count };
  }, [items, variantMap, productMap]);

  const cartCtaPrimary = lang === "en" ? "Go to Cart →" : "U gudub Gaadhiga →";

  return (
    <main className="min-h-screen bg-white text-black">
      <TopNavbar />

{/* TOP CATEGORIES STRIP (moved to component) */}
<div className="-mb-4">
  <TopCategoriesStrip
    categoryMap={categoryMap}
    lang={lang}
    compact={compactTopCats}
    activeSlug={activeCatSlug}
    onPick={(slug) => scrollToCategory(slug)}
  />
</div>

<Hero />

<div className="-mt-3">
  <Promo />
</div>
      {/* CATEGORY SECTIONS */}
<section className="bg-white px-3 pb-6 pt-0">        {loadingCats && categoryMap.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading…</div>
        ) : (
          categoryMap.map((cat) => {
            const catPrimary = ((lang === "en" ? cat.name_en : cat.name_so) ?? "").trim();

            return (
              <div
                key={cat.id}
                ref={(el) => {
                  if (cat.slug) sectionRefs.current[cat.slug] = el;
                }}
                data-cat-slug={cat.slug ?? ""}
                className="scroll-mt-[230px] pb-3"
              >
                <div className="mb-1">
                  <PrimarySecondary
                    primary={catPrimary || "—"}
                    center={false}
                    primaryClass="text-lg font-bold text-gray-900"
                  />
                </div>

                <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
                  {(cat.subcats || []).slice(0, 12).map((sub) => {
                    const subPrimary = ((lang === "en" ? sub.name_en : sub.name_so) ?? "").trim();

                    return (
                      <Link key={sub.id} href={`/subcategory/${sub.slug ?? ""}`} className="flex flex-col items-center">
                        <div
                          className={`relative h-[90px] w-[90px] rounded-2xl overflow-hidden flex items-center justify-center ${getCategoryBg(
                            cat.slug ?? undefined
                          )}`}
                        >
                          <Image
                            src={
                              typeof sub.img === "string" && sub.img.trim().length > 0
                                ? sub.img.trimEnd()
                                : "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/subcategories/baleware.webp"
                            }
                            alt={subPrimary || "Subcategory"}
                            fill
                            className="object-contain"
                          />
                        </div>

                        <div className="mt-0.5">
                          <PrimarySecondary
                            primary={subPrimary || "—"}
                            primaryClass="text-[12px] font-semibold text-gray-800"
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* STICKY GO TO CART BAR (only when cart has items AND total count > 0) */}
      {items.length > 0 && cartTotals.count > 0 && (
        <div className="fixed left-0 right-0 bottom-[100px] z-40">
          <div className="mx-auto max-w-md px-3">
            <Link
              href="/cart"
              className="flex items-center justify-between bg-[#0B6EA9] text-white rounded-2xl px-4 py-3 shadow-lg"
            >
              <div>
                <div className="text-xs opacity-90">
                  {cartTotals.count} item{cartTotals.count > 1 ? "s" : ""} in cart
                </div>
                <div className="text-lg font-extrabold">{money(cartTotals.total)}</div>
              </div>

              <div className="text-right leading-tight font-extrabold">
                <div>{cartCtaPrimary}</div>
              </div>
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}