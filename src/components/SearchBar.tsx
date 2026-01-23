"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";

export default function SearchBar({ placeholder = "50,000+ items" }) {
  const pathname = usePathname();
  const { lang } = useLanguage();

  // Hide the search bar on checkout pages
  if (pathname?.startsWith("/checkout")) return null;

  return (
    <Link
      href="/search"
      className="flex items-center w-full h-11 cursor-pointer rounded-2xl bg-white px-3 gap-3 text-[14px] shadow-sm border border-gray-100 active:scale-[0.98] transition-all"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 text-gray-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-4.35-4.35m1.85-5.65a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"
        />
      </svg>

      <span className="flex-1 truncate text-[14px] text-gray-600">
        {lang === "so" ? "Raadi alaab..." : "Search products..."}
      </span>

      <span className="text-[#0B6EA9]/60 text-lg">⌘</span>
    </Link>
  );
}