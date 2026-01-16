"use client";

import { usePathname, useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import { useLanguage } from "@/context/LanguageContext";

/* cookie helper */
function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

export default function TopNavbar() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  const isSearchPage = pathname === "/search";

  const { lang, setLang } = useLanguage();

  const showBack =
    pathname !== "/" &&
    (pathname.startsWith("/product") ||
      pathname.startsWith("/subcategory") ||
      isSearchPage);

  const placeholderCount = "50,000+";

  return (
    <header className="sticky top-0 z-50 border-b border-white/15 bg-gradient-to-b from-[#0B6EA9] via-[#1180C3] to-[#0B6EA9]">
      {/* subtle shine */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/20 to-transparent" />

      <div className="mx-auto max-w-md px-3 pt-2 pb-2">
        {/* top row: brand + language */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="group inline-flex items-center gap-2 rounded-full px-2 py-1 text-white/95"
            aria-label="Home"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              🛒
            </span>
            <span className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight">MatoMart</div>
              <div className="text-[11px] text-white/80">Dukaanka online</div>
            </span>
          </button>

          <div className="flex items-center rounded-full bg-white/15 p-1 ring-1 ring-white/25 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => {
                setLang("so");
                setCookie("lang", "so");
              }}
              className={`h-8 w-10 rounded-full text-sm font-extrabold transition active:scale-[0.98] ${
                lang === "so" ? "bg-white text-[#0B6EA9] shadow" : "text-white/90 hover:bg-white/10"
              }`}
              aria-label="Somali"
            >
              🇸🇴
            </button>
            <button
              type="button"
              onClick={() => {
                setLang("en");
                setCookie("lang", "en");
              }}
              className={`h-8 w-10 rounded-full text-sm font-extrabold transition active:scale-[0.98] ${
                lang === "en" ? "bg-white text-[#0B6EA9] shadow" : "text-white/90 hover:bg-white/10"
              }`}
              aria-label="English"
            >
              🇬🇧
            </button>
          </div>
        </div>

        {/* search row */}
        <div className="mt-2 flex items-center gap-2">
          {showBack ? (
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
              className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm shadow-sm active:scale-[0.98]"
              aria-label="Back"
            >
              <span className="text-lg">←</span>
            </button>
          ) : null}

          {!isSearchPage ? (
            <div className="min-w-0 flex-1">
              <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm">
                <div className="px-1 py-1">
                  <SearchBar placeholder={placeholderCount} />
                </div>
              </div>
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
        </div>
      </div>
    </header>
  );
}
