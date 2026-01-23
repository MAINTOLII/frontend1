"use client";

import Link from "next/link";

function money(n: number) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

export default function StickyCartBar({
  count,
  total,
  lang,
}: {
  count: number;
  total: number;
  lang: "so" | "en";
}) {
  if (!(count > 0)) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50"
      style={{ bottom: "calc(88px + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-md px-3">
        <Link
          href="/cart"
          className="flex items-center justify-between bg-[#0B6EA9] text-white rounded-2xl px-4 py-3 shadow-lg"
        >
          <div>
            <div className="text-xs opacity-90">
              {count} {lang === "en" ? "item" : "shay"}
              {count > 1 ? "s" : ""} {lang === "en" ? "in cart" : "gaadhiga ku jira"}
            </div>
            <div className="text-lg font-extrabold">{money(total)}</div>
          </div>

          <div className="text-right leading-tight font-extrabold">
            <div>{lang === "en" ? "Go to Cart →" : "U gudub Gaadhiga →"}</div>
            <div className="text-[10px] opacity-80">{lang === "en" ? "View cart" : "Eeg gaadhiga"}</div>
          </div>
        </Link>
      </div>
    </div>
  );
}