"use client";

import { useState } from "react";
import Link from "next/link";
import Promo from "@/components/Promo";

export default function DiscountsPage() {
  const [minPercent, setMinPercent] = useState(0);
  const [categoryGroup, setCategoryGroup] = useState<"All" | "food" | "baby" | "cosmetics" | "household" | "other">("All");

  return (
    <main className="min-h-screen bg-[#F6F8FB]">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 border-b border-[#D9E7F5] bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px] font-extrabold text-[#0B6EA9]"
              aria-label="Back Home"
            >
              <span className="text-[16px]">‹</span>
              Back
            </Link>

            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#EAF4FF] text-[#0B6EA9]">🔥</span>
              <div className="text-center">
                <div className="text-[16px] font-extrabold text-[#0B3C6E]">Qiimo Dhimis</div>
                <div className="text-[12px] font-semibold text-gray-500">Hoos u dhacay qiimaha maanta</div>
              </div>
            </div>

            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F6F8FB] text-[16px]">🔔</span>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#F6F8FB] text-[16px]">🛒</span>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-gray-500">Updated today • Limited stock</div>
            <div className="text-[12px] font-extrabold text-[#F59E0B]">Don’t miss out</div>
          </div>

          {/* Filter pills (UI only for now) */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {[
              { label: "All", percent: 0 },
              { label: "10%+", percent: 10 },
              { label: "20%+", percent: 20 },
            ].map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => {
                  setMinPercent(f.percent);
                  setCategoryGroup("All");
                }}
                className={
                  "whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-extrabold transition " +
                  (minPercent === f.percent
                    ? "bg-[#EAF4FF] text-[#0B6EA9]"
                    : "bg-white text-[#0B3C6E] border border-[#D9E7F5]")
                }
              >
                {f.label}
              </button>
            ))}

            {/* Category filters */}
            {[
              { label: "Food", key: "food" as const },
              { label: "Baby", key: "baby" as const },
              { label: "Beauty", key: "cosmetics" as const },
              { label: "Household", key: "household" as const },
            ].map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setCategoryGroup(c.key);
                  setMinPercent(0);
                }}
                className={
                  "whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-extrabold transition " +
                  (categoryGroup === c.key
                    ? "bg-[#EAF4FF] text-[#0B6EA9]"
                    : "bg-white text-[#0B3C6E] border border-[#D9E7F5]")
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-4">
        {/* Subtle urgency banner */}
        <div className="rounded-2xl border border-[#FFD9A8] bg-[#FFF7ED] px-3 py-2 text-[13px] font-semibold text-[#9A3412]">
          ⏰ Qiimo dhimisku wuu xadidan yahay — badeecooyin qaar way dhammaanayaan.
        </div>

        {/* Section header */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-[16px] font-extrabold text-[#0B3C6E]">🔥 Today’s Best Deals</div>
          <span className="text-[12px] font-bold text-gray-500">Scroll</span>
        </div>
      </div>

      {/* Discount feed (reuses the same Promo cards) */}
      <div className="mt-2">
        <Promo
          limit={50}
          seeAllHref="/discounts"
          variant="grid"
          showHeader={false}
          showSeeAll={false}
          minPercent={minPercent}
          categoryGroup={categoryGroup}
        />
      </div>

      <div className="h-10" />
    </main>
  );
}