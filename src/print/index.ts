// src/print/index.ts
// Print via hidden iframe (no popup).
// Normal: 3 pages -> (1) Line art  (2) Reference + Color Plan  (3) Tips
// If table is long, auto-switch to 4 pages -> (3) Color Plan only  (4) Tips

export type PrintableRow = {
  idx: number;
  hex?: string;
  fcNo?: string;
  name?: string;
  coveragePct?: number;
  deltaE?: number;
};

export type PrintableColorPlan = {
  kitLabel: string;            // e.g., "72 pencils"
  rows: PrintableRow[];
  paletteNote?: string;        // footer left
  metricsNote?: string;        // footer right
};

export type Tip = {
  id: string;
  rowIdx: number;              // matches Color Plan row number
  fcNo?: string;
  name?: string;
  hex?: string;
  text: string;
};

type OpenPrintViewParams = {
  lineArtDataUrl: string;                      // REQUIRED
  originalDataUrl?: string;                    // small ref image
  fileName?: string;                           // title on page 1
  orientation?: "portrait" | "landscape";      // all pages same
  colorPlan?: PrintableColorPlan;              // table
  tips?: Tip[];                                // tips
};

export function openPrintView({
  lineArtDataUrl,
  originalDataUrl,
  fileName,
  orientation = "portrait",
  colorPlan,
  tips = [],
}: OpenPrintViewParams) {
  const EXISTING_ID = "akp-print-iframe";
  const old = document.getElementById(EXISTING_ID);
  if (old && old.parentElement) old.parentElement.removeChild(old);

  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0",
    width: "0", height: "0", border: "0", opacity: "0",
  } as CSSStyleDeclaration);
  iframe.id = EXISTING_ID;
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const safeTitle = (fileName || "New Color Chart")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const headerTitle = safeTitle || "New Color Chart";
  const dateStr = new Date().toLocaleString();

  const rows = colorPlan?.rows ?? [];
  const rowCount = rows.length;

  // Portrait can show ≈18 rows under the photo, Landscape ≈26.
  const maxRows = orientation === "landscape" ? 26 : 18;
  const needTableOnlyPage = true; // MVP: always give the table its own page

  const tableRowsHtml = rows
    .map((r) => {
      const sw = r.hex
        ? `<span class="sw" style="background:${r.hex}"></span>`
        : `<span class="sw sw-empty"></span>`;
      const name = escapeHtml(r.name || "");
      const fc = escapeHtml(r.fcNo || "");
      const cov = r.coveragePct != null ? `${r.coveragePct.toFixed(2)}%` : "";
      const de = r.deltaE != null ? r.deltaE.toFixed(1) : "";
      return `
        <tr>
          <td class="col-idx">${r.idx}</td>
          <td class="col-color">${sw}<span class="name">${name}</span></td>
          <td class="col-fc">${fc}</td>
          <td class="col-cov">${cov}</td>
          <td class="col-de">${de}</td>
        </tr>`;
    })
    .join("");

  const tipsHtml = (tips || [])
    .map((t) => {
      const sw = t.hex
        ? `<span class="tip-swatch" style="background:${t.hex}"></span>`
        : `<span class="tip-swatch tip-swatch-empty"></span>`;
      const nm = escapeHtml(t.name || "Pencil");
      const no = t.fcNo ? ` <span class="muted">(${escapeHtml(t.fcNo)})</span>` : "";
      const idx = `<span class="tag">#${t.rowIdx}</span>`;
      return `<div class="tip">
        <div class="tip-head">${idx}${sw}<span class="tip-name">${nm}${no}</span></div>
        <div class="tip-body">${escapeHtml(t.text)}</div>
      </div>`;
    })
    .join("");

  const page1 = `
  <!-- PAGE 1: Line Art -->
  <section class="page">
    <div class="header">
      <div>
        <div class="muted">${escapeHtml(dateStr)}</div>
        <h1>${escapeHtml(headerTitle)}</h1>
      </div>
      <div class="right muted">New Color Chart</div>
    </div>

    <div class="lineart">
      <img id="img-lineart" src="${lineArtDataUrl}" alt="Line art"/>
    </div>

    <div class="footer">
      <div class="muted">localhost:3000</div>
      <div class="muted"></div>
    </div>
  </section>`;

  const page2_ref_only = `
  <!-- PAGE 2: Reference (small) -->
  <section class="page">
    <div class="header">
      <div class="muted">${escapeHtml(dateStr)}</div>
      <div class="right muted">New Color Chart</div>
    </div>

    <figure class="refimg">
      ${originalDataUrl ? `<img id="img-original" src="${originalDataUrl}" alt="Reference"/>` : `<div class="muted">No reference image</div>`}
    </figure>

    <div class="footer">
      <div class="muted"></div>
      <div class="muted"></div>
    </div>
  </section>`;

  const page2_ref_plus_table = `
  <!-- PAGE 2: Reference (small) + Color Plan -->
  <section class="page">
    <div class="header">
      <div class="muted">${escapeHtml(dateStr)}</div>
      <div class="right muted">New Color Chart</div>
    </div>

    <figure class="refimg">
      ${originalDataUrl ? `<img id="img-original" src="${originalDataUrl}" alt="Reference"/>` : `<div class="muted">No reference image</div>`}
    </figure>

    <table class="plan">
      <caption>Color Plan — ${escapeHtml(colorPlan?.kitLabel || "")}</caption>
      <thead>
        <tr>
          <th class="col-idx">#</th>
          <th class="col-color">Color</th>
          <th class="col-fc">FC No.</th>
          <th class="col-cov">Coverage</th>
          <th class="col-de">ΔE</th>
        </tr>
      </thead>
      <tbody>${tableRowsHtml}</tbody>
    </table>

    <div class="footer">
      <div>${escapeHtml(colorPlan?.paletteNote || "")}</div>
      <div>${escapeHtml(colorPlan?.metricsNote || "")}</div>
    </div>
  </section>`;

  const page3_table_only = `
  <!-- PAGE 3: Color Plan only -->
  <section class="page">
    <div class="header">
      <div class="muted">${escapeHtml(dateStr)}</div>
      <div class="right muted">New Color Chart</div>
    </div>

    <table class="plan">
      <caption>Color Plan — ${escapeHtml(colorPlan?.kitLabel || "")}</caption>
      <thead>
        <tr>
          <th class="col-idx">#</th>
          <th class="col-color">Color</th>
          <th class="col-fc">FC No.</th>
          <th class="col-cov">Coverage</th>
          <th class="col-de">ΔE</th>
        </tr>
      </thead>
      <tbody>${tableRowsHtml}</tbody>
    </table>

    <div class="footer">
      <div>${escapeHtml(colorPlan?.paletteNote || "")}</div>
      <div>${escapeHtml(colorPlan?.metricsNote || "")}</div>
    </div>
  </section>`;

  const tipsPage = `
  <!-- TIPS PAGE -->
  <section class="page">
    <div class="header">
      <div class="muted">${escapeHtml(dateStr)}</div>
      <div class="right muted">New Color Chart</div>
    </div>

    <div class="tips">
      <h3>General Coloring Tips</h3>
      <ol>
        <li>Start with light pressure. Build color slowly so you can adjust as you go.</li>
        <li>Block in large shapes first, then add smaller details on top.</li>
        <li>For shading, layer the local color first, then add a darker pencil lightly in the shadow areas.</li>
        <li>Keep pencils sharp for edges; use a slightly rounded tip to fill larger areas smoothly.</li>
        <li>Blend by layering: two or three light passes beat one heavy pass.</li>
        <li>Leave tiny paper-white gaps for bright highlights—don’t try to erase them later.</li>
      </ol>

      <div class="spacer"></div>
      ${tipsHtml ? `<h3>Specific Suggestions for Your Line Art</h3>${tipsHtml}` : ``}
    </div>

    <div class="footer">
      <div class="muted">localhost:3000</div>
      <div class="muted"></div>
    </div>
  </section>`;

  const pagesHtml = needTableOnlyPage
    ? [page1, page2_ref_only, page3_table_only, tipsPage].join("\n")
    : [page1, page2_ref_plus_table, tipsPage].join("\n");

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(headerTitle)} — New Color Chart</title>
  <style>
    :root { --fg:#0f172a; --muted:#64748b; --line:#e2e8f0; }
    @page { size: ${orientation}; margin: 18mm; }
    * { box-sizing: border-box; }
    html, body { background:#fff; color:var(--fg); font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"; }
    h1,h2,h3 { margin:0 0 6px 0; }
    .muted { color: var(--muted); }

    .page { page-break-after: always; }
    .page:last-of-type { page-break-after: auto; }

    .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8mm; }
    .header .right { text-align:right; color:var(--muted); font-size:11px; }
    .footer { display:flex; justify-content:space-between; color:var(--muted); font-size:11px; margin-top:6mm; }

    .lineart { width:100%; border:1px solid var(--line); border-radius:6px; overflow:hidden; }
    .lineart img { display:block; width:100%; height:auto; }

    .refimg { border:1px solid var(--line); border-radius:6px; padding:4px; margin-bottom:8mm; display:flex; justify-content:center; break-inside: avoid; }
    .refimg img { height:60mm; width:auto; display:block; border-radius:4px; }

    table { width:100%; border-collapse:collapse; }
    thead { display: table-header-group; }   /* repeat header when table breaks */
    caption {
      caption-side: top;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      padding: 0 4px 6px 4px;
    }
    table.plan { width:100%; border-collapse: collapse; }
    tfoot { display: table-footer-group; }   /* not used, helps engines keep footer logic */
    thead th { text-align:left; font-weight:600; font-size:12px; border-bottom:1px solid var(--line); padding:6px 4px; }
    tbody td { padding:6px 4px; border-bottom:1px solid var(--line); vertical-align:middle; }

    /* Let the TABLE itself break; just keep individual rows/cells together */
    tr, td, th { page-break-inside: avoid; break-inside: avoid; }

    /* column widths unchanged */
    .col-idx { width:6mm; text-align:right; }
    .col-color .sw { display:inline-block; width:14px; height:14px; border:1px solid var(--line); border-radius:3px; margin-right:6px; vertical-align:-3px; }
    .col-fc { width:18mm; }
    .col-cov { width:22mm; text-align:right; }
    .col-de  { width:16mm; text-align:right; }
    .name { white-space:nowrap; }


    .tips h3 { margin:0 0 6px 0; }
    .tips ol { margin:0 8px 10px 18px; }
    .spacer { height:4mm; }
    .tip { border:1px solid var(--line); border-radius:6px; padding:6px; margin:0 0 6px 0; break-inside: avoid; }
    .tip-head { display:flex; align-items:center; gap:6px; margin-bottom:4px; }
    .tip-swatch { display:inline-block; width:12px; height:12px; border:1px solid var(--line); border-radius:2px; }
    .tag { display:inline-block; font-size:10px; border:1px solid var(--line); padding:1px 4px; border-radius:4px; }
  </style>
</head>
<body>

${pagesHtml}

<script>
  (function () {
    function waitForImages() {
      var imgs = Array.from(document.images || []);
      return Promise.all(imgs.map(function(img){
        if (img.complete) return Promise.resolve();
        return new Promise(function(resolve){
          img.addEventListener('load', resolve, {once:true});
          img.addEventListener('error', resolve, {once:true});
        });
      }));
    }
    var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    Promise.all([fontsReady, waitForImages()]).then(function(){
      setTimeout(function(){
        window.focus();
        window.print();
      }, 100);
    });
  })();
</script>

</body>
</html>`;

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); alert("Unable to open print view."); return; }
  doc.open(); doc.write(html); doc.close();

  const done = () => { setTimeout(() => iframe.remove(), 1000); window.removeEventListener("focus", done); };
  window.addEventListener("focus", done);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
