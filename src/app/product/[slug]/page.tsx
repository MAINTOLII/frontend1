"use client";

import Image from "next/image";
import Link from "next/link";
import BoughtTogether from "./components/Boughttogether";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import StickyBar from "./components/Stickybar";
import { supabase } from "@/lib/supabaseClient";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";

import {
  money,
  parseNum,
  normalizeQty,
  slugify,
  prettyTitleFromSlug,
  normalizeConfigLite,
  pickUnitPriceLite,
  fmtQty,
  buildPublicImageUrl,
  type ProductRow,
  type ProductImageRow,
} from "./helpers";

export default function ProductPageClient() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const { lang } = useLanguage() as any;
  const isEn = lang === "en";

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
  const [discountPrice, setDiscountPrice] = useState<number | null>(null);

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
      setDiscountPrice(null);

      try {
        const rawParam = String(slug ?? "");
        const pRes = await findProductByParam(rawParam);

        if (pRes.error) throw pRes.error;
        if (!pRes.data) {
          if (!alive) return;
          setErr(isEn ? "Product not found" : "Alaabtan lama helin");
          setLoading(false);
          return;
        }

        const p = pRes.data as any as ProductRow;

        // ✅ Active discount (if any)
        try {
          const dRes = await supabase
            .from("discounts")
            .select("discount_price,is_active,sort_order")
            .eq("product_id", p.id)
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (alive) {
            const dp = dRes?.data?.discount_price;
            const n = dp == null ? NaN : Number(dp);
            setDiscountPrice(Number.isFinite(n) ? n : null);
          }
        } catch {
          if (alive) setDiscountPrice(null);
        }

        const imgRes = await supabase
          .from("product_images")
          .select("id,product_id,path,alt,sort_order")
          .eq("product_id", p.id)
          .order("sort_order", { ascending: true });

        if (!alive) return;

        setProduct(p);
        setImages((imgRes.data ?? []) as any);

        const cfg0 = normalizeConfigLite(p.online_config, p);
        setQtyDraft(String(cfg0.min));

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
  }, [slug, router, isEn]);

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

  // ✅ unit price uses discounted base if a discount exists
  const unitPrice = useMemo(() => {
    if (!product) return 0;
    const base = discountPrice != null ? discountPrice : Number(product.price ?? 0);
    return pickUnitPriceLite(cfg, base, draftQty);
  }, [product, cfg, draftQty, discountPrice]);

  const lineTotal = useMemo(() => unitPrice * draftQty, [unitPrice, draftQty]);

  // original (non-discount) base
  const baseUnitPrice = useMemo(() => Number(product?.price ?? 0), [product?.price]);
  const baseTotal = useMemo(() => baseUnitPrice * draftQty, [baseUnitPrice, draftQty]);

  const discountPct = useMemo(() => {
    if (!(baseTotal > 0) || !(lineTotal >= 0)) return 0;
    const p = Math.round(((baseTotal - lineTotal) / baseTotal) * 100);
    return Number.isFinite(p) ? Math.max(0, p) : 0;
  }, [baseTotal, lineTotal]);

  const discountAmt = useMemo(() => {
    if (!product) return 0;
    const d = baseTotal - lineTotal;
    return Number.isFinite(d) ? Math.max(0, d) : 0;
  }, [product, baseTotal, lineTotal]);

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

  const bulkUnlocked = useMemo(() => {
    if (!bestBulk) return false;
    const minq = Number(bestBulk.min_qty ?? 0);
    if (!Number.isFinite(minq) || minq <= 0) return false;
    return draftQty >= minq;
  }, [bestBulk, draftQty]);

  const bulkMoreNeeded = useMemo(() => {
    if (!bestBulk) return 0;
    const minq = Number(bestBulk.min_qty ?? 0);
    if (!Number.isFinite(minq) || minq <= 0) return 0;
    const need = minq - draftQty;
    return need > 0 ? need : 0;
  }, [bestBulk, draftQty]);

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
    triggerAddedFlash(isEn ? "Added to cart" : "Waa lagu daray Cart");
  }

  const onShare = useCallback(async () => {
    try {
      const url = typeof window !== "undefined" ? window.location.href : "";
      const title = prettyTitleFromSlug(product?.slug || "") || product?.slug || (isEn ? "Product" : "Alaab");

      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ title, url });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        alert(isEn ? "Link copied" : "Link waa la koobiyeeyay");
        return;
      }

      if (url) prompt(isEn ? "Copy link:" : "Koobi link:", url);
    } catch {}
  }, [product?.slug, isEn]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F4F6F8] pb-[240px]">
        <div className="mx-auto max-w-md px-4 py-5 text-sm text-gray-700">
          {isEn ? "Loading…" : "Wuu soo shubanayaa…"}
        </div>
      </main>
    );
  }

  if (err || !product) {
    return (
      <main className="min-h-screen bg-[#F4F6F8] pb-[240px]">
        <div className="mx-auto max-w-md px-4 py-5">
          <button type="button" onClick={() => router.back()} className="text-[#0B6EA9] font-semibold text-sm">
            {isEn ? "← Back" : "← Dib u noqo"}
          </button>
          <div className="mt-4 bg-white border rounded-2xl p-4 text-sm text-gray-800">
            {err || (isEn ? "Product not found" : "Alaabtan lama helin")}
          </div>
        </div>
      </main>
    );
  }

  const exactOptions = cfg.options.filter((o) => o.type === "exact");
  const bulkOptions = cfg.options.filter((o) => o.type === "bulk");

  const title = prettyTitleFromSlug(product.slug) || product.slug;
  const lowStock = Number(product.qty ?? 0) > 0 && Number(product.qty ?? 0) <= 5;

  const showDiscount = discountPct > 0 && lineTotal < baseTotal - 0.005;

  return (
    <main className="min-h-screen bg-[#F4F6F8] pb-[240px]">
      <section className="mx-auto max-w-md">
        <div className="bg-white border-b">
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => router.back()} className="text-[#0B6EA9] font-semibold text-sm">
                {isEn ? "← Back" : "← Dib u noqo"}
              </button>

              <button
                type="button"
                onClick={onShare}
                className="h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                aria-label={isEn ? "Share" : "Wadaag"}
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
                <div className="text-sm text-gray-600">{isEn ? "Product" : "Alaab"}</div>
                <div className="text-gray-900 font-extrabold text-lg leading-tight truncate">{title}</div>
              </div>
              {lowStock ? (
                <div className="shrink-0 text-red-600 font-extrabold text-sm">
                  {isEn ? `Only ${Number(product.qty)} left!` : `Kaliya ${Number(product.qty)} ayaa haray!`}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* ✅ Persistent: if in cart */}
        {isInCart && (
          <div className="px-4 pt-2">
            <div className="rounded-2xl border bg-white px-4 py-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[#E6F4FF] text-[#0B6EA9] grid place-items-center font-extrabold">
                ✓
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-gray-900">
                  {addedFlash
                    ? addedMsg ?? (isEn ? "Added to cart" : "Waa lagu daray Cart")
                    : isEn
                    ? "In cart"
                    : "Ku jira Cart"}
                </div>
                <div className="text-[12px] text-gray-600 font-semibold truncate">
                  {isEn ? "In cart qty:" : "Tirada ku jirta:"}{" "}
                  {cfg.is_weight ? Number(inCartQty.toFixed(2)) : Math.round(inCartQty)}
                </div>
              </div>
              <Link
                href="/cart"
                className="ml-auto h-10 px-4 rounded-2xl bg-[#0B6EA9] text-white text-sm font-extrabold grid place-items-center"
              >
                {isEn ? "View cart" : "Eeg Cart"}
              </Link>
            </div>
          </div>
        )}

        <div className="bg-white">
          <div className="px-4 pt-2">
            <div className="relative bg-gray-50 rounded-2xl border overflow-hidden">
              {/* BIG HERO */}
              <div className="relative h-[280px] w-full">
                <Image
                  src={heroUrl}
                  alt={String(title || (isEn ? "Product image" : "Sawirka alaabta"))}
                  fill
                  className="object-contain p-4"
                  priority
                />

                {/* DEAL CORNER TAG */}
                {showDiscount ? (
                  <div className="absolute left-3 top-3 rounded-2xl bg-[#0B6EA9] text-white px-3 py-2 shadow">
                    <div className="text-[10px] font-bold opacity-90">{isEn ? "DEAL" : "QIIMO DHIMIS"}</div>
                    <div className="text-[12px] font-extrabold leading-none">-{discountPct}%</div>
                  </div>
                ) : null}
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
                      aria-label={isEn ? `Image ${idx + 1}` : `Sawir ${idx + 1}`}
                    >
                      <Image src={url || "/example.png"} alt="" fill className="object-contain p-2" />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* ✅ UPGRADED PRICE / SAVINGS UX */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="text-4xl font-extrabold text-gray-900 leading-none">{money(lineTotal)}</div>

                  {showDiscount ? (
                    <div className="flex items-center gap-2">
                      <div className="px-2.5 py-1 rounded-full bg-[#E6F4FF] text-[#0B6EA9] text-[12px] font-extrabold">
                        {isEn ? "DISCOUNT" : "QIIMO DHIMIS"} -{discountPct}%
                      </div>
                      <div className="text-[13px] text-gray-400 font-extrabold line-through">{money(baseTotal)}</div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-1 text-[13px] text-gray-600 font-semibold">
                  {money(unitPrice)} / {cfg.unit} • {fmtQty(draftQty, cfg.unit, cfg.is_weight)}
                </div>
              </div>

              {showDiscount && discountAmt > 0.005 ? (
                <div className="shrink-0 px-3 py-2 rounded-2xl bg-[#0B6EA9] text-white shadow">
                  <div className="text-[11px] font-bold opacity-90">{isEn ? "You save" : "Waad badbaadisay"}</div>
                  <div className="text-[15px] font-extrabold leading-none">{money(discountAmt)}</div>
                </div>
              ) : null}
            </div>

            {/* Bulk banner that FEELS like reward */}
            {bestBulk ? (
              <div className="mt-3 rounded-2xl border border-gray-200 bg-white px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-extrabold text-gray-900">{isEn ? "Bulk deal" : "Jumlo"}</div>
                    <div className="mt-0.5 text-[12px] text-gray-700 font-semibold">
                      {money(bestBulk.unit_price)} / {cfg.unit} {isEn ? "from" : "laga bilaabo"} {bestBulk.min_qty}+{" "}
                      {cfg.unit}
                      {bestBulk.max_qty != null
                        ? isEn
                          ? ` (max ${bestBulk.max_qty} ${cfg.unit})`
                          : ` (ugu badnaan ${bestBulk.max_qty} ${cfg.unit})`
                        : ""}
                    </div>
                  </div>

                  {bulkUnlocked ? (
                    <div className="shrink-0 px-3 py-2 rounded-2xl bg-[#E6F4FF] text-[#0B6EA9] font-extrabold text-[12px]">
                      {isEn ? "Bulk applied ✓" : "Jumlo waa shaqaynaysaa ✓"}
                    </div>
                  ) : (
                    <div className="shrink-0 px-3 py-2 rounded-2xl bg-gray-50 text-gray-800 font-extrabold text-[12px]">
                      {isEn ? `Add ${bulkMoreNeeded} more` : `Ku dar ${bulkMoreNeeded} kale`}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Extra “deal message” line to make it FEEL real */}
            {showDiscount ? (
              <div className="mt-3 rounded-2xl bg-[#F1F8FF] border border-[#D6ECFF] px-3 py-2">
                <div className="text-[12px] font-extrabold text-[#0B6EA9]">
                  {isEn ? `Nice! You’re saving ${money(discountAmt)} on this order.` : `Wacan! Waxaad badbaadisay ${money(discountAmt)}.`}
                </div>
                <div className="text-[11px] text-gray-600 font-semibold">
                  {isEn ? "Increase qty to unlock even better bulk prices." : "Kordhi tirada si aad u hesho qiimo jumlo fiican."}
                </div>
              </div>
            ) : null}
          </div>

          {exactOptions.length > 0 || bulkOptions.length > 0 ? (
            <div className="px-4 pb-2">
              <div className="text-sm font-extrabold text-gray-900">{isEn ? "Choose option" : "Xulo ikhtiyaar"}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {exactOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setQtyDraft(String((o as any).qty ?? cfg.min))}
                    className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-[12px] font-extrabold text-gray-900 hover:border-gray-300"
                  >
                    {(o as any).label}
                  </button>
                ))}
                {bulkOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setQtyDraft(String((o as any).min_qty ?? cfg.min))}
                    className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-[12px] font-extrabold text-gray-900 hover:border-gray-300"
                  >
                    {(o as any).label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="px-4 pb-4">
            <div className="text-sm font-extrabold text-gray-900">{isEn ? "Quantity" : "Tirada"}</div>
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

          <BoughtTogether fbw={fbw} addItem={addItem} triggerAddedFlash={triggerAddedFlash} />
        </div>

        <StickyBar lineTotal={lineTotal} isInCart={isInCart} addedFlash={addedFlash} onAdd={onAdd} />
      </section>
    </main>
  );
}