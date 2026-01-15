"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** treat these path prefixes as active (eg /cart/checkout) */
  activePrefixes?: string[];
};

function IconHome({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`h-6 w-6 ${active ? "text-[#0B6EA9]" : "text-gray-500"}`}
    >
      <path
        d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6H4a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconList({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`h-6 w-6 ${active ? "text-[#0B6EA9]" : "text-gray-500"}`}
    >
      <path
        d="M8 6h13M8 12h13M8 18h13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCart({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`h-6 w-6 ${active ? "text-[#0B6EA9]" : "text-gray-500"}`}
    >
      <path
        d="M6 6h15l-1.6 8.2a2 2 0 0 1-2 1.6H9.2a2 2 0 0 1-2-1.6L5.5 3.5H3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M9.5 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17.5 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname() || "/";

  const items: NavItem[] = [
    {
      href: "/",
      label: "Home",
      icon: <IconHome active={pathname === "/"} />,
      activePrefixes: ["/"] ,
    },
    {
      href: "/categories",
      label: "List",
      icon: <IconList active={pathname.startsWith("/categories")} />,
      activePrefixes: ["/categories", "/category", "/subcategory"],
    },
    {
      href: "/cart",
      label: "Cart",
      icon: <IconCart active={pathname.startsWith("/cart")} />,
      activePrefixes: ["/cart", "/checkout"],
    },
  ];

  const isActive = (item: NavItem) => {
    const prefixes = item.activePrefixes?.length ? item.activePrefixes : [item.href];
    return prefixes.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50">
      {/* subtle fade so content doesn't feel cut off */}
      <div className="pointer-events-none h-6 bg-gradient-to-t from-white to-transparent" />

      <div className="border-t bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto max-w-md px-3">
          <div className="mb-[env(safe-area-inset-bottom)] flex items-center justify-between gap-2 py-2">
            {items.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  className={
                    "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-2 transition " +
                    (active
                      ? "bg-[#E8F4FB] text-[#0B6EA9]"
                      : "hover:bg-gray-50 text-gray-600")
                  }
                >
                  {/** icon */}
                  <span className={active ? "scale-105" : ""}>{item.icon}</span>
                  <span
                    className={
                      "text-[11px] font-semibold tracking-tight " +
                      (active ? "text-[#0B6EA9]" : "text-gray-600")
                    }
                  >
                    {item.label}
                  </span>
                  {active ? (
                    <span className="mt-0.5 h-1 w-6 rounded-full bg-[#0B6EA9]" />
                  ) : (
                    <span className="mt-0.5 h-1 w-6 rounded-full bg-transparent" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
