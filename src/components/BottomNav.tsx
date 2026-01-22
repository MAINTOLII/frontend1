"use client";

import React, { useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  /** treat these path prefixes as active (eg /cart/checkout) */
  activePrefixes?: string[];
  /** draw attention (e.g. discounts) */
  special?: boolean;
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

function IconCart({ active, count }: { active: boolean; count: number }) {
  const show = count > 0;
  const label = count > 99 ? "99+" : String(count);

  return (
    <span className="relative inline-flex">
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

      {show ? (
        <span
          className={
            "absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white " +
            (active ? "bg-[#0B6EA9]" : "bg-gray-700") +
            " animate-pulse"
          }
          style={{ animationDuration: "2.2s" }}
          aria-label={`${count} items in cart`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}

function IconDiscount({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`h-6 w-6 ${active ? "text-[#F59E0B]" : "text-[#F59E0B]"}`}
    >
      {/* tag */}
      <path
        d="M20 13.5 13.5 20a2 2 0 0 1-2.8 0L4 13.3V4h9.3L20 10.7a2 2 0 0 1 0 2.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 8.2h.01"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* percent */}
      <path
        d="M10 14.8l4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M10.2 13.2h.01M14.8 15.8h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname() || "/";

  const [cartCount, setCartCount] = useState(0);

  const computeCartCount = (raw: any): number => {
    try {
      if (!raw) return 0;
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;

      // Common shapes:
      // 1) array of items: [{ qty: 2 }, ...]
      if (Array.isArray(data)) {
        const sum = data.reduce((acc, item) => {
          const q = Number((item as any)?.qty ?? (item as any)?.quantity ?? 1);
          return acc + (Number.isFinite(q) ? q : 1);
        }, 0);
        return Math.max(0, Math.trunc(sum));
      }

      // 2) object with items array
      if (data && Array.isArray((data as any).items)) {
        const sum = (data as any).items.reduce((acc: number, item: any) => {
          const q = Number(item?.qty ?? item?.quantity ?? 1);
          return acc + (Number.isFinite(q) ? q : 1);
        }, 0);
        return Math.max(0, Math.trunc(sum));
      }

      // 3) object keyed by id
      if (data && typeof data === "object") {
        const values = Object.values(data as Record<string, any>);
        const sum = values.reduce<number>((acc, item) => {
          const q = Number(item?.qty ?? item?.quantity ?? 1);
          return acc + (Number.isFinite(q) ? q : 1);
        }, 0);
        return Math.max(0, Math.trunc(sum));
      }

      return 0;
    } catch {
      return 0;
    }
  };

  const readCartCount = () => {
    if (typeof window === "undefined") return;

    // Try a few likely keys (keeps it working even if you rename later)
    const keys = ["cart", "matomart_cart", "cartItems", "cart_items", "checkout_cart"];
    for (const k of keys) {
      const v = window.localStorage.getItem(k);
      if (v) {
        setCartCount(computeCartCount(v));
        return;
      }
    }
    setCartCount(0);
  };

  useEffect(() => {
    readCartCount();

    // Update when another tab changes localStorage
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      const watched = new Set(["cart", "matomart_cart", "cartItems", "cart_items", "checkout_cart"]);
      if (watched.has(e.key)) readCartCount();
    };

    // Also allow your app to trigger a refresh:
    // window.dispatchEvent(new Event('cart-updated'))
    const onCartUpdated = () => readCartCount();

    window.addEventListener("storage", onStorage);
    window.addEventListener("cart-updated", onCartUpdated as any);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("cart-updated", onCartUpdated as any);
    };
  }, []);

  const items: NavItem[] = [
    {
      href: "/",
      label: "Home",
      icon: (active) => <IconHome active={active} />,
      activePrefixes: ["/"],
    },
    {
      href: "/degdeg",
      label: "Degdeg",
      icon: (active) => <IconList active={active} />,
      activePrefixes: ["/degdeg"],
    },
    {
      href: "/discounts",
      label: "Qiimo Dhimis",
      icon: (active) => <IconDiscount active={active} />,
      activePrefixes: ["/discounts"],
      special: true,
    },
    {
      href: "/cart",
      label: "Cart",
      icon: (active) => <IconCart active={active} count={cartCount} />,
      activePrefixes: ["/cart", "/checkout"],
    },
  ];

  const isActive = (item: NavItem) => {
    const prefixes = item.activePrefixes?.length ? item.activePrefixes : [item.href];
    return prefixes.some((p) => (p === "/" ? pathname === "/" : pathname.startsWith(p)));
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50">
      <div className="border-t bg-white">
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
                    (item.special
                      ? (active
                          ? "bg-[#FFF7ED] text-[#B45309] ring-1 ring-[#FDBA74]"
                          : "bg-[#FFF7ED] text-[#B45309] ring-1 ring-[#FED7AA] animate-pulse")
                      : (active ? "text-[#0B6EA9]" : "text-gray-600"))
                  }
                >
                  {/** icon */}
                  <span className={active ? "scale-105" : ""}>{item.icon(active)}</span>
                  <span
                    className={
                      "text-[11px] font-semibold tracking-tight " +
                      (item.special
                        ? "text-[#B45309]"
                        : (active ? "text-[#0B6EA9]" : "text-gray-600"))
                    }
                  >
                    {item.label}
                  </span>
                  {active ? (
                    <span className={"mt-0.5 h-1 w-6 rounded-full " + (item.special ? "bg-[#F59E0B]" : "bg-[#0B6EA9]")} />
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
