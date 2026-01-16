"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SearchBar({ placeholder = "50,000+ items" }) {
  const pathname = usePathname();

  // Hide the search bar on checkout pages
  if (pathname?.startsWith("/checkout")) return null;

  return (
    <Link
      href="/search"
      className="flex items-center w-full h-11 rounded-2xl bg-white px-3 gap-3 text-sm shadow-sm border border-gray-100 active:scale-[0.98] transition-all"
      style={{ fontSize: "14px" }}
    >
      <div className="h-9 w-9 rounded-xl bg-[#0B6EA9]/10 flex items-center justify-center text-[#0B6EA9] shadow-sm">
        🔎
      </div>

      <span className="flex-1 truncate text-[14px] text-gray-500">
        Search for <span className="font-semibold text-[#0B6EA9]">{placeholder}</span>
      </span>

      <span className="text-[#0B6EA9]/60 text-lg">⌘</span>
    </Link>
  );
}