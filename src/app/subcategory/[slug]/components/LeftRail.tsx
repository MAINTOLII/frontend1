"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

function safeImg(url: any) {
  const s = String(url ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return s;
}

function getLabel(obj: any, lang: "so" | "en") {
  const so = obj?.name_so ?? obj?.name ?? obj?.slug ?? "";
  const en = obj?.name_en ?? obj?.name ?? obj?.slug ?? "";
  return lang === "en" ? en : so;
}

function AllIcon({ active }: { active: boolean }) {
  return (
    <div
      className={`relative h-10 w-10 rounded-full grid place-items-center border transition-all ${
        active ? "bg-[#0B6EA9] border-[#0B6EA9]" : "bg-white border-gray-200"
      }`}
    >
      <div className="grid grid-cols-2 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-2.5 w-2.5 rounded-full ${active ? "bg-white" : "bg-[#0B6EA9]"}`} />
        ))}
      </div>
    </div>
  );
}

export default function LeftRail({
  ssList,
  activeSS,
  setActiveSS,
  lang,
  paneRef,
}: {
  ssList: any[];
  activeSS: string | null;
  setActiveSS: (v: string | null) => void;
  lang: "so" | "en";
  paneRef: React.RefObject<HTMLDivElement | null>;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [railAtTop, setRailAtTop] = useState(true);
  const [railAtBottom, setRailAtBottom] = useState(false);
  const [railHasOverflow, setRailHasOverflow] = useState(false);

  const updateRailEdges = () => {
    const el = railRef.current;
    if (!el) return;
    const hasOverflow = el.scrollHeight > el.clientHeight + 2;
    const atTop = el.scrollTop <= 1;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setRailHasOverflow(hasOverflow);
    setRailAtTop(atTop);
    setRailAtBottom(atBottom);
  };

  const railScrollBy = (dir: "up" | "down") => {
    const el = railRef.current;
    if (!el) return;
    const amount = Math.max(160, Math.floor(el.clientHeight * 0.65));
    el.scrollBy({ top: dir === "up" ? -amount : amount, behavior: "smooth" });
    // update edge state after the scroll animation begins
    window.setTimeout(() => updateRailEdges(), 220);
  };

  useEffect(() => {
    // when list changes, reset + recalc
    requestAnimationFrame(() => {
      try {
        railRef.current?.scrollTo({ top: 0 });
      } catch {}
      updateRailEdges();
      // images/layout can change scrollHeight shortly after
      window.setTimeout(() => updateRailEdges(), 250);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssList?.length]);

  useEffect(() => {
    const onResize = () => updateRailEdges();
    window.addEventListener("resize", onResize);
    // run once after first paint
    requestAnimationFrame(() => updateRailEdges());
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showArrows = ssList.length > 0 && railHasOverflow;

  return (
    <aside className="bg-white border-r px-2 py-2 flex flex-col relative h-full min-h-0">
      {/* ALL */}
      <button
        type="button"
        onClick={() => {
          setActiveSS(null);
          try {
            paneRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          } catch {}
          try {
            railRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          } catch {}
          updateRailEdges();
        }}
        className={`w-full flex flex-col items-center justify-center px-2 py-2 rounded-2xl transition ${
          activeSS === null ? "bg-[#E6F4FF]" : "bg-white"
        }`}
      >
        <AllIcon active={activeSS === null} />
        <div className={`mt-1 text-[11px] font-bold tracking-tight ${activeSS === null ? "text-[#0B6EA9]" : "text-gray-900"}`}>
          {lang === "en" ? "All" : "Dhammaan"}
        </div>
      </button>

      {/* LIST */}
      <div ref={railRef} onScroll={updateRailEdges} className="mt-1.5 flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 pb-10 pt-10">
        {ssList.map((ss: any) => {
          const isActive = activeSS === ss.slug;
          const primary = getLabel(ss, lang);
          const img = safeImg(ss.img);

          return (
            <button
              key={ss.id}
              type="button"
              onClick={() => {
                setActiveSS(ss.slug);
                try {
                  paneRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                } catch {}
              }}
              className={`w-full flex flex-col items-center justify-center px-2 py-2 rounded-2xl transition ${
                isActive ? "bg-[#E6F4FF]" : "bg-white"
              }`}
            >
              {/* NO BG / NO BORDER */}
              <div className="w-full h-14 overflow-hidden relative">
                {img ? (
                  <Image src={img} alt={primary} fill className="object-contain" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-[10px] text-gray-400">
                    {lang === "en" ? "No image" : "Sawir ma jiro"}
                  </div>
                )}
              </div>

              {/* ONE language only */}
              <div className="mt-1.5 text-center leading-tight">
                <div className={`text-[11px] font-bold tracking-tight ${isActive ? "text-[#0B6EA9]" : "text-gray-900"}`}>
                  {primary}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* UP ARROW (only when not at top) */}
      {showArrows && !railAtTop && (
        <button
          type="button"
          onClick={() => railScrollBy("up")}
          aria-label="Scroll up"
          className="absolute top-2 left-1/2 -translate-x-1/2 h-9 w-9 rounded-full bg-white/90 border border-gray-200 shadow grid place-items-center active:scale-[0.98] z-20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-gray-800">
            <path fillRule="evenodd" d="M10 5.293l5.354 5.353a1 1 0 11-1.414 1.414L10 8.121l-3.94 3.94a1 1 0 11-1.414-1.414L10 5.293z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {/* DOWN ARROW (hide when at bottom) */}
      {showArrows && !railAtBottom && (
        <button
          type="button"
          onClick={() => railScrollBy("down")}
          aria-label="Scroll down"
          className="absolute bottom-2 left-1/2 -translate-x-1/2 h-9 w-9 rounded-full bg-white/90 border border-gray-200 shadow grid place-items-center active:scale-[0.98] z-20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-gray-800">
            <path fillRule="evenodd" d="M10 14.707l-5.354-5.353a1 1 0 011.414-1.414L10 11.879l3.94-3.94a1 1 0 011.414 1.414L10 14.707z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </aside>
  );
}