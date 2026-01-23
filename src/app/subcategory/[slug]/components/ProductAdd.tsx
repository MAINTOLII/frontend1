"use client";

import type { Dispatch, SetStateAction } from "react";

import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";

import { fmtQty, normalizeConfigLite, normalizeQty } from "../helpers";

export default function ProductAdd({
  p,
  setJustAddedId,
  setQtyDraft,
}: {
  p: any;
  setJustAddedId: Dispatch<SetStateAction<string | null>>;
  setQtyDraft: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  const { items, addItem, setQty } = useCart();
  const { lang } = useLanguage();

  const productId = String(p?.id);
  const item = (items ?? []).find((i: any) => String(i.productId) === productId);
  const inCartQty = Number(item?.qty ?? 0);

  const cfg = normalizeConfigLite(p?.online_config, p);

  // Stock from products table
  const stock = Number(p?.qty ?? 0);
  const outOfStock = !Number.isFinite(stock) || stock <= 0;

  const addNow = () => {
    const startQty = normalizeQty(cfg.min, cfg.min, cfg.step, cfg.is_weight);
    (addItem as any)(productId, null as any, startQty);
    setJustAddedId(productId);
    setQtyDraft((prev) => ({ ...prev, [productId]: String(startQty) }));
  };

  const minus = () => {
    const nextRaw = inCartQty - cfg.step;
    if (nextRaw <= 0) {
      (setQty as any)(productId, null as any, 0);
      setQtyDraft((prev) => ({ ...prev, [productId]: String(cfg.min) }));
      return;
    }
    const next = normalizeQty(nextRaw, cfg.min, cfg.step, cfg.is_weight);
    (setQty as any)(productId, null as any, next);
    setQtyDraft((prev) => ({ ...prev, [productId]: String(next) }));
  };

  const plus = () => {
    const next = normalizeQty(inCartQty + cfg.step, cfg.min, cfg.step, cfg.is_weight);
    (setQty as any)(productId, null as any, next);
    setQtyDraft((prev) => ({ ...prev, [productId]: String(next) }));
  };

  // Not in cart -> single Add button
  if (!item) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={addNow}
          disabled={outOfStock}
          className={`w-full h-10 rounded-2xl text-[13px] font-extrabold active:scale-[0.99] transition shadow-sm ${
            outOfStock ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-[#0B6EA9] text-white"
          }`}
        >
          {outOfStock
            ? lang === "en"
              ? "Out of stock"
              : "Waa ka dhammaatay"
            : lang === "en"
            ? "Add to cart"
            : "Ku dar gaadhiga"}
        </button>
      </div>
    );
  }

  // In cart -> - qty +
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={minus}
        className="w-10 h-10 rounded-full bg-[#0B6EA9] text-white text-xl font-extrabold grid place-items-center active:scale-[0.99]"
        aria-label="decrease"
      >
        −
      </button>

      <div className="flex-1">
        <div className="w-full h-10 rounded-2xl border border-gray-200 bg-white text-[13px] font-extrabold text-gray-900 grid place-items-center">
          {fmtQty(inCartQty, cfg.unit, cfg.is_weight)}
        </div>
      </div>

      <button
        type="button"
        onClick={plus}
        className="w-10 h-10 rounded-full bg-[#0B6EA9] text-white text-xl font-extrabold grid place-items-center active:scale-[0.99]"
        aria-label="increase"
      >
        +
      </button>
    </div>
  );
}
