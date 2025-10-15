// src/pages/EventsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Target,
  PiggyBank,
  ShoppingCart,
  Undo2,
  Pencil,
  Trash2,
  PlusCircle,
  MinusCircle,
  Download,
  Plus,
  RefreshCw,
  FileText
} from "lucide-react";
import api from "../api/api.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ===================== API wrappers ===================== */
const Accounts = {
  list: () => api.get("accounts", { params: { includeArchived: "false" } }).then((r) => r.data),
};

const Events = {
  list: () => api.get("events").then((r) => r.data),
  create: (b) => api.post("events", b).then((r) => r.data),
  update: (id, b) => api.put(`events/${id}`, b).then((r) => r.data),
  remove: (id) => api.delete(`events/${id}`).then((r) => r.data),
  fund: (id, b) => api.post(`events/${id}/fund`, b).then((r) => r.data),
  defund: (id, b) => api.post(`events/${id}/defund`, b).then((r) => r.data),
  spend: (id, b) => api.post(`events/${id}/spend`, b).then((r) => r.data),
};

const Budget = {
  getPlan: (period) =>
    api
      .get(`budget/plans/${period}`)
      .then((r) => r.data)
      .catch((e) => {
        if (e?.response?.status === 404) return null;
        throw e;
      }),
};

/* ===================== helpers ===================== */
const toCents = (n) => Math.round(Number(n || 0) * 100);
const fromCents = (c) => (Number(c || 0) / 100).toFixed(2);
const ymd = (x) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const currency = (cents, cur = "LKR") =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: cur }).format((cents || 0) / 100);

const ymLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const thisPeriod = () => ymLocal(new Date());

const normalizeDate = (val) => {
  if (!val) return null;
  if (val?.$date) return new Date(val.$date); // Mongo extended JSON
  return new Date(val); // ISO string or Date
};

const inPeriodLocal = (dt, period) => {
  const d = normalizeDate(dt);
  return d instanceof Date && !isNaN(d) && ymLocal(d) === period;
};

/* ===================== small UI bits ===================== */
function Field({ label, required, children, hint }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </label>
  );
}

function Modal({ open, onClose, title, children, max = "max-w-2xl" }) {
  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* Black overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal panel */}
      <div
        className={`relative bg-white rounded-2xl w-full ${max} shadow-xl border border-slate-200 max-h-[85vh] overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (fixed inside the panel) */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 text-xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Scrollable content area */}
        <div
          className="p-5 overflow-y-auto"
          style={{ WebkitOverflowScrolling: "touch" }} // smooth momentum scrolling on iOS
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ===================== MONEY HELPERS ===================== */
const rupeesFrom = (cents) => (cents || 0) / 100;
const fmtLKR = (n) => `LKR ${Number(n || 0).toLocaleString("en-LK", { minimumFractionDigits: 2 })}`;

/* ===================== IMAGE HELPER ===================== */
async function loadImageDataURL(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function makeReportFilename(prefix, ts = new Date()) {
  return `${prefix}_${ts.toISOString().replace(/[:T]/g, "-").slice(0, 15)}.pdf`;
}

// ===================== Event Expenses PDF (Indigo brand theme) =====================
async function generateEventExpensesReportPDF({
  rows,
  filters,
  period,
  logoUrl = "/reportLogo.png",
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  // ---- layout & palette (matches Commitments screenshot) ----
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const brand = { r: 79, g: 70, b: 229 };        // indigo-600 (purple lines)
  const brandLight = { r: 241, g: 245, b: 255 }; // indigo-50 (filter panel)
  const slateTxt = 40;
  const TOTAL_PAGES_TOKEN = "{total_pages_count_string}";

  // helpers
  const fmtLKR = (n) =>
    (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moneyRs = (centsOrRs, isCents = true) => {
    const rupees = isCents ? (Number(centsOrRs) || 0) / 100 : Number(centsOrRs) || 0;
    return `LKR ${fmtLKR(rupees)}`;
  };
  const fmtDate = (dStr) => (dStr ? new Date(dStr).toLocaleDateString() : "—");
  const humanDateTime = new Date().toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const buildFilenameLocal = (prefix, data) => {
    const d = new Date();
    const parts = [prefix || "Report"];
    if (data?.period) parts.push(String(data.period).replace(/\s+/g, ""));
    if (data?.from) parts.push(String(data.from).slice(0, 10));
    if (data?.to) parts.push(String(data.to).slice(0, 10));
    parts.push(d.toISOString().replace(/[:T]/g, "-").slice(0, 15));
    return parts.filter(Boolean).join("_") + ".pdf";
  };

  // Track if we've drawn the initial footer
  let initialFooterDrawn = false;

  // footer (Generated left, Page x of y right)
  const drawFooter = () => {
    // Only draw footer once per page
    if (initialFooterDrawn) return;
    
    doc.setDrawColor(235).setLineWidth(1);
    doc.line(margin, pageH - 40, pageW - margin, pageH - 40);

    doc.setFontSize(9).setTextColor(120);
    doc.text(`Generated: ${humanDateTime}`, margin, pageH - 22);

    const pageStr = `Page ${doc.internal.getNumberOfPages()} of ${TOTAL_PAGES_TOKEN}`;
    const pageX = pageW - margin - 60;
    doc.text(pageStr, pageX, pageH - 22, { align: "right" });

    doc.setTextColor(slateTxt);
    initialFooterDrawn = true;
  };

  // Reset footer flag for new pages
  const resetFooterFlag = () => {
    initialFooterDrawn = false;
  };

  // ---- header (logo + brand + INDIGO separator) ----
  const logoSize = 46;
  const headerY = margin;

  try {
    const logoData =
      (typeof loadImageDataURL === "function") ? await loadImageDataURL(logoUrl) : null;
    if (logoData) {
      try { doc.addImage(logoData, "PNG", margin, headerY, logoSize, logoSize); } catch {}
    }
  } catch {}

  const headerTextX = margin + logoSize + 12;
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(slateTxt);
  doc.text("My Budget Pal", headerTextX, headerY + 30);

  const sepY = headerY + logoSize + 12;
  doc.setDrawColor(brand.r, brand.g, brand.b).setLineWidth(2); // purple line
  doc.line(margin, sepY, pageW - margin, sepY);

  // centered title
  const titleY = sepY + 28;
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(slateTxt);
  doc.text("Event Expenses Report", pageW / 2, titleY, { align: "center" });

  // ---- soft filter panel (indigo-50) ----
  const rangeLabel =
    (filters?.from || filters?.to) ? `${fmtDate(filters?.from)} – ${fmtDate(filters?.to)}` : "… – …";
  const modeLabel = filters?.mode ? (filters.mode === "single" ? "Single" : "Itemized") : "All";
  const dateFieldLabel = filters?.dateField === "due" ? "Due Date" : "Created Date";

  const filterLines = [
    `Period : ${period || "—"}`,
    `Range  : ${rangeLabel}`,
    `Mode   : ${modeLabel}`,
    `Date field : ${dateFieldLabel}`,
  ];

  const boxX = margin;
  const boxY = titleY + 20;
  const lineH = 14;
  const boxH = (filterLines.length || 1) * lineH + 16;
  const boxW = pageW - margin * 2;

  doc.setDrawColor(230).setFillColor(brandLight.r, brandLight.g, brandLight.b);
  doc.roundedRect(boxX, boxY, boxW, boxH, 6, 6, "F");

  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(100);
  let fy = boxY + 12;
  filterLines.forEach((line) => { doc.text(line, boxX + 10, fy + 10); fy += lineH; });
  doc.setTextColor(slateTxt);

  // watermark (left)
  doc.setFontSize(10).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
  doc.setTextColor(slateTxt);

  // Draw initial footer
  drawFooter();

  // ---- tables (purple headers) ----
  let cursorY = boxY + boxH + 22;

  const singles = (rows || []).filter((e) => e.mode === "single");
  const itemized = (rows || []).filter((e) => e.mode === "itemized");

  let singleTotalC = 0;
  let itemizedGrandC = 0;

  const ensureSpace = (needed = 140) => {
    if (cursorY + needed > pageH - margin) {
      doc.addPage();
      resetFooterFlag(); // Reset flag for new page
      // re-watermark only
      doc.setFontSize(10).setTextColor(120);
      doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
      doc.setTextColor(slateTxt);
      cursorY = margin;
      // Draw footer on new page
      drawFooter();
    }
  };

  const tableCommon = {
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 9,
      cellPadding: 4,
      lineColor: [230, 230, 230],
      lineWidth: 0.5,
      textColor: [40, 40, 40],
      valign: "middle",
    },
    headStyles: {
      fillColor: [brand.r, brand.g, brand.b],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: { fillColor: [247, 248, 250] },
    // REMOVED didDrawPage callback to prevent duplicate footer drawing
  };

  // --- Single Item Events table ---
  if (singles.length) {
    ensureSpace(100);
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(slateTxt);
    doc.text("Single Item Events", margin, cursorY);
    cursorY += 10;

    const head = [["Title", "Due Date", "Start Date", "End Date", "Amount (LKR)"]];
    const body = singles.map((e) => {
      singleTotalC += e.targetCents || 0;
      return [
        e.title || "—",
        fmtDate(e?.dates?.due),
        fmtDate(e?.dates?.start),
        fmtDate(e?.dates?.end),
        moneyRs(e.targetCents || 0, true),
      ];
    });

    autoTable(doc, {
      ...tableCommon,
      startY: cursorY + 6,
      head,
      body,
      columnStyles: { 4: { halign: "right" } },
    });
    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 14;

    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(slateTxt);
    doc.text(`Subtotal (Single) : ${moneyRs(singleTotalC, true)}`, margin, cursorY);
    cursorY += 24;
  }

  // --- Itemized Events (multiple subtables) ---
  if (itemized.length) {
    ensureSpace(100);
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(slateTxt);
    doc.text("Itemized Events", margin, cursorY);
    cursorY += 8;

    itemized.forEach((e, idx) => {
      ensureSpace(120);

      const head = [["Title", "Due Date", "Start Date", "End Date", "Item", "Amount (LKR)"]];
      let subTotalC = 0;

      const body = (e.subItems || []).map((s) => {
        const amtC = Number(s.targetCents || 0);
        subTotalC += amtC;
        return [
          e.title || "—",
          fmtDate(e?.dates?.due),
          fmtDate(e?.dates?.start),
          fmtDate(e?.dates?.end),
          s.name || "—",
          moneyRs(amtC, true),
        ];
      });

      if (body.length === 0) {
        const amtC = Number(e.targetCents || 0);
        subTotalC += amtC;
        body.push([
          e.title || "—",
          fmtDate(e?.dates?.due),
          fmtDate(e?.dates?.start),
          fmtDate(e?.dates?.end),
          "(no items)",
          moneyRs(amtC, true),
        ]);
      }

      autoTable(doc, {
        ...tableCommon,
        startY: cursorY + (idx === 0 ? 6 : 2),
        head,
        body,
        columnStyles: { 5: { halign: "right" } },
      });

      cursorY = (doc.lastAutoTable?.finalY || cursorY) + 14;
      doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(slateTxt);
      doc.text(`Total for ${e.title || "event"} : ${moneyRs(subTotalC, true)}`, margin, cursorY);
      cursorY += 28;

      itemizedGrandC += subTotalC;
    });

    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(slateTxt);
    doc.text(`Subtotal (Itemized) : ${moneyRs(itemizedGrandC, true)}`, margin, cursorY);
    cursorY += 24;
  }

  // ---- Summary (purple rules) ----
  ensureSpace(140);

  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(slateTxt);
  doc.text("Summary", margin, cursorY);
  cursorY += 10;

  doc.setDrawColor(brand.r, brand.g, brand.b).setLineWidth(1.2);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 14;

  const grandTotalC = (singleTotalC || 0) + (itemizedGrandC || 0);
  const summaryRows = [
    ["Single Total", moneyRs(singleTotalC, true)],
    ["Itemized Total", moneyRs(itemizedGrandC, true)],
    ["All Total Event Expenses", moneyRs(grandTotalC, true)],
    ["Number of Events", String((rows || []).length)],
  ];

  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(60);
  const labelX = margin + 10;
  const labelWidths = summaryRows.map(([lbl]) => doc.getTextWidth(lbl));
  const maxLabelW = Math.max(...labelWidths);
  const colonX = labelX + maxLabelW + 6;
  const valueAnchor = Math.min(pageW - margin - 40, colonX + 10 + 220);
  const lineGap = 18;

  summaryRows.forEach(([label, value]) => {
    doc.text(label, labelX, cursorY);
    doc.text(":", colonX, cursorY);
    doc.text(value, valueAnchor, cursorY, { align: "right" });
    cursorY += lineGap;
  });

  doc.setDrawColor(brand.r, brand.g, brand.b).setLineWidth(1.2);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 24;

  // ---- Signature (bottom-aligned) ----
  let sigY = pageH - 68;
  if (sigY - cursorY < 40) {
    doc.addPage();
    resetFooterFlag(); // Reset flag for new page
    // re-watermark only
    doc.setFontSize(10).setTextColor(120);
    doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
    doc.setTextColor(slateTxt);
    sigY = pageH - 68;
    // Draw footer on new page
    drawFooter();
  }
  doc.setFont("helvetica", "normal").setFontSize(12).setTextColor(slateTxt);
  doc.text("Authorized Signature : ____________________________________", margin, sigY);

  // Ensure footer is drawn on the last page
  if (!initialFooterDrawn) {
    drawFooter();
  }

  if (typeof doc.putTotalPages === "function") doc.putTotalPages(TOTAL_PAGES_TOKEN);

  const fn = buildFilenameLocal("EventExpensesReport", {
    period,
    from: filters?.from,
    to: filters?.to,
  });
  doc.save(fn);
}
/* ===================== PROGRESS BARS ===================== */
function Bar({ value = 0, max = 0, hard = false }) {
  const pctRaw = max > 0 ? value / max : 0;
  const pct = Math.max(0, Math.min(1, pctRaw)); // clamp 0–100%

  const [w, setW] = React.useState(0);

  // Animate from 0 → target whenever value/max changes
  React.useEffect(() => {
    setW(0);
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const over = pctRaw > 1;
  const warn = !over && pctRaw >= 0.85;

  // choose fill color
  const fill =
    over ? "from-rose-500 to-rose-400"
      : warn ? "from-amber-500 to-amber-400"
        : "from-emerald-500 to-emerald-400";

  return (
    <div
      className={[
        "relative h-2 w-full rounded-full bg-slate-200/80 overflow-hidden",
        hard && over ? "ring-2 ring-rose-400" : "",
      ].join(" ")}
      role="progressbar"
      aria-valuenow={Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* fill */}
      <div
        className={[
          "h-full rounded-full bg-gradient-to-r",
          "transition-[width] duration-700 ease-out",
          "motion-reduce:transition-none",
          fill,
        ].join(" ")}
        style={{ width: `${w * 100}%` }}
        aria-hidden
      />

      {/* optional subtle hatch when hard cap */}
      {hard && (
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          aria-hidden
          style={{
            background:
              "repeating-linear-gradient(45deg, transparent 0 8px, rgba(255,255,255,.45) 8px 16px)",
            mixBlendMode: "overlay",
          }}
        />
      )}
    </div>
  );
}

/* ===================== Create/Edit Event Modal ===================== */
// --- shared helpers (module scope) ---
const cleanAmount = (s) => (s || "").replace(/,/g, "");
const moneyRegex = /^\d{0,15}(\.\d{0,2})?$/; // up to 2 decimals

const formatCommas = (raw, keepDot = false) => {
  if (!raw) return "";
  const [i = "0", d = ""] = raw.split(".");
  const intClean = (i || "0").replace(/^0+(?=\d)/, "") || "0";
  const grouped = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (keepDot) return `${grouped}.`;
  return d !== "" ? `${grouped}.${d}` : grouped;
};

const toNumber = (s) => {
  const raw = cleanAmount(s);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const toLocalYMD = (d) => {
  const dt = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return dt.toISOString().slice(0, 10);
};

// caret helpers
const nonCommaCountBefore = (str, caret) => {
  let count = 0;
  for (let i = 0; i < caret; i++) if (str[i] !== ",") count++;
  return count;
};
const caretFromNonCommaCount = (str, n) => {
  if (n <= 0) return 0;
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== ",") count++;
    if (count >= n) return i + 1;
  }
  return str.length;
};

// ---------- HOISTED COMPONENT (fixes focus loss) ----------
function MoneyInput({ value, onValue, cap = Infinity, placeholder = "0.00", "data-test": dataTest }) {
  const inputRef = React.useRef(null);
  const [tip, setTip] = React.useState("");
  const [showTip, setShowTip] = React.useState(false);

  React.useEffect(() => {
    if (!showTip) return;
    const t = setTimeout(() => setShowTip(false), 1500);
    return () => clearTimeout(t);
  }, [showTip]);

  const onKeyDown = (e) => {
    if (["-", "e", "E", "+"].includes(e.key)) e.preventDefault();
  };
  const onPaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    const raw = cleanAmount(text);
    if (!moneyRegex.test(raw) || raw.startsWith(".")) e.preventDefault();
  };
  const onChange = (e) => {
    const el = e.target;
    const before = el.value;
    const caret = el.selectionStart ?? before.length;
    const nonCommaLeft = nonCommaCountBefore(before, caret);

    const raw = cleanAmount(before);
    if (raw === "") {
      onValue("");
      requestAnimationFrame(() => {
        const n = inputRef.current;
        if (n) n.setSelectionRange(0, 0);
      });
      return;
    }

    if (!/^\d*\.?\d*$/.test(raw)) return; // digits + one dot
    if (raw.startsWith(".")) return;      // no leading dot

    const [_, d = ""] = raw.split(".");
    if (d.length > 2) return;             // max 2 dp

    const candidate = Number(raw);
    if (!Number.isFinite(candidate)) return;

    const hardCap = Math.max(0, Number(cap ?? 0));
    let nextStr;
    if (candidate > hardCap) {
      const capDecLen = Math.min(2, (String(hardCap).split(".")[1] || "").length);
      const capped = hardCap.toFixed(capDecLen);
      nextStr = formatCommas(capped);
      setTip(`Capped at ${formatCommas(hardCap.toFixed(2))}`);
      setShowTip(true);
    } else {
      const keepDot = raw.endsWith(".") && raw.includes(".") && d.length === 0;
      nextStr = formatCommas(raw, keepDot);
    }

    onValue(nextStr);

    // restore caret after React re-render
    requestAnimationFrame(() => {
      const n = inputRef.current;
      if (!n) return;
      const newCaret = caretFromNonCommaCount(nextStr, nonCommaLeft);
      n.setSelectionRange(newCaret, newCaret);
    });
  };
  const onBlur = () => {
    const raw = cleanAmount(value);
    if (!raw) return;
    let n = Math.min(Number(raw), Math.max(0, Number(cap ?? 0)));
    if (!Number.isFinite(n) || n < 0) n = 0;
    const fixed = formatCommas(n.toFixed(2));
    onValue(fixed);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        const end = fixed.length;
        el.setSelectionRange(end, end);
      }
    });
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className="w-full rounded-xl border border-slate-300 px-3 py-2"
        inputMode="decimal"
        value={value}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        data-test={dataTest}
      />
      {showTip && (
        <div className="absolute -top-2 right-0 translate-y-[-100%] max-w-[240px]">
          <div className="px-2 py-1 text-xs rounded-md bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
            {tip}
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== YOUR FORM (unchanged API) =====================
function EventForm({ open, onClose, onSave, accounts, initial, budget }) {
  const isEdit = !!initial?._id;

  const [f, setF] = React.useState({
    _id: null,
    title: "",
    mode: "single",
    primaryAccountId: accounts[0]?._id || "",
    currency: "LKR",
    startDate: "",
    endDate: "",
    dueDate: "",
    notes: "",
    target: "",
    subItems: [{ name: "Gift", target: "" }],
  });

  React.useEffect(() => {
    if (!open) return;
    if (initial) {
      setF({
        _id: initial._id,
        title: (initial.title || "").replace(/[^A-Za-z ]/g, "").slice(0, 100),
        mode: initial.mode || "single",
        primaryAccountId: initial.primaryAccountId || (accounts[0]?._id || ""),
        currency: initial.currency || "LKR",
        startDate: initial?.dates?.start ? toLocalYMD(new Date(initial.dates.start)) : "",
        endDate: initial?.dates?.end ? toLocalYMD(new Date(initial.dates.end)) : "",
        dueDate: initial?.dates?.due ? toLocalYMD(new Date(initial.dates.due)) : "",
        notes: initial.notes || "",
        target: formatCommas((Number(fromCents(initial.targetCents || 0)) || 0).toFixed(2)),
        subItems:
          (initial.mode || "single") === "itemized"
            ? (initial.subItems || []).map((s) => ({
              id: s._id,
              name: s.name,
              target: formatCommas((Number(fromCents(s.targetCents || 0)) || 0).toFixed(2)),
            }))
            : [{ name: "Gift", target: "" }],
      });
    } else {
      setF((d) => ({ ...d, primaryAccountId: accounts[0]?._id || "" }));
    }
  }, [open, initial, accounts]);

  const handleTitle = (e) => {
    const next = e.target.value.replace(/[^A-Za-z ]/g, "").slice(0, 100);
    setF({ ...f, title: next });
  };

  const itemizedTotal = React.useMemo(
    () => (f.subItems || []).reduce((sum, it) => sum + toNumber(it.target), 0),
    [f.subItems]
  );
  const targetRupees = f.mode === "single" ? toNumber(f.target) : itemizedTotal;
  const targetCents = toCents(targetRupees);

  const selectedAcc = accounts.find((a) => a._id === f.primaryAccountId);
  const accBalCents = Number(selectedAcc?.balanceCents || 0);
  const accBalRupees = accBalCents / 100;

  const singleCap = accBalRupees;
  const capForRow = (index) => {
    const others = (f.subItems || []).reduce(
      (s, it, i) => (i === index ? s : s + toNumber(it.target)),
      0
    );
    return Math.max(0, accBalRupees - others);
  };

  const insufficientAccount =
    f.mode === "single"
      ? targetCents > accBalCents
      : toCents(itemizedTotal) > accBalCents;

  const capC = toCents(Number(budget?.events?.amount || 0));
  const usedC = Number(budget?._usedEventsCents || 0);
  const earmarkedC = Number(budget?._earmarkedEventsCents || 0);
  const remainingBudgetC = Math.max(0, capC - usedC - earmarkedC);
  const showBudgetWarn = capC > 0 && targetCents > remainingBudgetC;

  const save = async (e) => {
    e.preventDefault();
    if (!f.title?.trim()) return alert("Title is required");
    if (!f.dueDate) return alert("Due date is required");
    if (!f.primaryAccountId) return alert("Select an account");
    if (insufficientAccount)
      return alert("Insufficient funds in the selected account to cover the event target.");

    const payload = {
      title: f.title.trim(),
      mode: f.mode,
      primaryAccountId: f.primaryAccountId || null,
      currency: f.currency || "LKR",
      dates: {
        start: f.startDate ? new Date(f.startDate) : null,
        end: f.endDate ? new Date(f.endDate) : null,
        due: new Date(f.dueDate),
      },
      notes: f.notes?.trim() || "",
    };

    if (f.mode === "single") {
      payload.targetCents = toCents(toNumber(f.target) || 0);
    } else {
      const subItems = (f.subItems || []).filter((s) => s.name?.trim());
      payload.subItems = subItems.map((s) => {
        const one = { name: s.name.trim(), targetCents: toCents(toNumber(s.target) || 0) };
        if (s.id) one._id = s.id;
        return one;
      });
    }

    if (isEdit) await onSave(f._id, payload);
    else await onSave(null, payload);
  };

  const minDate = toLocalYMD(new Date());
  const maxDate = toLocalYMD(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Event" : "Add Event"} max="max-w-3xl">
      <form onSubmit={save} className="grid gap-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Title" required>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.title}
              onChange={handleTitle}
              placeholder="Sahan Wedding"
              required
              maxLength={100}
              pattern="^[A-Za-z ]{1,100}$"
              title="Only letters and spaces, up to 100 characters"
            />
          </Field>
          <Field label="Mode" required>
            <div className="flex items-center gap-2">
              {["single", "itemized"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setF({ ...f, mode: m })}
                  className={`px-3 py-2 rounded-xl border ${f.mode === m ? "bg-blue-600 text-white border-blue-600" : "bg-white"
                    }`}
                >
                  {m === "single" ? "Single amount" : "Itemized"}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Primary Account" required>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.primaryAccountId}
              onChange={(e) => setF({ ...f, primaryAccountId: e.target.value })}
              required
            >
              {accounts.length === 0 ? (
                <option value="">No accounts found</option>
              ) : (
                accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} ({a.type}) — {currency(a.balanceCents, a.currency || "LKR")}
                  </option>
                ))
              )}
            </select>
            {selectedAcc && (
              <p className="text-xs text-slate-500 mt-1">
                Available: {currency(selectedAcc.balanceCents, selectedAcc.currency || "LKR")}
              </p>
            )}
          </Field>
          <Field label="Currency">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-slate-50 text-slate-600"
              value={f.currency}
              readOnly
              disabled
            />
          </Field>
          <Field label="Due date" required>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.dueDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setF({ ...f, dueDate: e.target.value })}
              required
            />
          </Field>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Start date">
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.startDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setF({ ...f, startDate: e.target.value })}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.endDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setF({ ...f, endDate: e.target.value })}
            />
          </Field>
        </div>

        {f.mode === "single" ? (
          <Field label="Target amount" required>
            <MoneyInput
              value={f.target}
              onValue={(v) => setF({ ...f, target: v })}
              cap={singleCap}
              placeholder="150,000.00"
              data-test="single-target"
            />
          </Field>
        ) : (
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Sub-items</span>
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl border bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => setF({ ...f, subItems: [...f.subItems, { name: "", target: "" }] })}
              >
                + Add
              </button>
            </div>
            {f.subItems.map((s, i) => (
              <div key={s.id || i} className="grid grid-cols-12 gap-2">
                <input
                  className="col-span-7 rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="Name (e.g., Gift)"
                  value={s.name}
                  onChange={(e) => {
                    const x = [...f.subItems];
                    x[i].name = e.target.value;
                    setF({ ...f, subItems: x });
                  }}
                />
                <div className="col-span-4">
                  <MoneyInput
                    value={s.target}
                    onValue={(v) => {
                      const x = [...f.subItems];
                      x[i].target = v;
                      setF({ ...f, subItems: x });
                    }}
                    cap={capForRow(i)}
                    placeholder="0.00"
                    data-test={`sub-${i}-target`}
                  />
                </div>
                <button
                  type="button"
                  className="col-span-1 rounded-xl border bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => setF({ ...f, subItems: f.subItems.filter((_, j) => j !== i) })}
                  title="Remove"
                >
                  −
                </button>
              </div>
            ))}
            <div className="text-right text-sm text-slate-600">
              Total: {currency(toCents(itemizedTotal), f.currency)}
            </div>
          </div>
        )}

        {selectedAcc && targetCents > 0 && targetCents > (selectedAcc.balanceCents || 0) && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
            Insufficient funds in <b>{selectedAcc.name}</b>. Needed {currency(targetCents, f.currency)}, available{" "}
            {currency(selectedAcc.balanceCents, selectedAcc.currency || "LKR")}.
          </div>
        )}

        {showBudgetWarn && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2">
            Heads up: This event's target ({currency(targetCents, f.currency)}) exceeds your remaining Events budget for{" "}
            {budget?.period}.
          </div>
        )}

        <Field label="Notes">
          <textarea
            rows={3}
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            placeholder="Any details…"
          />
        </Field>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className={`px-4 py-2 rounded-xl text-white ${(f.mode === "single"
              ? targetCents > accBalCents
              : toCents(itemizedTotal) > accBalCents)
              ? "bg-slate-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
              }`}
            disabled={
              f.mode === "single"
                ? targetCents > accBalCents
                : toCents(itemizedTotal) > accBalCents
            }
          >
            Save
          </button>
          <button type="button" className="px-4 py-2 rounded-xl border border-slate-300" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}


// parse to number (safe for 2dp strings)
const toNumberRupees = (s) => {
  const raw = cleanAmount(s);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

/* ===================== Fund (enforces budget cap) ===================== */
function FundModal({ open, onClose, onSave, accounts, event, budget }) {
  const [accountId, setAccountId] = React.useState("");
  const [amount, setAmount] = React.useState(""); // RUPEES string with commas
  const [date, setDate] = React.useState(ymd(new Date())); // keep your util for initial value
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setAccountId(event?.primaryAccountId || accounts[0]?._id || "");
    setAmount("");
    setDate(ymd(new Date()));
    setNote("");
  }, [open, event, accounts]);

  const selectedAcc = accounts.find((a) => a._id === accountId);

  // amounts in CENTS for guards
  const amountCents = toCents(toNumberRupees(amount));

  const remainingTargetCents = Math.max(
    0,
    (event?.targetCents || 0) - (event?.fundedCents || 0)
  );

  const insufficientAccount = (selectedAcc?.balanceCents || 0) < amountCents;
  const overEventTarget = amountCents > remainingTargetCents;

  // Budget hard/soft cap
  const capC = toCents(Number(budget?.events?.amount || 0));
  const usedC = Number(budget?._usedEventsCents || 0);
  const earmarkedC = Number(budget?._earmarkedEventsCents || 0);
  const remainingBudgetC = Math.max(0, capC - usedC - earmarkedC);
  const overBudget = amountCents > remainingBudgetC && capC > 0;
  const hardCap = !!budget?.events?.hardCap;

  // live cap while typing (rupees): min(account, remaining target, (hard cap ? remaining budget : ∞))
  const maxAllowedByAccount = selectedAcc?.balanceCents || 0;
  const maxAllowedByEvent = remainingTargetCents;
  const maxAllowedByBudget = hardCap ? remainingBudgetC : Infinity;
  const maxAllowedCents = Math.min(maxAllowedByAccount, maxAllowedByEvent, maxAllowedByBudget);
  const maxAllowedRupees = (maxAllowedCents / 100) || 0;

  // date limits: today .. +30 days
  const minDate = toLocalYMD(new Date());
  const maxDate = toLocalYMD(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  const disableSubmit =
    amountCents <= 0 ||
    insufficientAccount ||
    overEventTarget ||
    (hardCap && overBudget);

  return (
    <Modal open={open} onClose={onClose} title={`Fund: ${event?.title || ""}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (disableSubmit) return;
          await onSave({
            accountId,
            amountCents,
            date: date ? new Date(date) : new Date(),
            note: note?.trim() || "",
          });
        }}
        className="grid gap-4"
      >
        <Field label="From Account" required>
          <select
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name} — {currency(a.balanceCents, a.currency || "LKR")}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid md:grid-cols-3 gap-4">
          <Field
            label="Amount"
            required
            hint={`Max: ${currency(maxAllowedCents, event?.currency || "LKR")}`}
          >
            <MoneyInput
              value={amount}
              onValue={setAmount}
              cap={maxAllowedRupees}
              placeholder="0.00"
            />
          </Field>

          <Field label="Date" required>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>

          <Field label="Note">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        {overEventTarget && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2">
            You're trying to fund more than this event's remaining target. Remaining:{" "}
            {currency(remainingTargetCents, event?.currency || "LKR")}.
          </div>
        )}
        {insufficientAccount && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
            Not enough balance in <b>{selectedAcc?.name || "account"}</b>.
          </div>
        )}
        {!hardCap && overBudget && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2">
            This would exceed the remaining Events budget for {budget?.period}. You can still proceed (no hard cap).
          </div>
        )}
        {hardCap && overBudget && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
            Events budget is a <b>hard cap</b> this month. You can fund up to{" "}
            {currency(remainingBudgetC, event?.currency || "LKR")}.
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className={`px-4 py-2 rounded-xl text-white ${disableSubmit
              ? "bg-slate-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
              }`}
            disabled={disableSubmit}
          >
            Add Funds
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ===================== Remove Funds (Defund) ===================== */
function DefundModal({ open, onClose, onSave, accounts, event }) {
  const [accountId, setAccountId] = React.useState("");
  const [amount, setAmount] = React.useState(""); // RUPEES string with commas
  const [date, setDate] = React.useState(ymd(new Date())); // keep your existing util for initial
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setAccountId(event?.primaryAccountId || accounts[0]?._id || "");
    setAmount("");
    setDate(ymd(new Date()));
    setNote("");
  }, [open, event, accounts]);

  // refundable = funded - spent
  const refundableCents = Math.max(0, (event?.fundedCents || 0) - (event?.spentCents || 0));
  const refundableRupees = (refundableCents / 100) || 0;

  // amount in cents from the formatted string
  const amountCents = toCents(toNumberRupees(amount));
  const overRefundable = amountCents > refundableCents;

  // limit selectable dates: today .. +30 days
  const minDate = toLocalYMD(new Date());
  const maxDate = toLocalYMD(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  const disableSubmit =
    refundableCents <= 0 ||
    amountCents <= 0 ||
    overRefundable;

  return (
    <Modal open={open} onClose={onClose} title={`Remove Funds: ${event?.title || ""}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (disableSubmit) return;
          await onSave({
            accountId,
            amountCents,
            date: date ? new Date(date) : new Date(),
            note: note?.trim() || "",
          });
        }}
        className="grid gap-4"
      >
        <Field label="Return to Account" required>
          <select
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name} — {currency(a.balanceCents, a.currency || "LKR")}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid md:grid-cols-3 gap-4">
          <Field
            label="Amount"
            required
            hint={`Refundable: ${currency(refundableCents, event?.currency || "LKR")}`}
          >
            {/* cap while typing to refundable max; comma groups + 2dp via MoneyInput */}
            <MoneyInput
              value={amount}
              onValue={setAmount}
              cap={refundableRupees}
              placeholder="0.00"
            />
          </Field>

          <Field label="Date" required>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>

          <Field label="Note">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        {overRefundable && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2">
            You can only remove up to what's unspent. Refundable:{" "}
            {currency(refundableCents, event?.currency || "LKR")}.
          </div>
        )}
        {refundableCents <= 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-sm px-3 py-2">
            Nothing refundable for this event right now.
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className={`px-4 py-2 rounded-xl text-white ${disableSubmit
              ? "bg-slate-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
              }`}
            disabled={disableSubmit}
          >
            Remove Funds
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}


/* ===================== Spend (blocks > funded - spent) ===================== */
function SpendModal({ open, onClose, onSave, accounts, event }) {
  const [accountId, setAccountId] = React.useState("");
  const [subItemId, setSubItemId] = React.useState("");
  const [amount, setAmount] = React.useState(""); // RUPEES string with commas via MoneyInput
  const [merchant, setMerchant] = React.useState("");
  const [date, setDate] = React.useState(ymd(new Date())); // keep your util for initial value
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setAccountId(event?.primaryAccountId || accounts[0]?._id || "");
    setSubItemId("");
    setAmount("");
    setMerchant("");
    setDate(ymd(new Date()));
    setNote("");
  }, [open, event, accounts]);

  // how much is available to spend (funded - already spent)
  const remainingFundedCents = Math.max(
    0,
    (event?.fundedCents || 0) - (event?.spentCents || 0)
  );
  const availableRupees = (remainingFundedCents / 100) || 0;

  // numeric value from formatted input
  const amountCents = toCents(toNumberRupees(amount));
  const overAvailable = amountCents > remainingFundedCents;

  // limit selectable dates: today .. +30 days
  const minDate = toLocalYMD(new Date());
  const maxDate = toLocalYMD(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  const disableSubmit = amountCents <= 0 || overAvailable;

  return (
    <Modal open={open} onClose={onClose} title={`Spend for: ${event?.title || ""}`}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (disableSubmit) return;
          await onSave({
            accountId,
            subItemId: subItemId || null,
            amountCents,
            merchant: merchant?.trim() || "",
            date: date ? new Date(date) : new Date(),
            note: note?.trim() || "",
          });
        }}
        className="grid gap-4"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="From Account" required>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
            >
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} — {currency(a.balanceCents, a.currency || "LKR")}
                </option>
              ))}
            </select>
          </Field>

          {event?.mode === "itemized" && (
            <Field label="Sub-item">
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={subItemId}
                onChange={(e) => setSubItemId(e.target.value)}
              >
                <option value="">(none)</option>
                {(event?.subItems || []).map((s) => (
                  <option key={s._id || s.name} value={s._id || s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Field
            label="Amount"
            required
            hint={`Available: ${currency(remainingFundedCents, event?.currency || "LKR")}`}
          >
            {/* live clamp to available balance; commas + 2dp via MoneyInput */}
            <MoneyInput
              value={amount}
              onValue={setAmount}
              cap={availableRupees}
              placeholder="0.00"
            />
          </Field>

          <Field label="Merchant">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="e.g., ODEL"
            />
          </Field>

          <Field label="Date" required>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
        </div>

        {overAvailable && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2">
            You can't spend more than what's funded. Available:{" "}
            {currency(remainingFundedCents, event?.currency || "LKR")}.
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className={`px-4 py-2 rounded-xl text-white ${disableSubmit ? "bg-slate-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
              }`}
            disabled={disableSubmit}
          >
            Add Expense
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl border border-slate-300"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}


/* ===================== Event Card ===================== */
function EventCard({ ev, onEdit, onFund, onDefund, onSpend, onDelete }) {
  const fundedPct = (ev.targetCents || 0) > 0
    ? Math.round(((ev.fundedCents || 0) / ev.targetCents) * 100)
    : 0;
  const spentPct = (ev.targetCents || 0) > 0
    ? Math.round(((ev.spentCents || 0) / ev.targetCents) * 100)
    : 0;

  const refundableCents = Math.max(0, (ev.fundedCents || 0) - (ev.spentCents || 0));
  const canDefund = refundableCents > 0;
  const canDelete = (ev.spentCents || 0) === 0 && (ev.fundedCents || 0) === 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition">
      {/* Title + Target */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold text-slate-900 truncate">{ev.title}</div>
          <div className="text-xs text-slate-500 mt-1">
            {ev.mode === "single" ? "Single amount" : "Itemized"}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <CalendarDays className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">
              {ev?.dates?.due
                ? `Due ${new Date(ev.dates.due).toLocaleDateString()}`
                : "No due date"}
            </span>
          </div>
        </div>
        <div className="text-right ml-2 flex-shrink-0">
          <div className="text-xs text-slate-500">Target</div>
          <div className="font-semibold text-slate-900 text-sm">
            {currency(ev.targetCents, ev.currency || "LKR")}
          </div>
        </div>
      </div>

      {/* Progress bars */}
      <div className="space-y-4 mb-4">
        <div>
          <div className="flex justify-between text-xs mb-1 text-slate-600">
            <span>Funded</span>
            <span className="font-medium text-slate-800">
              {currency(ev.fundedCents, ev.currency)} • {fundedPct}%
            </span>
          </div>
          <Bar value={ev.fundedCents || 0} max={ev.targetCents || 1} />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1 text-slate-600">
            <span>Spent</span>
            <span className="font-medium text-slate-800">
              {currency(ev.spentCents, ev.currency)} • {spentPct}%
            </span>
          </div>
          <Bar value={ev.spentCents || 0} max={ev.targetCents || 1} />
        </div>
      </div>

      {/* Actions - 2 buttons per row with proper organization */}
      <div className="grid grid-cols-2 gap-2">
        {/* Row 1: Primary actions */}
        <button
          className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm"
          onClick={() => onFund(ev)}
        >
          <PlusCircle className="w-4 h-4" />
          Fund
        </button>
        <button
          className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 text-sm"
          onClick={() => onSpend(ev)}
        >
          <ShoppingCart className="w-4 h-4" />
          Spend
        </button>

        {/* Row 2: Secondary actions */}
        {canDefund ? (
          <button
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border border-red-300 text-red-700 hover:bg-red-50 text-sm"
            onClick={() => onDefund(ev)}
          >
            <MinusCircle className="w-4 h-4" />
            Remove
          </button>
        ) : (
          <button
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border border-slate-300 text-slate-500 cursor-not-allowed text-sm"
            disabled
          >
            <MinusCircle className="w-4 h-4" />
            Remove
          </button>
        )}
        
        <button
          className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-sm"
          onClick={() => onEdit(ev)}
        >
          <Pencil className="w-4 h-4" />
          Edit
        </button>

        {/* Row 3: Delete button (only when no money spent and no funds) */}
        {canDelete && (
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${ev.fundedCents > 0
              ? "border-slate-300 text-slate-400 cursor-not-allowed"
              : "border-red-300 text-red-600 hover:bg-red-50"
              }`}
            onClick={() => (ev.fundedCents > 0 ? null : onDelete(ev))}
            disabled={ev.fundedCents > 0}
            className="col-span-2 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 text-sm mt-1"
            onClick={() => onDelete(ev)}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/* ===================== Page ===================== */
export default function EventsPage() {
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState([]);

  const [events, setEvents] = useState([]);

  useEffect(() => {
    Accounts.list().then(setAccounts);
    Events.list().then(setEvents);
  }, []);

  // VIEW PERIOD (month scoped by createdAt)
  const [viewPeriod, setViewPeriod] = useState(thisPeriod()); // YYYY-MM
  const prevMonth = () => {
    const [y, m] = viewPeriod.split("-").map(Number);
    const d = new Date(y, m - 2, 1); // JS months 0-11
    setViewPeriod(ymLocal(d));
  };
  const nextMonth = () => {
    const [y, m] = viewPeriod.split("-").map(Number);
    const d = new Date(y, m, 1);
    setViewPeriod(ymLocal(d));
  };

  // Budget of the view period
  const [plan, setPlan] = useState(null);

  // Filters (now includes date filters)
  const [filters, setFilters] = useState({
    q: "",
    mode: "",
    accountId: "",
    dateField: "createdAt", // createdAt | due
    from: "",
    to: "",
  });

  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [funding, setFunding] = useState(null);
  const [defunding, setDefunding] = useState(null);
  const [spending, setSpending] = useState(null);

  const load = async () => {
    setErr("");
    try {
      const [acc, evs, bp] = await Promise.all([Accounts.list(), Events.list(), Budget.getPlan(viewPeriod)]);
      setAccounts(acc || []);
      setItems(evs || []);
      setPlan(bp); // could be null
    } catch (e) {
      setErr(e?.response?.data?.detail || e?.message || "Failed to load");
    }
  };

  // load on mount & when viewPeriod changes (so budget plan matches the period)
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPeriod]);

  /* ===== Scope events to VIEW PERIOD by createdAt (your requirement) ===== */
  const scopedByMonth = useMemo(() => items.filter((e) => inPeriodLocal(e.createdAt, viewPeriod)), [items, viewPeriod]);

  /* ===== Budget usage model should also respect the scoped month ===== */
  const usedEventsCents = useMemo(
    () => scopedByMonth.reduce((sum, e) => sum + Number(e.spentCents || 0), 0),
    [scopedByMonth]
  );
  const earmarkedEventsCents = useMemo(
    () => scopedByMonth.reduce((sum, e) => sum + Math.max(0, Number(e.fundedCents || 0) - Number(e.spentCents || 0)), 0),
    [scopedByMonth]
  );

  const planWithUsage = useMemo(() => {
    if (!plan) return null;
    return {
      ...plan,
      _usedEventsCents: usedEventsCents,
      _earmarkedEventsCents: earmarkedEventsCents,
    };
  }, [plan, usedEventsCents, earmarkedEventsCents]);

  const capR = Number(plan?.events?.amount || 0);
  const capC = toCents(capR);
  const remainingC = Math.max(0, capC - usedEventsCents - earmarkedEventsCents);

  /* ===== CRUD handlers ===== */
  const onSaveEvent = async (id, body) => {
    try {
      if (id) {
        const updated = await Events.update(id, body);
        setItems((prev) => prev.map((x) => (x._id === id ? updated : x)));
      } else {
        const created = await Events.create(body);
        setItems((prev) => [created, ...prev]);
      }
      setOpen(false);
      setEditing(null);
    } catch (e) {
      alert(e?.response?.data?.detail || e?.message || "Save failed");
    }
  };

  const onDeleteEvent = async (ev) => {
    if (!window.confirm(`Delete event "${ev.title}"?`)) return;
    try {
      await Events.remove(ev._id);
      setItems((prev) => prev.filter((x) => x._id !== ev._id));
    } catch (e) {
      alert(e?.response?.data?.detail || e?.message || "Delete failed");
    }
  };

  const onFundEvent = async (payload) => {
    try {
      const data = await Events.fund(funding._id, payload);
      const updatedEvent = data?.event || data;
      setItems((prev) => prev.map((x) => (x._id === updatedEvent._id ? updatedEvent : x)));
      const acc = await Accounts.list();
      setAccounts(acc || []);
      setFunding(null);
      // refresh plan usage for current viewPeriod
      const bp = await Budget.getPlan(viewPeriod);
      setPlan(bp);
    } catch (e) {
      alert(e?.response?.data?.detail || e?.message || "Funding failed");
    }
  };

  const onDefundEvent = async (payload) => {
    try {
      const data = await Events.defund(defunding._id, payload);
      const updatedEvent = data?.event || data;
      setItems((prev) => prev.map((x) => (x._id === updatedEvent._id ? updatedEvent : x)));
      const acc = await Accounts.list();
      setAccounts(acc || []);
      setDefunding(null);
      const bp = await Budget.getPlan(viewPeriod);
      setPlan(bp);
    } catch (e) {
      alert(e?.response?.data?.detail || e?.message || "Remove funds failed");
    }
  };

  const onSpendEvent = async (payload) => {
    try {
      const data = await Events.spend(spending._id, payload);
      const updatedEvent = data?.event || data;
      setItems((prev) => prev.map((x) => (x._id === updatedEvent._id ? updatedEvent : x)));
      setSpending(null);
      const bp = await Budget.getPlan(viewPeriod);
      setPlan(bp);
    } catch (e) {
      alert(e?.response?.data?.detail || e?.message || "Spending failed");
    }
  };

  /* ===== Date-based filtering (Created/Due + From/To) applied AFTER month scope ===== */
  const eventDateForField = (e, field) => {
    if (field === "due") return e?.dates?.due || null;
    return e?.createdAt || null;
  };

  const filtered = useMemo(() => {
    const q = filters.q.toLowerCase();
    const dateField = filters.dateField; // 'createdAt' or 'due'
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(filters.to) : null;

    return scopedByMonth.filter((e) => {
      // Updated search logic: only show titles starting with the search letter
      const okQ = !q || (e.title || "").toLowerCase().startsWith(q);
      const okMode = !filters.mode || e.mode === filters.mode;
      const okAcc = !filters.accountId || e.primaryAccountId === filters.accountId;

      // Date range check on chosen field
      let okDate = true;
      if (from || to) {
        const d = normalizeDate(eventDateForField(e, dateField));
        if (!(d instanceof Date) || isNaN(d)) {
          okDate = false;
        } else {
          if (from && d < new Date(from.getFullYear(), from.getMonth(), from.getDate())) okDate = false;
          if (to) {
            const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
            if (d > toEnd) okDate = false;
          }
        }
      }

      return okQ && okMode && okAcc && okDate;
    });
  }, [scopedByMonth, filters]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header with Month Scope */}
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600">Events</h1>
            <p className="text-slate-600 mt-1">
              Create Upcomming Events And Get Ready Without Financial Fear.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1">
              <button className="px-2 py-1 rounded-lg hover:bg-slate-100" onClick={prevMonth}>
                ◀
              </button>
              <div className="px-2 text-sm font-medium">{viewPeriod}</div>
              <button className="px-2 py-1 rounded-lg hover:bg-slate-100" onClick={nextMonth}>
                ▶
              </button>
              <button className="ml-1 px-2 py-1 rounded-lg text-xs border hover:bg-slate-100" onClick={() => setViewPeriod(thisPeriod())}>
                This Month
              </button>
            </div>
            <button className="flex items-center gap-2 px-3 py-2.5 rounded-xl border hover:bg-slate-50 text-blue-600 hover:text-blue-700" onClick={load}>
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button

              onClick={() =>
                generateEventExpensesReportPDF({
                  rows: filtered,
                  filters,
                  period: viewPeriod,
                  logoUrl: "/reportLogo.png",
                })
              }
              className="flex items-center gap-2 rounded-xl border border-blue-400 bg-white px-4 py-2.5 text-sm hover:bg-blue-50 text-blue-600 hover:text-blue-700 shadow-sm"
            >
              <FileText className="w-4 h-4" />
              Generate Report
            </button>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Create Event
            </button>
          </div>
        </header>

        {/* ---------- Budget Overview (viewPeriod) ---------- */}
        <section className="mb-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">
                Events Budget — <span className="text-slate-600">{viewPeriod}</span>
              </div>
              {plan?.events?.hardCap && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-700">Hard Cap</span>
              )}
            </div>

            <div className="grid md:grid-cols-4 gap-4 mb-3">
              <div>
                <div className="text-xs text-slate-500">Budget</div>
                <div className="text-slate-900 font-semibold">{currency(toCents(Number(plan?.events?.amount || 0)))}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Used (spent)</div>
                <div className="text-slate-900 font-semibold">{currency(usedEventsCents)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Earmarked (unspent funds)</div>
                <div className="text-slate-900 font-semibold">{currency(earmarkedEventsCents)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Remaining</div>
                <div className="text-slate-900 font-semibold">{currency(remainingC)}</div>
              </div>
            </div>

            <Bar
              value={usedEventsCents + earmarkedEventsCents}
              max={toCents(Number(plan?.events?.amount || 0))}
              hard={!!plan?.events?.hardCap}
            />

            {!plan && (
              <div className="mt-2 text-xs text-slate-600">
                No budget plan found for {viewPeriod}. Create one under <b>Budget &gt; Plans</b> to track limits.
              </div>
            )}
          </div>
        </section>

        {/* Filters */}
        <div className="grid md:grid-cols-6 gap-3 mb-6">
          <Field label="Search">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="title / notes"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            />
          </Field>
          <Field label="Mode">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filters.mode}
              onChange={(e) => setFilters({ ...filters, mode: e.target.value })}
            >
              <option value="">All</option>
              <option value="single">Single</option>
              <option value="itemized">Itemized</option>
            </select>
          </Field>
          <Field label="Account">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filters.accountId}
              onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}
            >
              <option value="">All</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date field">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filters.dateField}
              onChange={(e) => setFilters({ ...filters, dateField: e.target.value })}
            >
              <option value="createdAt">Created Date</option>
              <option value="due">Due Date</option>
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </Field>
        </div>

        {/* Error */}
        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">{err}</div>
        )}

        {/* Cards - 2 per row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {filtered.length === 0 ? (
            <div className="col-span-2 text-slate-500 text-center py-8">
              No events in {viewPeriod}. Click <b>Create Event</b> to get started.
            </div>
          ) : (
            filtered.map((ev) => (
              <EventCard
                key={ev._id}
                ev={ev}
                onEdit={(x) => {
                  setEditing(x);
                  setOpen(true);
                }}
                onFund={(x) => setFunding(x)}
                onDefund={(x) => setDefunding(x)}
                onSpend={(x) => setSpending(x)}
                onDelete={onDeleteEvent}
              />
            ))
          )}
        </div>

        {/* Table - Made horizontally scrollable */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-200 text-slate-900">
              <tr>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Mode</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-right">Target</th>
                <th className="px-3 py-2 text-right">Funded</th>
                <th className="px-3 py-2 text-right">Spent</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Due</th>
                <th className="px-3 py-2 text-right min-w-[200px] whitespace-nowrap">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-6 text-center text-slate-500 italic"
                  >
                    No events
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const hasSpend = (e.spentCents || 0) > 0;
                  const refundable =
                    Math.max(0, (e.fundedCents || 0) - (e.spentCents || 0)) > 0;
                  const canDelete = !hasSpend && (e.fundedCents || 0) === 0;

                  const accountName =
                    accounts.find((a) => a._id === e.primaryAccountId)?.name || "—";
                  const modePill =
                    e.mode === "single"
                      ? "bg-slate-100 text-slate-700"
                      : "bg-indigo-50 text-indigo-700";

                  return (
                    <tr
                      key={e._id}
                      className="border-t hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-3 py-2 align-middle font-medium text-slate-800">
                        {e.title}
                      </td>

                      <td className="px-3 py-2 align-middle">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${modePill}`}
                        >
                          {e.mode === "single" ? "Single" : "Itemized"}
                        </span>
                      </td>

                      <td className="px-3 py-2 align-middle">{accountName}</td>

                      <td className="px-3 py-2 align-middle text-right font-semibold">
                        {currency(e.targetCents, e.currency || "LKR")}
                      </td>

                      <td className="px-3 py-2 align-middle text-right">
                        {currency(e.fundedCents, e.currency || "LKR")}
                      </td>

                      <td className="px-3 py-2 align-middle text-right">
                        {currency(e.spentCents, e.currency || "LKR")}
                      </td>

                      <td className="px-3 py-2 align-middle">
                        {e?.createdAt ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(e.createdAt).toLocaleDateString()}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="px-3 py-2 align-middle">
                        {e?.dates?.due ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(e.dates.due).toLocaleDateString()}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* Actions (icon-only) */}
                      <td className="px-3 py-2 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-3">
                          <button
                            className="text-blue-600 hover:text-blue-800"
                            onClick={() => {
                              setEditing(e);
                              setOpen(true);
                            }}
                            title="Edit"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>

                          <button
                            className="text-emerald-600 hover:text-emerald-800"
                            onClick={() => setFunding(e)}
                            title="Fund"
                          >
                            <PlusCircle className="w-5 h-5" />
                          </button>

                          {refundable && (
                            <button
                              className="text-amber-600 hover:text-amber-800"
                              onClick={() => setDefunding(e)}
                              title="Remove funds"
                            >
                              <MinusCircle className="w-5 h-5" />
                            </button>

                            <button
                              className={[
                                canDelete
                                  ? "text-red-600 hover:text-red-800"
                                  : "text-slate-400 cursor-not-allowed",
                              ].join(" ")}
                              onClick={() =>
                                canDelete ? onDeleteEvent(e) : null
                              }
                              disabled={!canDelete}
                              title={
                                canDelete
                                  ? "Delete"
                                  : e.fundedCents > 0
                                    ? "Remove funds first to delete"
                                    : ""
                              }
                            >
                              <Trash2 className="w-5 h-5" />
                              className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800"
                              onClick={() => setFunding(e)}
                              title="Fund"
                            >
                              <PlusCircle className="w-4 h-4" />
                              <span className="hidden sm:inline">Fund</span>
                            </button>

                            {refundable && (
                              <button
                                className="inline-flex items-center gap-1.5 text-red-600 hover:text-red-800"
                                onClick={() => setDefunding(e)}
                                title="Remove funds"
                              >
                                <MinusCircle className="w-4 h-4" />
                                <span className="hidden sm:inline">Remove</span>
                              </button>
                            )}

                            {!hasSpend && (
                              <button
                                className={[
                                  "inline-flex items-center gap-1.5",
                                  canDelete
                                    ? "text-red-600 hover:text-red-800"
                                    : "text-slate-400 cursor-not-allowed",
                                ].join(" ")}
                                onClick={() => (canDelete ? onDeleteEvent(e) : null)}
                                disabled={!canDelete}
                                title={canDelete ? "Delete" : e.fundedCents > 0 ? "Remove funds first to delete" : ""}
                              >
                                <Trash2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>


        {/* Modals */}
        <EventForm
          open={open}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={onSaveEvent}
          accounts={accounts}
          initial={editing}
          budget={planWithUsage}
        />

        <FundModal
          open={!!funding}
          onClose={() => setFunding(null)}
          accounts={accounts}
          event={funding}
          onSave={onFundEvent}
          budget={planWithUsage}
        />

        <DefundModal
          open={!!defunding}
          onClose={() => setDefunding(null)}
          accounts={accounts}
          event={defunding}
          onSave={onDefundEvent}
        />

        <SpendModal
          open={!!spending}
          onClose={() => setSpending(null)}
          accounts={accounts}
          event={spending}
          onSave={onSpendEvent}
        />
      </div>
    </div>
  ); 
}