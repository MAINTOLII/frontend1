import { supabase } from "@/lib/supabaseClient";

/** =========================
 * Types (minimal – enough for UI)
 ========================= */
export type CategoryRow = {
  id: number; // bigint
  slug: string | null;
  name_en: string | null;
  name_so: string | null;
  img: string | null;
};

export type SubcategoryRow = {
  id: number; // bigint
  category_id: number | null;
  slug: string | null;
  name_en: string | null;
  name_so: string | null;
  img: string | null;
};

export type SubSubcategoryRow = {
  id: number; // bigint
  subcategory_id: number | null;
  slug: string | null;
  name_en: string | null;
  name_so: string | null;
  img: string | null;
};

export type ProductRow = {
  id: string;
  slug: string;
  qty: number | string;
  cost: number | string;
  price: number | string;
  mrp?: number | string; // optional: some DB versions don't have this column
  tags: string[];
  is_weight: boolean;
  subsubcategory_id: number | null;
  is_online: boolean;
  min_order_qty: number | string | null;
  qty_step: number | string | null;
  online_config: any | null;
  img: string | null;
};

export type ProductImageRow = {
  id?: number; // bigint
  product_id: string; // uuid
  path: string;
  alt: string | null;
  sort_order: number;
  created_at?: string;
};

// Variants are removed from this project, but some UI components still import
// the old helpers. Keep a tiny compatibility layer to prevent build errors.
export type ProductVariantRow = {
  id: string;
  product_id: string;
  slug: string | null;
  price: number | string | null;
  qty: number | string | null;
  is_online: boolean | null;
};

/** =========================
 * Helpers
 ========================= */
export function safeImg(src: any) {
  const raw = String(src ?? "").trim();
  if (!raw) return "";

  // Already a usable URL/path
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return raw;

  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!base) return "";

  // Normalize encoding to avoid %25 double-encoding issues.
  // Example: "Qamar%20Milk.webp" and "Qamar Milk.webp" both become "Qamar%20Milk.webp".
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  // If they stored a full storage path (already includes "storage/v1/object/public/")
  if (decoded.includes("storage/v1/object/public/")) {
    const idx = decoded.indexOf("storage/v1/object/public/");
    const tail = decoded.slice(idx + "storage/v1/object/public/".length).replace(/^\/+/, "");
    const safeTail = tail
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    return `${base}/storage/v1/object/public/${safeTail}`;
  }

  // If they stored with/without bucket prefix, always resolve under product-images bucket.
  const tail = decoded.replace(/^\/+/, "");
  const safeTail = tail
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  return `${base}/storage/v1/object/public/product-images/${safeTail}`;
}

/** =========================
 * Home page helpers
 ========================= */
export async function getCategoriesWithSubcategories() {
  const { data: cats, error: catErr } = await supabase
    .from("categories")
    .select("id,slug,name_en,name_so,img")
    .order("id", { ascending: true });

  if (catErr) throw catErr;

  const { data: subs, error: subErr } = await supabase
    .from("subcategories")
    .select("id,category_id,slug,name_en,name_so,img")
    .order("id", { ascending: true });

  if (subErr) throw subErr;

  const categories = (cats ?? []) as CategoryRow[];
  const subcategories = (subs ?? []) as SubcategoryRow[];

  return categories.map((cat) => ({
    ...cat,
    subcats: subcategories.filter((s) => String(s.category_id) === String(cat.id)),
  }));
}

/** =========================
 * Product page helpers
 ========================= */
export async function fetchProductBySlug(slug: string) {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,slug,qty,cost,price,tags,is_weight,subsubcategory_id,is_online,min_order_qty,qty_step,online_config,img"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ProductRow | null;
}
/** =========================
 * Cart helpers (by ids)
 ========================= */
export async function getProductsByIds(ids: string[]) {
  const unique = Array.from(new Set((ids || []).map(String))).filter(Boolean);
  if (!unique.length) return [];

  const { data, error } = await supabase
    .from("products")
    .select(
      "id,slug,qty,cost,price,tags,is_weight,subsubcategory_id,is_online,min_order_qty,qty_step,online_config,img"
    )
    .in("id", unique);

  if (error) throw error;
  return (data ?? []) as ProductRow[];
}
/** =========================
 * Subcategory page helpers
 ========================= */

// 1) subcategory by slug
export async function fetchSubcategoryBySlug(slug: string) {
  const s = String(slug ?? "").trim();
  if (!s) return null;

  const { data, error } = await supabase
    .from("subcategories")
    .select("id,category_id,slug,name_en,name_so,img")
    .eq("slug", s)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as SubcategoryRow | null;
}

// 2) subsubcategories under a subcategory
export async function fetchSubSubcategoriesBySubcategoryId(subcategoryId: number | string) {
  const id = Number(subcategoryId);
  if (!id) return [];

  const { data, error } = await supabase
    .from("subsubcategories")
    .select("id,subcategory_id,slug,name_en,name_so,img")
    .eq("subcategory_id", id)
    .order("id", { ascending: true });

  if (error) throw error;
  return (data ?? []) as SubSubcategoryRow[];
}

// 3) products by subcategory id (NEW DB: products link to subsubcategory_id)
export async function fetchProductsBySubcategoryId(subcategoryId: number | string) {
  const id = Number(subcategoryId);
  if (!id) return [];

  const { data: subsubs, error: subsubErr } = await supabase
    .from("subsubcategories")
    .select("id")
    .eq("subcategory_id", id);

  if (subsubErr) throw subsubErr;

  const ids = (subsubs ?? []).map((x: any) => x.id).filter((x: any) => x != null);
  if (ids.length === 0) return [];

  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select(
      "id,slug,qty,cost,price,tags,is_weight,subsubcategory_id,is_online,min_order_qty,qty_step,online_config,img,created_at,updated_at"
    )
    .in("subsubcategory_id", ids)
    .eq("is_online", true)
    .order("updated_at", { ascending: false });

  if (prodErr) throw prodErr;
  return (products ?? []) as ProductRow[];
}

export async function fetchProductImagesByProductIds(productIds: string[]) {
  const unique = Array.from(new Set((productIds || []).map(String))).filter(Boolean);
  if (!unique.length) return [];

  const { data, error } = await supabase
    .from("product_images")
    .select("id,product_id,path,alt,sort_order,created_at")
    .in("product_id", unique)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ProductImageRow[];
}

// Compatibility: variants removed. Return empty list so legacy UI can still build.
export async function fetchVariantsByProductIds(_productIds: string[]) {
  return [] as ProductVariantRow[];
}