"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
    .replace(/(\d)\.(\d)/g, "$1$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function prettyTitleFromSlug(input: string) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    s = raw;
  }

  const looksSeo = /[-_]/.test(s) && !/\s/.test(s);
  if (looksSeo) s = s.replace(/[-_]+/g, " ");

  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";

  const words = s.split(" ");
  const out = words
    .map((w) => {
      const lw = w.toLowerCase();
      if (["kg", "g", "l", "ml", "pcs"].includes(lw)) return lw;
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

  const exact = cfg.options.find(
    (o: any) => o.type === "exact" && Number(((o as any).qty ?? 0).toFixed(3)) === q2
  ) as any;
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
  subsubcategory_id: number | null;
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
  const router = useRouter();

  // cart (defensive)
  const cartAny = useCart() as any;
  const addItem = cartAny?.addItem;
  const cartItemsAny = cartAny?.items ?? cartAny?.cartItems ?? cartAny?.cart ?? cartAny?.state?.items ?? [];

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [images, setImages] = useState<ProductImageRow[]>([]);
  const [activeImgIdx, setActiveImgIdx] = useState<number>(0);
  const [qtyDraft, setQtyDraft] = useState<string>("");
  const [fbw, setFbw] = useState<ProductRow[]>([]);

  // flash (only animation), but “in cart” is persistent
  const [addedFlash, setAddedFlash] = useState(false);
  const [addedMsg, setAddedMsg] = useState<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  const triggerAddedFlash = (msg: string) => {
    setAddedMsg(msg);
    setAddedFlash(true);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setAddedFlash(false);
      setAddedMsg(null);
    }, 900);
  };

  useEffect(() => {
    let alive = true;

    const baseSelect =
      "id,slug,qty,price,is_weight,min_order_qty,qty_step,online_config,img,subsubcategory_id,is_online";

    async function findProductByParam(param: string) {
      const decoded = (() => {
        try {
          return decodeURIComponent(param);
        } catch {
          return param;
        }
      })().trim();

      const inputSeo = slugify(decoded);

      let res = await supabase.from("products").select(baseSelect).eq("slug", decoded).maybeSingle();
      if (res.data) return res;

      const rawTrim = String(param ?? "").trim();
      if (!res.data && rawTrim && rawTrim !== decoded) {
        res = await supabase.from("products").select(baseSelect).eq("slug", rawTrim).maybeSingle();
        if (res.data) return res;
      }

      if (!res.data && decoded.includes("-")) {
        const spaceSlug = decoded.replace(/-/g, " ");
        res = await supabase.from("products").select(baseSelect).eq("slug", spaceSlug).maybeSingle();
        if (res.data) return res;
      }

      if (!res.data && decoded.includes("-") && inputSeo) {
        const pattern = `%${decoded.replace(/-/g, "%")}%`;
        const cand = await supabase.from("products").select(baseSelect).ilike("slug", pattern).limit(25);
        if (!cand.error && Array.isArray(cand.data) && cand.data.length > 0) {
          const best = cand.data.find((row: any) => slugify(String(row?.slug ?? "")) === inputSeo) || cand.data[0];
          return { data: best, error: null } as any;
        }
      }

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
      setFbw([]);

      try {
        const rawParam = String(slug ?? "");
        const pRes = await findProductByParam(rawParam);

        if (pRes.error) throw pRes.error;
        if (!pRes.data) {
          if (!alive) return;
          setErr("Alaabtan lama helin");
          setLoading(false);
          return;
        }

        const p = pRes.data as any as ProductRow;

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

        // SEO redirect
        try {
          const desired = slugify(String(p.slug ?? ""));
          const currentDecoded = (() => {
            try {
              return decodeURIComponent(String(slug ?? ""));
            } catch {
              return String(slug ?? "");
            }
          })();
          const current = slugify(currentDecoded);
          if (desired && current && desired !== current) {
            router.replace(`/product/${encodeURIComponent(desired)}`);
          }
        } catch {}

        // FBW
        try {
          if (p.subsubcategory_id != null) {
            const rel = await supabase
              .from("products")
              .select("id,slug,qty,price,is_weight,min_order_qty,qty_step,online_config,img,subsubcategory_id")
              .eq("subsubcategory_id", p.subsubcategory_id)
              .neq("id", p.id)
              .eq("is_online", true)
              .gt("qty", 0)
              .limit(3);

            if (alive) setFbw((rel.data ?? []) as any);
          } else {
            if (alive) setFbw([]);
          }
        } catch {
          if (alive) setFbw([]);
        }

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
  }, [slug, router]);

  const cfg = useMemo(() => normalizeConfigLite(product?.online_config, product), [product]);

  const draftNum = useMemo(() => parseNum(qtyDraft), [qtyDraft]);
  const draftQty = useMemo(() => {
    const base = cfg?.min ?? 1;
    return normalizeQty(
      Number.isFinite(draftNum) ? draftNum : base,
      cfg?.min ?? base,
      cfg?.step ?? 1,
      !!cfg?.is_weight
    );
  }, [draftNum, cfg]);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    return pickUnitPriceLite(cfg, Number(product.price ?? 0), draftQty);
  }, [product, cfg, draftQty]);

  const lineTotal = useMemo(() => unitPrice * draftQty, [unitPrice, draftQty]);

  const baseUnitPrice = useMemo(() => Number(product?.price ?? 0), [product?.price]);
  const baseTotal = useMemo(() => baseUnitPrice * draftQty, [baseUnitPrice, draftQty]);

  const discountPct = useMemo(() => {
    if (!(baseTotal > 0) || !(lineTotal >= 0)) return 0;
    const p = Math.round(((baseTotal - lineTotal) / baseTotal) * 100);
    return Number.isFinite(p) ? Math.max(0, p) : 0;
  }, [baseTotal, lineTotal]);

  const bestBulk = useMemo(() => {
    const bulk = (cfg.options || []).filter((o) => o.type === "bulk") as any[];
    if (!bulk.length) return null;
    const sorted = [...bulk].sort((a, b) => Number(a.unit_price ?? 0) - Number(b.unit_price ?? 0));
    const b = sorted[0];
    if (!b) return null;
    const minq = Number(b.min_qty ?? 0);
    const maxq = b.max_qty == null ? null : Number(b.max_qty);
    return {
      unit_price: Number(b.unit_price ?? 0),
      min_qty: Number.isFinite(minq) ? minq : 0,
      max_qty: maxq != null && Number.isFinite(maxq) ? maxq : null,
      label: String(b.label ?? "").trim(),
    };
  }, [cfg.options]);

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

  // ✅ persistent “in cart” qty
  const inCartQty = useMemo(() => {
    const pid = String(product?.id ?? "");
    if (!pid) return 0;

    const arr = Array.isArray(cartItemsAny) ? cartItemsAny : [];
    let sum = 0;

    for (const it of arr) {
      const p = String((it?.productId ?? it?.product_id ?? it?.product?.id ?? "") as any);
      if (p !== pid) continue;

      const qRaw = it?.qty ?? it?.quantity ?? it?.count ?? it?.amount;
      const q = Number(qRaw);
      if (Number.isFinite(q)) sum += q;
    }

    return sum;
  }, [cartItemsAny, product?.id]);

  const isInCart = inCartQty > 0;

  function onAdd() {
    if (!product) return;
    if (typeof addItem !== "function") return;
    (addItem as any)(String(product.id), null as any, draftQty);
    triggerAddedFlash("Waa lagu daray Cart");
  }

  const onShare = useCallback(async () => {
    try {
      const url = typeof window !== "undefined" ? window.location.href : "";
      const title = prettyTitleFromSlug(product?.slug || "") || product?.slug || "Alaab";

      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ title, url });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert("Link waa la koobiyeeyay");
        return;
      }

      if (url) prompt("Koobi link:", url);
    } catch {}
  }, [product?.slug]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F4F6F8] pb-[240px]">
        <div className="mx-auto max-w-md px-4 py-5 text-sm text-gray-700">Wuu soo shubanayaa…</div>
      </main>
    );
  }

  if (err || !product) {
    return (
      <main className="min-h-screen bg-[#F4F6F8] pb-[240px]">
        <div className="mx-auto max-w-md px-4 py-5">
          <button type="button" onClick={() => router.back()} className="text-[#0B6EA9] font-semibold text-sm">
            ← Dib u noqo
          </button>
          <div className="mt-4 bg-white border rounded-2xl p-4 text-sm text-gray-800">{err || "Alaabtan lama helin"}</div>
        </div>
      </main>
    );
  }

  const exactOptions = cfg.options.filter((o) => o.type === "exact");
  const bulkOptions = cfg.options.filter((o) => o.type === "bulk");

  const title = prettyTitleFromSlug(product.slug) || product.slug;
  const lowStock = Number(product.qty ?? 0) > 0 && Number(product.qty ?? 0) <= 5;

  return (
    <main className="min-h-screen bg-[#F4F6F8] pb-[240px]">
      <section className="mx-auto max-w-md">
        <div className="bg-white border-b">
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => router.back()} className="text-[#0B6EA9] font-semibold text-sm">
                ← Dib u noqo
              </button>

              <button
                type="button"
                onClick={onShare}
                className="h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                aria-label="Wadaag"
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

            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-gray-600">Alaab</div>
                <div className="text-gray-900 font-extrabold text-lg leading-tight truncate">{title}</div>
              </div>
              {lowStock ? (
                <div className="shrink-0 text-red-600 font-extrabold text-sm">Kaliya {Number(product.qty)} ayaa haray!</div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ✅ Joogto: haddii alaabtu ku jirto Cart */}
        {isInCart && (
          <div className="px-4 pt-2">
            <div className="rounded-2xl border bg-white px-4 py-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[#E8F7ED] text-[#0E5C1C] grid place-items-center font-extrabold">
                ✓
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-gray-900">
                  {addedFlash ? addedMsg ?? "Waa lagu daray Cart" : "Ku jira Cart"}
                </div>
                <div className="text-[12px] text-gray-600 font-semibold truncate">
                  Tirada ku jirta: {cfg.is_weight ? Number(inCartQty.toFixed(2)) : Math.round(inCartQty)}
                </div>
              </div>
              <Link
                href="/cart"
                className="ml-auto h-10 px-4 rounded-2xl bg-[#0B6EA9] text-white text-sm font-extrabold grid place-items-center"
              >
                Eeg Cart
              </Link>
            </div>
          </div>
        )}

        <div className="bg-white">
          <div className="px-4 pt-2">
            <div className="relative bg-gray-50 rounded-2xl border overflow-hidden">
              <div className="relative h-[250px] w-full">
                <Image src={heroUrl} alt={String(title || "Sawirka alaabta")} fill className="object-contain p-4" priority />
              </div>
            </div>

            {images.length > 0 ? (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {images.slice(0, 8).map((img, idx) => {
                  const url = buildPublicImageUrl(img.path);
                  const active = idx === activeImgIdx;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setActiveImgIdx(idx)}
                      className={
                        "relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-white " +
                        (active ? "border-[#0B6EA9]" : "border-gray-200")
                      }
                      aria-label={`Sawir ${idx + 1}`}
                    >
                      <Image src={url || "/example.png"} alt="" fill className="object-contain p-2" />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* PRICE */}
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center gap-2">
              <div className="text-3xl font-extrabold text-gray-900">{money(lineTotal)}</div>

              {discountPct >= 5 && (
                <div className="h-7 px-2 rounded-full bg-[#E8F7ED] text-[#0E5C1C] text-[12px] font-extrabold grid place-items-center">
                  -{discountPct}%
                </div>
              )}

              {discountPct >= 5 && (
                <div className="text-[12px] text-gray-400 font-bold line-through">{money(baseTotal)}</div>
              )}
            </div>

            <div className="mt-1 text-[12px] text-gray-600 font-semibold">
              {money(unitPrice)} / {cfg.unit} • {fmtQty(draftQty, cfg.unit, cfg.is_weight)}
            </div>

            {bestBulk && (
              <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-[12px] font-extrabold text-gray-900">Qiimo jumlo</div>
                <div className="text-[12px] text-gray-700 font-semibold">
                  {money(bestBulk.unit_price)} / {cfg.unit} laga bilaabo {bestBulk.min_qty}+ {cfg.unit}
                  {bestBulk.max_qty != null ? ` (ugu badnaan ${bestBulk.max_qty} ${cfg.unit})` : ""}
                </div>
              </div>
            )}
          </div>

          {(exactOptions.length > 0 || bulkOptions.length > 0) ? (
            <div className="px-4 pb-2">
              <div className="text-sm font-extrabold text-gray-900">Xulo ikhtiyaar</div>
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
            <div className="text-sm font-extrabold text-gray-900">Tirada</div>
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

          {fbw.length > 0 && (
            <div className="px-4 pb-6">
              <div className="flex items-center justify-between">
                <div className="text-sm font-extrabold text-gray-900">Badanaa lala iibsado</div>
                <div className="text-[11px] font-semibold text-gray-500">Isla qayb</div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {fbw.map((rp) => {
                  const rTitle = prettyTitleFromSlug(rp.slug) || rp.slug;
                  const rImg = buildPublicImageUrl(rp.img);
                  const rCfg = normalizeConfigLite(rp.online_config, rp);
                  const rStartQty = normalizeQty(rCfg.min, rCfg.min, rCfg.step, !!rCfg.is_weight);
                  const rUnitPrice = pickUnitPriceLite(rCfg, Number(rp.price ?? 0), rStartQty);

                  return (
                    <div key={rp.id} className="rounded-2xl border bg-white p-2">
                      <Link href={`/product/${encodeURIComponent(slugify(rp.slug))}`} className="block">
                        <div className="relative h-20 w-full bg-gray-50 rounded-xl overflow-hidden border">
                          <Image src={rImg || "/example.png"} alt={rTitle} fill className="object-contain p-2" />
                        </div>
                        <div className="mt-2 text-[11px] font-extrabold text-gray-900 line-clamp-2 min-h-[32px]">
                          {rTitle}
                        </div>
                        <div className="mt-1 text-[11px] font-extrabold text-gray-900">{money(rUnitPrice * rStartQty)}</div>
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          if (typeof addItem === "function") {
                            (addItem as any)(String(rp.id), null as any, rStartQty);
                            triggerAddedFlash("Waa lagu daray Cart");
                          }
                        }}
                        className="mt-2 w-full h-9 rounded-xl bg-[#0E5C1C] text-white text-[12px] font-extrabold active:scale-[0.99]"
                      >
                        Ku dar
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ✅ Sticky Add-to-cart: kor ayaan u qaaday (si uusan u dul saarnayn BottomNav) */}
        <div className="fixed inset-x-0 z-40" style={{ bottom: "calc(92px + env(safe-area-inset-bottom))" }}>
          <div className="border-t bg-white">
            <div className="mx-auto max-w-md px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-extrabold text-gray-900">{money(lineTotal)}</div>
                  <div className="text-[11px] font-semibold text-gray-500">Wadar</div>
                </div>

                <button
                  type="button"
                  onClick={onAdd}
                  className={
                    "h-12 flex-1 max-w-[220px] rounded-2xl font-extrabold transition active:scale-[0.99] text-white " +
                    (isInCart ? "bg-[#0E5C1C]" : addedFlash ? "bg-[#0E5C1C]" : "bg-[#0B6EA9]")
                  }
                >
                  {isInCart ? "Ku jira Cart ✓" : addedFlash ? "Waa lagu daray ✓" : "Ku dar Cart"}
                </button>
              </div>
            </div>
          </div>
        </div>

      </section>
    </main>
  );
}