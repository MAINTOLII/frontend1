/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const HERO_SLIDES = [
  {
    id: 1,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad1.webp",
  },
  {
    id: 2,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad5.webp",
  },
  {
    id: 3,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad3.webp",
  },
  {
    id: 4,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad1.webp",
  },
  {
    id: 5,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad1.webp",
  },
];

export default function Hero({
  intervalMs = 3500,
  height = 140,
}: {
  intervalMs?: number;
  height?: number;
}) {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (HERO_SLIDES.length <= 1) return;
    const t = setInterval(() => {
      setActiveSlide((s) => (s + 1) % HERO_SLIDES.length);
    }, intervalMs);

    return () => clearInterval(t);
  }, [intervalMs]);

  return (
    <section className="bg-white py-0">
      <div
        className="relative overflow-hidden rounded-2xl bg-white w-full"
        style={{ height }}
      >
        <div
          className="flex transition-transform duration-500"
          style={{ transform: `translateX(-${activeSlide * 100}%)` }}
        >
          {HERO_SLIDES.map((s) => (
            <div
              key={s.id}
              className="flex-none w-full flex items-center justify-center bg-white"
              style={{ height }}
            >
              <Image
                src={s.img}
                alt="promo"
                width={900}
                height={height}
                className="h-full w-full object-contain"
                priority
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}