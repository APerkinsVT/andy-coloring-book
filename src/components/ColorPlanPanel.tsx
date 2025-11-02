// src/components/ColorPlanPanel.tsx
import React from "react";
import type { ColorPlan, ColorCluster } from "@/types/color-plan";
import { KitSize } from "@/types/color-plan";

/** Props:
 *  - plan: ColorPlan produced by analysis
 *  - defaultKitSize: starting kit (12/24/36/72/120)
 *  - showConfidence: shows OK/Good/Stretch badge based on ΔE
 */
type Props = {
  plan: ColorPlan;
  defaultKitSize: KitSize;
  showConfidence?: boolean;
};

type Row = {
  idx: number;
  hex?: string;
  fcNo?: string;
  name?: string;
  coveragePct?: number;
  deltaE?: number;
};

export default function ColorPlanPanel({
  plan,
  defaultKitSize,
  showConfidence = true,
}: Props) {
  const [kit, setKit] = React.useState<KitSize>(defaultKitSize);

  // Build rows using the same selection rules we use for printing,
  // then de-dupe identical pencils for a cleaner list.
  const rows = React.useMemo<Row[]>(() => {
    const clusterById = new Map<number, ColorCluster>();
    for (const c of plan.clusters) clusterById.set(c.id, c);

    const priorityIds = plan.priorityOrder?.length
      ? plan.priorityOrder
      : plan.clusters.map((c) => c.id);

    const visible: ColorCluster[] = [];
    for (const id of priorityIds) {
      const c = clusterById.get(id);
      if (!c) continue;
      visible.push(c);
      if (visible.length >= Number(kit)) break;
    }

    const raw: Row[] = visible.map((c, i) => {
      const matchesByKit = (c as any).matchesByKit as
        | Record<
            string | number,
            {
              fcId?: number;
              fcNo?: number;
              name?: string;
              label?: string;
              pencilName?: string;
              hex?: string;
              deltaE00?: number;
            }
          >
        | undefined;

      const m = (matchesByKit?.[kit] ?? matchesByKit?.[String(kit)] ?? c.matched) as any;

      const hex = m?.hex || (c as any).sampleHex || "#FFFFFF";
      const fcNo =
        m?.fcId != null ? String(m.fcId) :
        m?.fcNo != null ? String(m.fcNo) : "";
      const name =
        (typeof m?.name === "string" && m.name) ||
        (typeof m?.label === "string" && m.label) ||
        (typeof m?.pencilName === "string" && m.pencilName) ||
        (typeof (c as any)?.name === "string" && (c as any).name) ||
        "";

      const coveragePct = (c.coverage ?? 0) * 100;
      const deltaE = typeof m?.deltaE00 === "number" ? m.deltaE00 : undefined;

      return { idx: i + 1, hex, fcNo, name, coveragePct, deltaE };
    });

    return dedupeRows(raw);
  }, [plan, kit]);

  const paletteNote = `Palette: ${plan.paletteMeta.set} · ${plan.paletteMeta.count} swatches · v${plan.paletteMeta.version}`;
  const qa = summarizeQA(rows);

  return (
    <div className="rounded-xl bg-white border shadow-sm">
      <div className="p-3 border-b flex items-center justify-between">
        <h3 className="text-base font-semibold">Color Plan</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="kit" className="text-xs text-slate-600">Kit</label>
          <select
            id="kit"
            value={Number(kit)}
            onChange={(e) => setKit(Number(e.target.value) as KitSize)}
            className="text-sm border rounded-md px-2 py-1"
          >
            <option value={12}>12 pencils</option>
            <option value={24}>24 pencils</option>
            <option value={36}>36 pencils</option>
            <option value={72}>72 pencils</option>
            <option value={120}>120 pencils</option>
          </select>
        </div>
      </div>

      <div className="p-3">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-600">
            <tr className="border-b">
              <th className="w-8 text-left py-1">#</th>
              <th className="w-10 text-left py-1">Swatch</th>
              <th className="w-16 text-left py-1">FC No.</th>
              <th className="text-left py-1">Name</th>
              <th className="w-20 text-right py-1">Coverage</th>
              <th className="w-14 text-right py-1">ΔE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.idx}-${r.fcNo}-${r.name}`} className="border-b last:border-0">
                <td className="py-1">{r.idx}</td>
                <td className="py-1">
                  <span
                    className="inline-block w-5 h-5 rounded border"
                    style={{ backgroundColor: r.hex || "#fff" }}
                    title={r.hex}
                  />
                </td>
                <td className="py-1">{r.fcNo || ""}</td>
                <td className="py-1">
                  <div className="flex items-center gap-2">
                    <span>{r.name || ""}</span>
                    {showConfidence && (
                      <Badge deltaE={r.deltaE} />
                    )}
                  </div>
                </td>
                <td className="py-1 text-right">
                  {r.coveragePct != null ? `${r.coveragePct.toFixed(2)}%` : ""}
                </td>
                <td className="py-1 text-right">
                  {r.deltaE != null ? r.deltaE.toFixed(1) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 text-[11px] text-slate-600">
          <div>{paletteNote}</div>
          <div>
            QA · Kit {Number(kit)} — Avg ΔE (area-weighted): {qa.avg.toFixed(1)} · Worst: {qa.worst.toFixed(1)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function Badge({ deltaE }: { deltaE?: number }) {
  if (deltaE == null) return null;
  let label = "OK";
  let cls = "bg-amber-100 text-amber-800";
  if (deltaE <= 5) { label = "Good"; cls = "bg-emerald-100 text-emerald-800"; }
  else if (deltaE >= 10) { label = "Stretch"; cls = "bg-rose-100 text-rose-800"; }
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] ${cls}`}>{label}</span>
  );
}

function summarizeQA(rows: Row[]) {
  let avg = 0, worst = 0, wsum = 0;
  for (const r of rows) {
    const w = (r.coveragePct ?? 0) / 100;
    const d = r.deltaE ?? 0;
    avg += w * d;
    wsum += w;
    worst = Math.max(worst, d);
  }
  avg = wsum > 0 ? avg / wsum : 0;
  return { avg, worst };
}

/** Merge rows that map to the same FC pencil (preferred by fcNo).
 *  If fcNo missing, fall back to hex+name identity.
 *  Coverage is summed; ΔE becomes area-weighted average.
 *  Order is preserved by first appearance.
 */
function dedupeRows(rows: Row[]): Row[] {
  const out: Row[] = [];
  const where = new Map<string, number>();

  for (const r of rows) {
    const key = r.fcNo && r.fcNo.trim()
      ? `fc:${r.fcNo.trim()}`
      : `hex:${(r.hex || "").toLowerCase()}|name:${(r.name || "").toLowerCase()}`;

    const j = where.get(key);
    if (j == null) {
      where.set(key, out.length);
      out.push({ ...r });
    } else {
      const t = out[j];
      const cov1 = t.coveragePct ?? 0;
      const cov2 = r.coveragePct ?? 0;
      const w1 = cov1 / 100;
      const w2 = cov2 / 100;
      const d1 = t.deltaE ?? 0;
      const d2 = r.deltaE ?? 0;

      t.coveragePct = cov1 + cov2;

      const wSum = w1 + w2;
      t.deltaE = wSum > 0 ? (w1 * d1 + w2 * d2) / wSum : t.deltaE;
      // keep first name/hex/fcNo for stability
    }
  }

  out.forEach((r, i) => { r.idx = i + 1; });
  return out;
}
