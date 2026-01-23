/** ===== helpers ===== */
export function money(n: number) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

export function parseNum(v: unknown): number {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function roundToStep(value: number, step: number) {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(step) || step <= 0) return value;
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
}

export function normalizeQty(value: number, min: number, step: number, isWeight: boolean) {
  const safeMin = Number.isFinite(min) && min > 0 ? min : isWeight ? 0.5 : 1;
  const safeStep = Number.isFinite(step) && step > 0 ? step : isWeight ? 0.5 : 1;
  const v = Number.isFinite(value) ? value : safeMin;
  const clamped = v < safeMin ? safeMin : v;
  const stepped = isWeight ? roundToStep(clamped, safeStep) : Math.round(clamped / safeStep) * safeStep;
  const out = Math.max(safeMin, stepped);
  return Number(out.toFixed(isWeight ? 3 : 0));
}

export type OnlineOptionLite = {
  id: string;
  type: "exact" | "bulk";
  label: string;
  unit_price: number;
  qty?: number | null; // exact
  min_qty?: number | null; // bulk
  max_qty?: number | null; // bulk
};

export type OnlineConfigLite = {
  unit: string;
  is_weight: boolean;
  min: number;
  step: number;
  options: OnlineOptionLite[];
};

export function defaultRulesFor(p: any) {
  const isW = !!p?.is_weight;
  return {
    unit: isW ? "kg" : "pcs",
    min: Number(p?.min_order_qty ?? (isW ? 0.5 : 1)) || (isW ? 0.5 : 1),
    step: Number(p?.qty_step ?? (isW ? 0.5 : 1)) || (isW ? 0.5 : 1),
    is_weight: isW,
  };
}

export function normalizeConfigLite(raw: any, p: any): OnlineConfigLite {
  const base = defaultRulesFor(p);
  const unit = String(raw?.unit || base.unit);
  const is_weight = !!(raw?.is_weight ?? base.is_weight);

  const minRaw = parseNum(raw?.min);
  const stepRaw = parseNum(raw?.step);

  const min = Number.isFinite(minRaw) && minRaw > 0 ? minRaw : base.min;
  const step = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : base.step;

  const optsRaw = Array.isArray(raw?.options) ? raw.options : [];
  const options: OnlineOptionLite[] = optsRaw
    .map((o: any) => {
      const type = o?.type;
      const label = String(o?.label ?? "").trim();
      if ((type !== "exact" && type !== "bulk") || !label) return null;

      const up = parseNum(o?.unit_price);
      if (!Number.isFinite(up) || up < 0) return null;

      if (type === "exact") {
        const q = parseNum(o?.qty);
        if (!Number.isFinite(q) || q <= 0) return null;
        return { id: String(o?.id || `${label}_${q}`), type: "exact", label, qty: q, unit_price: up };
      }

      const minq = parseNum(o?.min_qty);
      const maxq = o?.max_qty == null || String(o?.max_qty).trim() === "" ? null : parseNum(o?.max_qty);

      if (!Number.isFinite(minq) || minq < 0) return null;
      if (maxq != null && (!Number.isFinite(maxq) || maxq < minq)) return null;

      return {
        id: String(o?.id || `${label}_${minq}`),
        type: "bulk",
        label,
        min_qty: minq,
        max_qty: maxq ?? null,
        unit_price: up,
      };
    })
    .filter(Boolean) as OnlineOptionLite[];

  const exact = options.filter((o) => o.type === "exact").sort((a, b) => Number(a.qty ?? 0) - Number(b.qty ?? 0));
  const bulk = options.filter((o) => o.type === "bulk").sort((a, b) => Number(a.min_qty ?? 0) - Number(b.min_qty ?? 0));

  return { unit, is_weight, min, step, options: [...exact, ...bulk] };
}

export function pickUnitPriceLite(cfg: OnlineConfigLite, basePrice: number, qty: number): number {
  const q2 = Number(qty.toFixed(3));

  const exact = cfg.options.find(
    (o: any) => o.type === "exact" && Number(((o as any).qty ?? 0).toFixed(3)) === q2
  ) as any;
  if (exact) return Number(exact.unit_price) || 0;

  const bulk = (cfg.options as any[])
    .filter((o) => o.type === "bulk" && Number(o.min_qty ?? 0) <= qty && (o.max_qty == null || qty <= Number(o.max_qty)))
    .sort((a, b) => Number(b.min_qty ?? 0) - Number(a.min_qty ?? 0))[0];

  if (bulk) return Number(bulk.unit_price) || 0;

  return Number(basePrice) || 0;
}

export function fmtQty(qty: number, unit: string, isWeight: boolean) {
  if (!isWeight) return `${Math.round(qty)} ${unit}`;
  if (qty > 0 && qty < 1) return `${Math.round(qty * 1000)} g`;
  return `${Number(qty.toFixed(2))} ${unit}`;
}

export function getLabel(obj: any, lang: "so" | "en") {
  const so = obj?.name_so ?? obj?.name ?? obj?.slug ?? "";
  const en = obj?.name_en ?? obj?.name ?? obj?.slug ?? "";
  return lang === "en" ? en : so;
}

export function prettyTitleFromSlug(input: any) {
  let s = String(input ?? "").trim();
  if (!s) return "";

  try {
    s = decodeURIComponent(s);
  } catch {}

  if (s.includes("/")) {
    const last = s.split("/").filter(Boolean).pop();
    if (last) s = last;
  }

  s = s.replace(/[_+]/g, " ").replace(/-+/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  s = s
    .split(" ")
    .map((w) => {
      if (!w) return "";
      if (/^\d/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");

  return s;
}

export function pctOff(oldTotal: number, newTotal: number) {
  if (!(oldTotal > 0) || !(newTotal >= 0)) return 0;
  const p = Math.round(((oldTotal - newTotal) / oldTotal) * 100);
  return Number.isFinite(p) ? Math.max(0, p) : 0;
}
