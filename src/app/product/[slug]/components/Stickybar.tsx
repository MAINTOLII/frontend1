"use client";

import React from "react";
import { useLanguage } from "@/context/LanguageContext";
import { money } from "../helpers";

interface StickyBarProps {
  lineTotal: number;
  isInCart: boolean;
  addedFlash: boolean;
  onAdd: () => void;
}

export default function StickyBar({
  lineTotal,
  isInCart,
  addedFlash,
  onAdd,
}: StickyBarProps) {
  const { lang } = useLanguage() as any;
  const isEn = lang === "en";
  return (
    <div
      className="fixed inset-x-0 z-40"
      style={{ bottom: "calc(92px + env(safe-area-inset-bottom))" }}
    >
      <div className="border-t bg-white">
        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold text-gray-900">
                {money(lineTotal)}
              </div>
              <div className="text-[11px] font-semibold text-gray-500">
                {isEn ? "Total" : "Wadar"}
              </div>
            </div>

            <button
              type="button"
              onClick={onAdd}
              className={
                "h-12 flex-1 max-w-[220px] rounded-2xl font-extrabold transition active:scale-[0.99] text-white " +
                (isInCart
                  ? "bg-[#0E5C1C]"
                  : addedFlash
                  ? "bg-[#0E5C1C]"
                  : "bg-[#0B6EA9]")
              }
            >
              {isInCart
                ? isEn
                  ? "In cart ✓"
                  : "Ku jira Cart ✓"
                : addedFlash
                ? isEn
                  ? "Added ✓"
                  : "Waa lagu daray ✓"
                : isEn
                ? "Add to cart"
                : "Ku dar Cart"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
