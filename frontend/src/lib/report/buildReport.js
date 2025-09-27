// Client-only PDF generation using pdfkit + blob-stream
// npm i pdfkit blob-stream
import blobStream from "blob-stream";
// pdfkit auto-resolves to the browser build under most bundlers
import PDFDocument from "pdfkit";
import { groupRows, rollup } from "./groupAndRollup";
import { projectRow, centsToLKR } from "./formatters";
import { makeReportFilename } from "./filename";

function mm(n) { return (n / 25.4) * 72; } // millimeters to points
const PAGE_SIZES = { A4: [595.28, 841.89], Letter: [612, 792] };

export async function buildAndDownloadPDF({ rows, config, filters, brand }) {
  const pageSize = PAGE_SIZES[config.layout.pageSize] || PAGE_SIZES.A4;
  const landscape = config.layout.orientation === "landscape";
  const size = landscape ? [pageSize[1], pageSize[0]] : pageSize;

  const doc = new PDFDocument({ size, margin: mm(15) }); // 15mm margins
  const stream = doc.pipe(blobStream());

  const title = config.title || brand?.title || "Report";
  const subtitle = config.subtitle || buildFilterSubtitle(filters);
  const theme = config.theme || "light";
  const zebra = !!config.layout.zebra;
  const density = config.layout.density || "dense";

  // Header
  doc.fontSize(16).text(title, { align: "left" });
  if (subtitle) doc.fontSize(10).fillColor("#666").text(subtitle).fillColor("#000");
  doc.moveDown(0.5);

  // KPIs
  if (config.metrics?.sum || config.metrics?.count || config.metrics?.avg) {
    const r = rollup(rows);
    const items = [];
    if (config.metrics.sum) items.push(`Total: LKR ${centsToLKR(r.sumCents)}`);
    if (config.metrics.count) items.push(`Items: ${r.count}`);
    if (config.metrics.avg) items.push(`Average: LKR ${centsToLKR(r.avgCents)}`);
    doc.fontSize(11).text(items.join("   •   "));
    doc.moveDown(0.5);
  }

  // Grouping
  const groups = groupRows(rows, config.grouping?.by || "none");

  // Table
  const cols = config.columns.filter(c => c.enabled);
  drawTable(doc, groups, cols, { zebra, density, subtotal: !!config.grouping?.subtotal });

  // Footer watermark
  if (config.watermark) {
    doc.save().opacity(0.08).fontSize(80).rotate(-30, { origin: [200, 300] }).text(config.watermark, 80, 300);
    doc.restore();
  }

  doc.end();
  const blob = await new Promise(res => stream.on("finish", () => res(stream.toBlob("application/pdf"))));

  const filename = makeReportFilename(title.replace(/\s+/g, ""), filters);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function buildFilterSubtitle(filters) {
  if (!filters) return "";
  const parts = [];
  if (filters.accountName) parts.push(`Account: ${filters.accountName}`);
  if (filters.status) parts.push(`Status: ${filters.status}`);
  if (filters.from || filters.to) parts.push(`Range: ${filters.from || "…"} → ${filters.to || "…"}`);
  if (filters.q) parts.push(`Search: "${filters.q}"`);
  return parts.join("   |   ");
}

function drawTable(doc, groups, cols, { zebra, density, subtotal }) {
  const lineH = density === "roomy" ? 22 : 16;
  const startX = doc.page.margins.left;
  let y = doc.y + 6;

  const colWidths = calcColWidths(cols, doc.page.width - doc.page.margins.left - doc.page.margins.right);

  for (const g of groups) {
    if (g.key !== "_all") {
      y = ensurePageSpace(doc, y, lineH * 3);
      doc.fontSize(12).text(String(g.key), startX, y); y += lineH;
    }
    // Header
    y = ensurePageSpace(doc, y, lineH * 2);
    drawHeaderRow(doc, cols, startX, y, colWidths); y += lineH;

    // Rows
    let i = 0;
    for (const r of g.rows) {
      const projected = projectRow(r, cols);
      const isZebra = zebra && (i % 2 === 1);
      y = ensurePageSpace(doc, y, lineH * 2, () => {
        // repeat header on new page
        if (g.key !== "_all") { doc.fontSize(12).text(String(g.key), startX, doc.y); y = doc.y + lineH; }
        drawHeaderRow(doc, cols, startX, y, colWidths); y += lineH;
      });
      if (isZebra) {
        doc.save().rect(startX - 2, y - 2, doc.page.width - startX - doc.page.margins.right + 2, lineH).fill("#f3f3f3").restore();
      }
      drawDataRow(doc, projected, cols, startX, y, colWidths);
      y += lineH;
      i++;
    }

    if (subtotal) {
      const rr = rollup(g.rows);
      y = ensurePageSpace(doc, y, lineH * 2);
      doc.fontSize(11).text("Subtotal:", startX, y);
      const lastIdx = cols.findIndex(c => c.key === "amountCents");
      if (lastIdx >= 0) {
        const x = startX + colWidths.slice(0, lastIdx).reduce((a, b) => a + b, 0);
        doc.text(`LKR ${centsToLKR(rr.sumCents)}`, x + 4, y, { width: colWidths[lastIdx], align: "right" });
      }
      y += lineH;
    }

    y += 6; // spacing after group
  }
}

function calcColWidths(cols, totalWidth) {
  // Simple proportional widths based on typical content
  const weights = cols.map(c => {
    if (c.key === "amountCents") return 1.1;
    if (c.key === "name") return 1.4;
    if (c.key === "note") return 1.6;
    return 1.0;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => Math.floor((w / sum) * totalWidth));
}

function drawHeaderRow(doc, cols, x, y, widths) {
  doc.save();
  doc.fontSize(10).fillColor("#111");
  cols.forEach((c, i) => {
    const label = c.label || c.key;
    doc.text(label, x, y, { width: widths[i], continued: i < cols.length - 1 });
    x += widths[i];
  });
  doc.fillColor("#000").restore();
}

function drawDataRow(doc, projected, cols, x, y, widths) {
  doc.fontSize(10).fillColor("#000");
  cols.forEach((c, i) => {
    const label = c.label || c.key;
    let val = projected[label];
    const align = c.key === "amountCents" ? "right" : "left";
    doc.text(val ?? "", x + 4, y, { width: widths[i] - 8, align, continued: i < cols.length - 1 });
    x += widths[i];
  });
}
