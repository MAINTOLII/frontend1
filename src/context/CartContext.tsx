"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Client-side Supabase (CartContext is a Client Component)
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export type CartItem = {
  productId: string;          // uuid
  variantId: string | null;   // uuid (null allowed for simple products)
  qty: number;
};

type CartContextType = {
  items: CartItem[];
  addItem: (productId: string, variantId: string | null, qty?: number) => void;
  setQty: (productId: string, variantId: string | null, qty: number) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextType | null>(null);
const LS_KEY = "matomart_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Cache stock lookups to keep UI fast while you browse
  const stockCacheRef = useRef(new Map<string, { qty: number; ts: number }>());
  const inFlightRef = useRef(new Map<string, Promise<number>>());

  const STOCK_TTL_MS = 30_000; // 30s cache

  function notify(message: string) {
    try {
      window.dispatchEvent(new CustomEvent("matomart_toast", { detail: { type: "error", message } }));
    } catch {
      // ignore
    }
    // Fallback for now
    console.warn(message);
  }

  async function getProductStock(productId: string): Promise<number> {
    if (!productId) return 0;
    if (!supabase) return 0;

    const now = Date.now();
    const cached = stockCacheRef.current.get(productId);
    if (cached && now - cached.ts < STOCK_TTL_MS) return cached.qty;

    const inFlight = inFlightRef.current.get(productId);
    if (inFlight) return inFlight;

    const p = (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("qty")
        .eq("id", productId)
        .maybeSingle();

      if (error) {
        console.error("STOCK LOOKUP ERROR", error);
        // If stock can't be verified, behave safely: block adds by returning 0
        stockCacheRef.current.set(productId, { qty: 0, ts: Date.now() });
        return 0;
      }

      const qty = Number((data as any)?.qty ?? 0);
      const safeQty = Number.isFinite(qty) ? qty : 0;
      stockCacheRef.current.set(productId, { qty: safeQty, ts: Date.now() });
      return safeQty;
    })();

    inFlightRef.current.set(productId, p);
    try {
      return await p;
    } finally {
      inFlightRef.current.delete(productId);
    }
  }

  function keyOf(productId: string, variantId: string | null) {
    return `${productId}::${variantId ?? ""}`;
  }

  // Validate a single line item against stock and fix cart if needed.
  async function enforceStockForLine(productId: string, variantId: string | null) {
    const stock = await getProductStock(productId);

    setItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === productId && i.variantId === variantId);
      if (idx === -1) return prev;

      const current = prev[idx];
      const currentQty = Number(current.qty ?? 0);
      const safeQty = Number.isFinite(currentQty) ? currentQty : 0;

      // Out of stock → remove
      if (stock <= 0) {
        notify("Out of stock: removed from cart");
        return prev.filter((_, j) => j !== idx);
      }

      // Over stock → clamp
      if (safeQty > stock) {
        notify("Not enough stock: quantity adjusted");
        return prev.map((it, j) => (j === idx ? { ...it, qty: stock } : it));
      }

      return prev;
    });
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setItems(JSON.parse(stored));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  }, [items]);

  // After any cart change, re-validate each line against stock (safety net).
  useEffect(() => {
    if (!items.length) return;

    const uniq = new Set<string>();
    for (const it of items) {
      uniq.add(keyOf(it.productId, it.variantId));
    }

    // Validate without blocking UI
    for (const k of uniq) {
      const [pid, vid] = k.split("::");
      void enforceStockForLine(pid, vid || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  function addItem(productId: string, variantId: string | null, qty = 1) {
    const addQty = Number(qty ?? 1);
    const safeAdd = Number.isFinite(addQty) ? addQty : 1;
    if (safeAdd <= 0) return;

    // Optimistic add for snappy UI
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === productId && i.variantId === variantId);
      if (existing) {
        return prev.map((i) =>
          i.productId === productId && i.variantId === variantId ? { ...i, qty: i.qty + safeAdd } : i
        );
      }
      return [...prev, { productId, variantId, qty: safeAdd }];
    });

    // Then enforce stock (removes/clamps if needed)
    void enforceStockForLine(productId, variantId);
  }

  function setQty(productId: string, variantId: string | null, qty: number) {
    const n = Number(qty ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    if (safe <= 0) return removeItem(productId, variantId);

    setItems((prev) =>
      prev.map((i) => (i.productId === productId && i.variantId === variantId ? { ...i, qty: safe } : i))
    );

    void enforceStockForLine(productId, variantId);
  }

  function removeItem(productId: string, variantId: string | null) {
    setItems((prev) => prev.filter((i) => !(i.productId === productId && i.variantId === variantId)));
  }

  function clearCart() {
    setItems([]);
  }

  return (
    <CartContext.Provider value={{ items, addItem, setQty, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}