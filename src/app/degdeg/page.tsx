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
          <h1 className="text-xl font-extrabold">Degdeg (Dalab Degdeg)</h1>
          <p className="mt-1 text-sm text-gray-600">
            Ku qor waxa aad rabto hoos, ama si toos ah noogu wac/WhatsApp.
          </p>
        </div>

        {/* PRIMARY CTA: WhatsApp (Somalis prefer WhatsApp) */}
        <a
          href="https://wa.me/252612073874?text=Asc%2C%20waxaan%20rabaa%3A%20"
          className="block w-full rounded-2xl bg-[#0B6EA9] px-4 py-4 text-center text-base font-extrabold text-white shadow-sm active:scale-[0.99]"
        >
          💬 WhatsApp Hadda
          <div className="mt-1 text-xs font-semibold text-white/90">+252 61 207 3874</div>
        </a>

        {/* FORM */}
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-sm font-extrabold">Qor alaabta aad rabto</div>
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

          <div className="mt-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
            💡 Haddii aad degdeg u rabto, ku dir WhatsApp — waxaan kuu jawaabaynaa sida ugu dhaqsaha badan.
          </div>
        </div>

        {/* BOTTOM CTA (after user types) */}
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-sm font-extrabold">Diyaar ma tahay?</div>
          <div className="mt-1 text-xs text-gray-600">
            Riix badhanka hoose si aad WhatsApp noogu soo dirto dalabkaaga.
          </div>

          <a
            href={waHref}
            className="mt-3 block w-full rounded-2xl bg-[#16A34A] px-4 py-4 text-center text-base font-extrabold text-white shadow-sm active:scale-[0.99]"
          >
            ✅ Ku dir Dalabka (WhatsApp)
            <div className="mt-1 text-xs font-semibold text-white/90">+252 61 207 3874</div>
          </a>

          <a
            href="tel:+252612073874"
            className="mt-3 block w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-center text-sm font-extrabold text-gray-900 shadow-sm active:scale-[0.99]"
          >
            📞 Ama Wac (Call)
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
