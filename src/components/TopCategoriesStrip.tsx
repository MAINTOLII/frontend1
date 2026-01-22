/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";

type Lang = "en" | "so";

type CategoryRow = {
  id: number;
  slug: string | null;
  name_en: string | null;
  name_so: string | null;
  img: string | null;
};

export default function TopCategoriesStrip({
  categoryMap,
  lang,
  compact,
  activeSlug,
  onPick,
}: {
  categoryMap: CategoryRow[];
  lang: Lang;
  compact: boolean;
  activeSlug: string | null;
  onPick: (slug: string) => void;
}) {
  if (!categoryMap || categoryMap.length === 0) return null;

  return (
    <section className="sticky top-[100px] z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className={compact ? "py-0.5" : "py-1"}>
        <div className="mx-auto max-w-md px-1.5 flex flex-nowrap items-start justify-between gap-0.5 overflow-x-hidden">
          {categoryMap.map((cat) => {
            const label = ((lang === "en" ? cat.name_en : cat.name_so) ?? "").trim();

            const imgSrc =
              typeof cat.img === "string" && cat.img.trim().length > 0
                ? cat.img.trimEnd()
                : "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/subcategories/baleware.webp";

            const isActive = !!cat.slug && activeSlug === cat.slug;

            return (
              <button
                key={cat.id}
                onClick={() => cat.slug && onPick(cat.slug)}
                className={`w-[64px] px-1 rounded-2xl transition-all duration-200 active:scale-[0.98] ${
                  isActive ? "bg-[#E3F2FF] shadow-sm ring-1 ring-[#0B6EA9]/20" : "bg-white/40"
                }`}
                type="button"
                disabled={!cat.slug}
                title={!cat.slug ? "Category slug missing" : ""}
              >
                <div
                  className={`mx-auto overflow-hidden flex items-center justify-center transition-all duration-200 rounded-full ${
                    compact ? "h-0 w-0 opacity-0" : "h-9 w-9 opacity-100"
                  } ${
                    isActive
                      ? "bg-[#DBEAFE] ring-2 ring-[#0B6EA9] shadow-md"
                      : "bg-[#F1F5F9] ring-1 ring-black/5"
                  }`}
                >
                  <Image
                    src={imgSrc}
                    alt={label || "Category"}
                    width={32}
                    height={32}
                    className="w-full h-full object-contain p-1"
                  />
                </div>

                <div
                  className={`${compact ? "mt-0" : "mt-0.5"} text-[11px] text-center leading-tight font-bold tracking-tight transition-colors ${
                    isActive ? "text-[#0B6EA9]" : "text-[#0B3C6E]"
                  }`}
                >
                  {label || "—"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}