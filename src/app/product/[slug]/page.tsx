"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { useCart } from "@/context/CartContext";

// ===== helpers =====
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

function slugify(input: string) {
  const s = String(input ?? "").trim();
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/(\d)\.(\d)/g, "$1$2") // 2.5 -> 25 (optional but helps)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function prettyTitleFromSlug(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  // Decode any URL-encoded characters (defensive)
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    s = raw;
  }

  // If it's an SEO slug, turn into words. If it already has spaces, keep it.
  const looksSeo = /[-_]/.test(s) && !/\s/.test(s);
  if (looksSeo) {
    s = s.replace(/[-_]+/g, " ");
  }

  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";

  // Light title-case (keeps numbers/units intact)
  const words = s.split(" ");
  const out = words
    .map((w) => {
      const lw = w.toLowerCase();
      // keep common units/abbrevs lowercase
      if (["kg", "g", "l", "ml", "pcs"].includes(lw)) return lw;
      // keep tokens that contain digits as-is (e.g. 2.5kg)
      if (/\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");

  return out;
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
  qty: number;
  price: number;
  is_weight: boolean;
  min_order_qty: number | null;
  qty_step: number | null;
  online_config: any;
  img: string | null;
};

type ProductImageRow = {
  id: number;
  product_id: string;
  path: string;
  alt: string | null;
  sort_order: number;
};

export default function ProductPageClient() {
  const { slug } = useParams<{ slug: string }>();
  const { addItem } = useCart();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [images, setImages] = useState<ProductImageRow[]>([]);
  const [activeImgIdx, setActiveImgIdx] = useState<number>(0);
  const [qtyDraft, setQtyDraft] = useState<string>("");

  useEffect(() => {
    let alive = true;

    async function findProductByParam(param: string) {
      const baseSelect = "id,slug,qty,price,is_weight,min_order_qty,qty_step,online_config,img";

      const decoded = (() => {
        try {
          return decodeURIComponent(param);
        } catch {
          return param;
        }
      })().trim();

      const inputSeo = slugify(decoded);

      // 1) exact
      let res = await supabase.from("products").select(baseSelect).eq("slug", decoded).maybeSingle();
      if (res.data) return res;

      // 2) sometimes param is already decoded
      const rawTrim = String(param ?? "").trim();
      if (!res.data && rawTrim && rawTrim !== decoded) {
        res = await supabase.from("products").select(baseSelect).eq("slug", rawTrim).maybeSingle();
        if (res.data) return res;
      }

      // 3) if seo-hyphen form, try spaces
      if (!res.data && decoded.includes("-")) {
        const spaceSlug = decoded.replace(/-/g, " ");
        res = await supabase.from("products").select(baseSelect).eq("slug", spaceSlug).maybeSingle();
        if (res.data) return res;
      }

      // 4) smart candidate pick: ilike pattern, then slugify compare
      if (!res.data && decoded.includes("-") && inputSeo) {
        const pattern = `%${decoded.replace(/-/g, "%")}%`;
        const cand = await supabase.from("products").select(baseSelect).ilike("slug", pattern).limit(25);
        if (!cand.error && Array.isArray(cand.data) && cand.data.length > 0) {
          const best = cand.data.find((row: any) => slugify(String(row?.slug ?? "")) === inputSeo) || cand.data[0];
          return { data: best, error: null } as any;
        }
      }

      // 5) final: case-insensitive single (safe-ish)
      if (!res.data && decoded.length >= 3) {
        res = await supabase.from("products").select(baseSelect).ilike("slug", decoded).maybeSingle();
        if (res.data) return res;
      }

      return res;
    }

    async function run() {
      setLoading(true);
      setErr(null);
      setProduct(null);
      setImages([]);
      setActiveImgIdx(0);
      setQtyDraft("");

      try {
        const rawParam = String(slug ?? "");
        const pRes = await findProductByParam(rawParam);

        if (pRes.error) throw pRes.error;
        if (!pRes.data) {
          if (!alive) return;
          setErr("Product not found");
          setLoading(false);
          return;
        }

        const p = pRes.data as any as ProductRow;

        // images optional (your table has no created_at — keep order by sort_order only)
        const imgRes = await supabase
          .from("product_images")
          .select("id,product_id,path,alt,sort_order")
          .eq("product_id", p.id)
          .order("sort_order", { ascending: true });

        if (!alive) return;

        setProduct(p);
        setImages((imgRes.data ?? []) as any);

        const cfg = normalizeConfigLite(p.online_config, p);
        setQtyDraft(String(cfg.min));

        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message ?? e));
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [slug]);

  const cfg = useMemo(() => normalizeConfigLite(product?.online_config, product), [product]);

  const draftNum = useMemo(() => parseNum(qtyDraft), [qtyDraft]);
  const draftQty = useMemo(() => {
    const base = cfg?.min ?? 1;
    return normalizeQty(Number.isFinite(draftNum) ? draftNum : base, cfg?.min ?? base, cfg?.step ?? 1, !!cfg?.is_weight);
  }, [draftNum, cfg]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    return pickUnitPriceLite(cfg, Number(product.price ?? 0), draftQty);
  }, [product, cfg, draftQty]);

  const lineTotal = useMemo(() => unitPrice * draftQty, [unitPrice, draftQty]);

  const heroUrl = useMemo(() => {
    const chosen = images?.[activeImgIdx]?.path;
    const fromChosen = buildPublicImageUrl(chosen);
    if (fromChosen) return fromChosen;

    const direct = buildPublicImageUrl(product?.img);
    if (direct) return direct;

    const first = images[0]?.path;
    const fromPath = buildPublicImageUrl(first);
    if (fromPath) return fromPath;

    return "/example.png";
  }, [product?.img, images, activeImgIdx]);

  function onAdd() {
    if (!product) return;
    (addItem as any)(String(product.id), null as any, draftQty);
  }

  const onShare = useCallback(async () => {
    try {
      const url = typeof window !== "undefined" ? window.location.href : "";
      const title = prettyTitleFromSlug(product?.slug || "") || product?.slug || "Product";

      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ title, url });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert("Link copied");
        return;
      }

      if (url) prompt("Copy link:", url);
    } catch {
      // ignore
    }
  }, [product?.slug]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F4F6F8] pb-[180px]">
        <div className="mx-auto max-w-md px-4 py-6 text-sm text-gray-700">Loading…</div>
      </main>
    );
  }

  if (err || !product) {
    return (
      <main className="min-h-screen bg-[#F4F6F8] pb-[180px]">
        <div className="mx-auto max-w-md px-4 py-6">
          <Link href="/" className="text-[#0B6EA9] font-semibold text-sm">
            ← Back
          </Link>
          <div className="mt-4 bg-white border rounded-2xl p-4 text-sm text-gray-800">{err || "Product not found"}</div>
        </div>
      </main>
    );
  }

  const exactOptions = cfg.options.filter((o) => o.type === "exact");
  const bulkOptions = cfg.options.filter((o) => o.type === "bulk");

  const title = prettyTitleFromSlug(product.slug) || product.slug;
  const lowStock = Number(product.qty ?? 0) > 0 && Number(product.qty ?? 0) <= 5;

  return (
    <main className="min-h-screen bg-[#F4F6F8] pb-[180px]">
      <section className="mx-auto max-w-md">
        <div className="bg-white border-b">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center justify-between">
              <Link href="/" className="text-[#0B6EA9] font-semibold text-sm">← Back</Link>
              <button
                type="button"
                onClick={onShare}
                className="h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                aria-label="Share"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-gray-700" aria-hidden="true">
                  <path
                    d="M16 8a3 3 0 1 0-2.83-4H13a3 3 0 0 0 .17 1l-6.2 3.1a3 3 0 0 0-1.97-.7 3 3 0 1 0 2.83 4H8a3 3 0 0 0-.17-1l6.2-3.1c.53.43 1.2.7 1.97.7Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-gray-600">More from</div>
                <div className="text-gray-900 font-extrabold text-lg leading-tight truncate">{title}</div>
              </div>
              {lowStock ? (
                <div className="shrink-0 text-red-600 font-extrabold text-sm">Only {Number(product.qty)} left!</div>
              ) : null}
            </div>

            {lowStock ? (
              <div className="mt-3 flex gap-2">
                <span className="inline-flex items-center rounded-full bg-red-600 px-3 py-1 text-[12px] font-extrabold text-white">
                  LOW STOCK
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="bg-white">
          <div className="px-4 pt-4">
            <div className="relative bg-gray-50 rounded-2xl border overflow-hidden">
              <div className="relative h-[380px] w-full">
                <Image src={heroUrl} alt={String(title || "Product image")} fill className="object-contain p-6" priority />
              </div>
            </div>

            {images.length > 0 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {images.slice(0, 8).map((img, idx) => {
                  const url = buildPublicImageUrl(img.path);
                  const active = idx === activeImgIdx;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setActiveImgIdx(idx)}
                      className={
                        "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-white " +
                        (active ? "border-[#0B6EA9] ring-2 ring-[#0B6EA9]/20" : "border-gray-200")
                      }
                      aria-label={`Thumbnail ${idx + 1}`}
                    >
                      <Image src={url || "/example.png"} alt="" fill className="object-contain p-2" />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="px-4 pt-4 pb-2">
            <div className="text-3xl font-extrabold text-gray-900">{money(lineTotal)}</div>
            <div className="mt-1 text-[12px] text-gray-500 font-semibold">
              {money(unitPrice)} / {cfg.unit} • {fmtQty(draftQty, cfg.unit, cfg.is_weight)}
            </div>
          </div>

          {(exactOptions.length > 0 || bulkOptions.length > 0) ? (
            <div className="px-4 pb-2">
              <div className="text-sm font-extrabold text-gray-900">Choose option</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {exactOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setQtyDraft(String(o.qty ?? cfg.min))}
                    className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-[12px] font-extrabold text-gray-900 hover:border-gray-300"
                  >
                    {o.label}
                  </button>
                ))}
                {bulkOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setQtyDraft(String(o.min_qty ?? cfg.min))}
                    className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-[12px] font-extrabold text-gray-900 hover:border-gray-300"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="px-4 pb-4">
            <div className="text-sm font-extrabold text-gray-900">Quantity</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                className="h-11 w-[160px] rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-900"
                type="number"
                step={String(cfg.step)}
                min={cfg.min}
                value={qtyDraft}
                onChange={(e) => setQtyDraft(e.target.value)}
              />
              <div className="text-[12px] text-gray-500 font-semibold">{fmtQty(draftQty, cfg.unit, cfg.is_weight)}</div>
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm font-extrabold text-gray-900">Get it delivered by</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-gray-800" aria-hidden="true">
                    <path d="M3 7h11v10H3V7Zm11 3h4l3 3v4h-7V10Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm12 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-extrabold text-gray-900">Scheduled</div>
                  <div className="text-[12px] text-gray-600 font-semibold">Same-day delivery when available</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border-t">
            <div className="px-4 py-4">
              <div className="text-sm font-extrabold text-gray-900">Highlights</div>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 leading-relaxed">
                <li>Fresh stock, fast delivery</li>
                <li>Quality checked items</li>
                <li>Easy returns support</li>
              </ul>

              <div className="mt-6 border-t pt-4">
                <div className="text-sm font-extrabold text-gray-900">Product Details</div>
                <p className="mt-2 text-sm text-gray-700 leading-relaxed">No description available.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-[76px] z-50">
          <div className="pointer-events-none h-6 bg-gradient-to-t from-white to-transparent" />
          <div className="border-t bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
            <div className="mx-auto max-w-md px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-extrabold text-gray-900">{money(lineTotal)}</div>
                  <div className="text-[11px] font-semibold text-gray-500">Including VAT</div>
                </div>
                <button
                  type="button"
                  onClick={onAdd}
                  className="h-12 flex-1 max-w-[210px] rounded-2xl font-extrabold shadow-sm transition active:scale-[0.99] bg-[#0B6EA9] text-white"
                >
                  Add to cart
                </button>
              </div>
            </div>
            <div className="h-[env(safe-area-inset-bottom)]" />
          </div>
        </div>
      </section>
    </main>
  );
}