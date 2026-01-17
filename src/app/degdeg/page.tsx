"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

export default function DegdegPage() {
  const [items, setItems] = useState("");
  const waHref = useMemo(() => {
    const msg = encodeURIComponent(`Asc, waxaan rabaa: ${items || ""}`);
    return `https://wa.me/252612073874?text=${msg}`;
  }, [items]);

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-md px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-center">Dalab Degdeg</h1>
          <p className="mt-1 text-sm text-gray-600 text-center">
            Ku qor dalabkaaga, kadibna ku dir WhatsApp.
          </p>
        </div>

        {/* FORM */}
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-sm font-extrabold">Dalabkaaga</div>
          <div className="mt-1 text-xs text-gray-600">
            Tusaale: 2 bariis, 1 saliid, 3 caano, 1 tissue...
          </div>

          <textarea
            className="mt-3 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-[#0B6EA9] focus:ring-2 focus:ring-[#0B6EA9]/20"
            rows={6}
            value={items}
            onChange={(e) => setItems(e.target.value)}
            placeholder="Ku qor halkan…"
          />
        </div>

        {/* BOTTOM CTA (after user types) */}
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-sm font-extrabold text-center">Dalbo hadda</div>

          <a
            href={waHref}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#16A34A] px-4 py-4 text-center text-base font-extrabold text-white shadow-sm active:scale-[0.99]"
          >
            <span>📲</span>
            <span>Ku dir WhatsApp</span>
          </a>

          <a
            href="tel:+252612073874"
            className="mt-3 block w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-center text-sm font-extrabold text-gray-900 shadow-sm active:scale-[0.99]"
          >
            📞 Wac +252 61 207 3874
          </a>
        </div>

        <div className="mt-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-extrabold text-[#0B6EA9]"
          >
            ← Ku noqo dukaanka
          </Link>
        </div>
      </div>
    </main>
  );
}
