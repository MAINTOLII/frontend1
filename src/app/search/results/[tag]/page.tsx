"use client";

import TopNavbar from "@/components/TopNavbar";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/context/CartContext";

import { supabase } from "@/lib/supabaseClient";
import { fetchProductImagesByProductIds } from "@/lib/db";

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

// ✅ SAME helpers as your product page (this is the key fix)
function encodeUrlMaybe(u: string) {
  try {
    return encodeURI(u);
  } catch {
    return u;
  }
}

function buildPublicImageUrl(input: any): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return encodeUrlMaybe(s);
  if (s.startsWith("/")) return s;

  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!base) return "";

  if (s.startsWith("product-images/")) {
    return encodeUrlMaybe(`${base}/storage/v1/object/public/${s}`);
  }

  if (s.startsWith("products/") || s.startsWith("subcategories/") || s.startsWith("categories/")) {
    return encodeUrlMaybe(`${base}/storage/v1/object/public/product-images/${s}`);
  }

  return encodeUrlMaybe(`${base}/storage/v1/object/public/${s}`);
}

type ProductRow = {
  id: string;
  slug: string;
  tags: any;
  price: number | string | null;
  is_online: boolean | null;
  img?: string | null; // ✅ fallback if product_images missing
};

type ProductImageRow = {
  product_id: string | number;
  path?: string | null;
  url?: string | null;
  image_url?: string | null;
  storage_path?: string | null;
  sort_order?: number | null;
};

function readSomaliToggle(): boolean {
  if (typeof window === "undefined") return false;
  const raw =
    window.localStorage.getItem("lang") ||
    window.localStorage.getItem("language") ||
    window.localStorage.getItem("locale") ||
    "";
  const v = String(raw).toLowerCase().trim();
  return v === "so" || v === "som" || v === "somali" || v === "so-so";
}

export default function SearchResultsPage() {
  const params = useParams() as { tag?: string };
  const decodedTag = normalizeTag(decodeURIComponent(params?.tag ?? ""));

  // cart (defensive)
  const cartAny = useCart() as any;
  const addItem = cartAny?.addItem as
    | ((productId: string, variantId: any, qty: number) => void)
    | undefined;
  const cartItems =
    (cartAny?.items as any[]) ||
    (cartAny?.cartItems as any[]) ||
    (cartAny?.cart as any[]) ||
    [];

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productImages, setProductImages] = useState<ProductImageRow[]>([]);
  const [loading, setLoading] = useState(true);

  // language
  const [isSomali, setIsSomali] = useState(false);
  useEffect(() => {
    setIsSomali(readSomaliToggle());
    const onStorage = () => setIsSomali(readSomaliToggle());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const t = useMemo(() => {
    const so = {
      resultsFor: "Natiijooyinka:",
      loading: "Alaabta waa la soo rarayaa…",
      noResults: "Wax natiijo ah lama helin.",
      contact: "Nala soo xiriir WhatsApp 📩",
      add: "+ Ku dar",
      added: "La daray ✓",
      view: "Eeg",
      price: "Qiimo",
      imageMissing: "Sawir ma jiro",
    };
    const en = {
      resultsFor: "Results for:",
      loading: "Loading products…",
      noResults: "No results found.",
      contact: "Contact us on WhatsApp 📩",
      add: "+ Add",
      added: "Added ✓",
      view: "View",
      price: "Price",
      imageMissing: "No image",
    };
    return isSomali ? so : en;
  }, [isSomali]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      try {
        // ✅ include img so we can fallback
        const pRes = await supabase
          .from("products")
          .select("id,slug,tags,price,is_online,img")
          .limit(5000);

        if (pRes.error) throw pRes.error;

        if (!alive) return;
        const prods = Array.isArray(pRes.data) ? (pRes.data as any[]) : [];
        setProducts(prods as ProductRow[]);

        const matchedIds = prods
          .filter((p: any) => {
            const rawTags = p?.tags;
            const asArray = Array.isArray(rawTags)
              ? rawTags
              : typeof rawTags === "string"
              ? rawTags.split(",")
              : [];
            const tags = asArray.map((tt: any) => normalizeTag(tt)).filter(Boolean);
            return decodedTag ? tags.includes(decodedTag) : false;
          })
          .map((p: any) => p.id);

        if (!decodedTag || matchedIds.length === 0) {
          setProductImages([]);
          return;
        }

        try {
          const imgs = await fetchProductImagesByProductIds(matchedIds);
          if (!alive) return;
          setProductImages(Array.isArray(imgs) ? (imgs as any) : []);
        } catch (imgErr) {
          console.warn("SEARCH RESULTS IMAGES LOAD WARNING", imgErr);
          if (!alive) return;
          setProductImages([]);
        }
      } catch (e) {
        console.error("SEARCH RESULTS LOAD ERROR", e);
        if (!alive) return;
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
    if (!decodedTag) return [] as ProductRow[];

    return (products as any[]).filter((p: any) => {
      const rawTags = p?.tags;
      const asArray = Array.isArray(rawTags)
        ? rawTags
        : typeof rawTags === "string"
        ? rawTags.split(",")
        : [];
      const tags = asArray.map((tt: any) => normalizeTag(tt)).filter(Boolean);
      return tags.includes(decodedTag) && p.is_online !== false;
    }) as ProductRow[];
  }, [products, decodedTag]);

  function getProductPrice(p: any) {
    const v = Number(p?.price ?? 0);
    return Number.isFinite(v) ? v : 0;
  }

  // ✅ main fix: use SAME URL builder as ProductPage + fallback to products.img
  function getPrimaryImageUrl(p: any) {
    const list = (productImages ?? [])
      .filter((im: any) => String(im.product_id) === String(p?.id))
      .slice()
      .sort((a: any, b: any) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));

    const first = list[0] as any;
    const raw =
      first?.url ??
      first?.image_url ??
      first?.path ??
      first?.storage_path ??
      "";

    const fromRow = buildPublicImageUrl(raw);
    if (fromRow) return fromRow;

    const fromProduct = buildPublicImageUrl(p?.img);
    if (fromProduct) return fromProduct;

    return "";
  }

  function isInCart(productId: string | number) {
    const id = String(productId);
    const list = Array.isArray(cartItems) ? cartItems : [];

    return list.some((it: any) => {
      const pid =
        it?.product_id ??
        it?.productId ??
        it?.id ??
        it?.product?.id ??
        it?.product?.product_id;
      return String(pid ?? "") === id;
    });
  }

  return (
    <>
      <TopNavbar />

      <main className="max-w-md mx-auto p-4 bg-white min-h-screen text-slate-900 flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {t.resultsFor} <span className="font-bold">"{decodedTag}"</span>
          </h2>
          <span className="text-xs text-slate-500">
            {matched.length > 0 && !loading ? `${matched.length}` : ""}
          </span>
        </div>

        {loading && (
          <div className="mt-10 text-center text-base text-slate-600">{t.loading}</div>
        )}

        {!loading && matched.length === 0 && (
          <div className="text-center mt-8 text-base text-slate-700">
            {t.noResults}
            <br />
            <a
              href="https://wa.me/252622073874"
              className="underline font-bold text-[#0B6EA9]"
            >
              {t.contact}
            </a>
          </div>
        )}

        {!loading && matched.length > 0 && (
          <section className="grid grid-cols-2 gap-4">
            {matched.map((p: any) => {
              const img = getPrimaryImageUrl(p);
              const price = getProductPrice(p);
              const added = isInCart(p.id);

              return (
                <div
                  key={p.id}
                  className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition"
                >
                  <Link
                    href={`/product/${encodeURIComponent(String(p.slug ?? ""))}`}
                    className="block"
                  >
                    <div className="relative w-full aspect-square bg-slate-50">
                      {img ? (
                        <Image
                          src={img}
                          alt={String(p.slug ?? "Product")}
                          fill
                          sizes="(max-width: 768px) 50vw, 200px"
                          className="object-contain p-2"
                          priority={false}
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-xs text-slate-400">
                          {t.imageMissing}
                        </div>
                      )}

                      <div className="absolute left-2 bottom-2">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-white/90 backdrop-blur px-2 py-1 rounded-full border border-slate-200">
                          <span className="text-slate-500">{t.price}</span>
                          <span className="text-slate-900">
                            {price > 0 ? moneyUSD(price) : "—"}
                          </span>
                        </span>
                      </div>

                      {added && (
                        <div className="absolute right-2 top-2">
                          <span className="text-xs font-semibold bg-emerald-600 text-white px-2 py-1 rounded-full shadow">
                            {t.added}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="p-3 flex flex-col gap-2">
                    <Link
                      href={`/product/${encodeURIComponent(String(p.slug ?? ""))}`}
                      className="block"
                    >
                      <p className="text-sm font-semibold leading-snug line-clamp-2 text-slate-900">
                        {String(p.slug ?? "—")}
                      </p>
                    </Link>

                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => {
                          if (!addItem) return;
                          if (!added) addItem(String(p.id), null as any, 1);
                        }}
                        className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                          added
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-[#0B6EA9] text-white"
                        }`}
                      >
                        {added ? t.added : t.add}
                      </button>

                      <Link
                        href={`/product/${encodeURIComponent(String(p.slug ?? ""))}`}
                        className="rounded-xl py-2 px-3 text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                      >
                        {t.view}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </>
  );
}