// src/pages/bank.jsx
import {
  Clock,
  CheckCircle2,
  Pencil,
  Trash2,
  CalendarDays,
  Banknote,
  FileText,
  PlusCircle,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import api from "../api/api.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ===================== API ===================== */
const Accounts = {
  list: () =>
    api.get("accounts", { params: { includeArchived: "false" } }).then((r) => r.data),
};
const Commitments = {
  list: (p = {}) => api.get("commitments", { params: p }).then((r) => r.data),
  create: (b) => api.post("commitments", b).then((r) => r.data),
  update: (id, b) => api.put(`commitments/${id}`, b).then((r) => r.data),
  remove: (id) => api.delete(`commitments/${id}`).then((r) => r.data),
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

// --- strict word-prefix search helpers (space-delimited words only) ---
const escapeRegExp = (s = "") => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Match query tokens only at starts of words separated by spaces (no hyphen matches) */
const wordPrefixMatch = (text = "", query = "") => {
  const tokens = String(query).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = String(text);
  return tokens.every((tok) => {
    // (^|\s) ensures start-of-string or space—not punctuation like '-'
    const rx = new RegExp(`(?:^|\\s)${escapeRegExp(tok)}`, "i");
    return rx.test(hay);
  });
};

const LKR = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const toCents = (n) => Math.round(Number(n || 0) * 100);
const fromCents = (c) => (Number(c || 0) / 100).toFixed(2);
const ymd = (x) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const thisPeriod = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`; // YYYY-MM
};
const isInPeriod = (date, period) => {
  if (!date) return false;
  const d = new Date(date);
  const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return p === period;
};
const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "");

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

function Modal({ open, onClose, title, children, wide = false }) {
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" onClick={onClose} />

      {/* Scrollable overlay */}
      <div className="fixed inset-0 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full items-center justify-center p-4">
          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`relative w-full ${wide ? "max-w-5xl" : "max-w-2xl"} rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <h3 id={titleId} className="text-lg font-semibold">
                {title}
              </h3>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-xl" aria-label="Close">
                ×
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Polished card shell with top blue glow on hover */
function CommitCard({ children }) {
  return (
    <div
      className={[
        "group relative rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-sm",
        "shadow-[0_1px_2px_rgba(2,6,23,.06)] hover:shadow-[0_12px_30px_-8px_rgba(2,6,23,.20)]",
        "transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-200/70",
        "focus-within:ring-2 focus-within:ring-indigo-300/60",
        "before:absolute before:inset-x-0 before:top-0 before:h-1",
        "before:bg-gradient-to-r before:from-indigo-500/0 before:via-indigo-500 before:to-indigo-500/0",
        "before:opacity-0 group-hover:opacity-100 before:transition-opacity",
        "p-4",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Bar({ value = 0, max = 0, hard = false }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  const [w, setW] = React.useState(0);

  React.useEffect(() => {
    setW(0);
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const over = max > 0 && value > max;

  return (
    <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={[
          "h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none",
          over ? "bg-rose-500" : hard ? "bg-sky-500" : "bg-emerald-500",
        ].join(" ")}
        style={{ width: `${w}%` }}
        aria-hidden
      />
      {hard && (
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          aria-hidden
          style={{
            background: "repeating-linear-gradient(45deg, transparent 0 8px, rgba(255,255,255,.5) 8px 16px)",
          }}
        />
      )}
      <span className="sr-only">{Math.round(pct)}% of cap used</span>
    </div>
  );
}

/* ===================== Report Modal ===================== */
function ReportModal({ open, onClose, onGenerate, rowCount }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Generate Commitments Report">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">This will use your current filters and export the visible commitments into a PDF.</p>
        {rowCount > 1500 && (
          <div className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
            Heads-up: {rowCount.toLocaleString()} rows may make the browser slow. Consider narrowing filters.
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className="px-4 py-2 rounded-xl border border-slate-300 bg-white shadow-sm hover:shadow-md" onClick={onClose}>
            Cancel
          </button>
          <button className="px-4 py-2 rounded-xl bg-slate-900 text-white shadow-sm hover:shadow-md" onClick={onGenerate}>
            Generate
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ===================== jsPDF helpers ===================== */
const PUBLIC_LOGO_URL = "/reportLogo.png";

async function loadImageDataURL(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("logo fetch failed");
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
    return dataUrl;
  } catch (e) {
    console.warn("Logo load failed, proceeding without logo:", e);
    return null;
  }
}

function rollup(rows) {
  const count = rows.length;
  const sumCents = rows.reduce((a, r) => a + (r.amountCents || 0), 0);
  const avgCents = count ? Math.round(sumCents / count) : 0;
  return { count, sumCents, avgCents };
}
function makeReportFilename(prefix, filters, ts = new Date()) {
  const parts = [prefix || "Report"];
  if (filters?.accountName) parts.push(filters.accountName.replace(/\s+/g, ""));
  if (filters?.from) parts.push(String(filters.from).slice(0, 10));
  if (filters?.to) parts.push(String(filters.to).slice(0, 10));
  parts.push(ts.toISOString().replace(/[:T]/g, "-").slice(0, 15));
  return parts.filter(Boolean).join("_") + ".pdf";
}

async function generateCommitmentsPDF({
  rows,
  filters,
  title = "Bank Commitment Report",
  logoUrl = PUBLIC_LOGO_URL,
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  // ---------- layout + palette ----------
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const brand = { r: 79, g: 70, b: 229 };          // indigo-600
  const brandLight = { r: 241, g: 245, b: 255 };   // indigo-50
  const slateTxt = 40;
  const slateDim = 100;
  const TOTAL_PAGES_TOKEN = "{total_pages_count_string}";

  // helpers
  const fmtLKR = (n) =>
    (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const humanDateTime = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ---------- footer ----------
  const drawFooter = () => {
    doc.setDrawColor(235).setLineWidth(1);
    doc.line(margin, pageH - 40, pageW - margin, pageH - 40);

    doc.setFontSize(9).setTextColor(120);
    // left: generated timestamp
    doc.text(`Generated: ${humanDateTime}`, margin, pageH - 22);

    // right (shifted a bit LEFT from the edge): page number
    const pageStr = `Page ${doc.internal.getNumberOfPages()} of ${TOTAL_PAGES_TOKEN}`;
    const pageX = pageW - margin - 120; // move 60px left from right margin (tune as needed)
    doc.text(pageStr, pageX, pageH - 22, { align: "right" });

    doc.setTextColor(slateTxt);
  };

  // ---------- header: logo + app name ----------
  const logoData = await loadImageDataURL(logoUrl);
  const logoSize = 46;
  const headerY = margin;

  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", margin, headerY, logoSize, logoSize);
    } catch { /* ignore */ }
  }

  const headerTextX = margin + (logoData ? logoSize + 12 : 0);
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(slateTxt);
  doc.text("My Budget Pal", headerTextX, headerY + 30);

  // separator under header
  const sepY = headerY + logoSize + 12;
  doc.setDrawColor(brand.r, brand.g, brand.b).setLineWidth(2);
  doc.line(margin, sepY, pageW - margin, sepY);

  // ---------- title (no subtitle) ----------
  const titleY = sepY + 28;
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(slateTxt);
  doc.text(title, pageW / 2, titleY, { align: "center" });

  // ---------- soft filter panel ----------
  const filterLines = [
    `Account : ${filters?.accountName || "All Accounts"}`,
    `Range   : ${filters?.from || "…"} – ${filters?.to || "…"}`,
    ...(filters?.status ? [`Status  : ${filters.status}`] : []),
    ...(filters?.q ? [`Search  : "${filters.q}"`] : []),
  ];

  const boxX = margin;
  const boxY = titleY + 20;
  const lineH = 14;
  const boxH = (filterLines.length ? filterLines.length : 1) * lineH + 16;
  const boxW = pageW - margin * 2;

  doc.setDrawColor(230).setFillColor(brandLight.r, brandLight.g, brandLight.b);
  doc.roundedRect(boxX, boxY, boxW, boxH, 6, 6, "F");

  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(100);
  let fy = boxY + 12;
  filterLines.forEach((line) => {
    doc.text(line, boxX + 10, fy + 10);
    fy += lineH;
  });
  doc.setTextColor(slateTxt);

  // subtle side watermark (remove the next two lines if you want it gone)
  doc.setFontSize(10).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
  doc.setTextColor(slateTxt);

  // ---------- table ----------
  const head = [["Name", "Account Name", "Category", "Status", "Date", "Recurring", "Amount (LKR)"]];
  const body = rows.map((r) => [
    r.name || "",
    r.accountName || "",
    r.category || "",
    r.status || "",
    formatDate(r.paidAt || r.dueDate || r.date),
    r.isRecurring ? (r.recurrence?.frequency || "Yes") : "No",
    fmtLKR((r.amountCents || 0) / 100),
  ]);

  autoTable(doc, {
    startY: boxY + boxH + 20,
    head,
    body,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 4,
      lineColor: [230, 230, 230],
      lineWidth: 0.5,
      valign: "middle",
      textColor: [40, 40, 40],
    },
    headStyles: {
      fillColor: [brand.r, brand.g, brand.b],
      textColor: [255, 255, 255],
      halign: "left",
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [247, 248, 250] }, // zebra
    columnStyles: {
      4: { halign: "left" },  // Date
      6: { halign: "right" }, // Amount
    },
    didDrawPage: () => drawFooter(),
  });

  if (typeof doc.putTotalPages === "function") {
    doc.putTotalPages(TOTAL_PAGES_TOKEN);
  }

  // ---------- summary (compact, tight alignment) ----------
  const totals = rollup(rows);
  const afterTableY = doc.lastAutoTable?.finalY ?? (boxY + boxH + 20);
  let y = afterTableY + 30;

  // ensure enough space; push to next page if tight
  const needed = 110; // summary + signature spacing
  if (y + needed > pageH - margin) {
    doc.addPage();
    drawFooter();
    y = margin + 20;
  }

  // Title + top rule
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(slateTxt);
  doc.text("Summary", margin, y);
  y += 10;
  doc.setDrawColor(brand.r, brand.g, brand.b).setLineWidth(1);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

  // Prepare rows
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(60);
  const labelX = margin + 10;
  const rowsSum = [
    ["Items", String(totals.count)],
    ["Total", `LKR ${fmtLKR(totals.sumCents / 100)}`],
    ["Average", `LKR ${fmtLKR(totals.avgCents / 100)}`],
  ];

  // Measure widest label so ":" sits just after it (tight gap)
  const labelWidths = rowsSum.map(([lbl]) => doc.getTextWidth(lbl));
  const maxLabelW = Math.max(...labelWidths);
  const colonX = labelX + maxLabelW + 6;                 // tiny gap after label
  const valueAnchor = Math.min(pageW - margin - 40, colonX + 10 + 180); // compact right column
  const lineGap = 18;

  // Draw rows: label, ":", value (right-aligned to valueAnchor)
  rowsSum.forEach(([label, value]) => {
    doc.text(label, labelX, y);
    doc.text(":", colonX, y);
    doc.text(value, valueAnchor, y, { align: "right" });
    y += lineGap;
  });

  // bottom separator
  doc.setDrawColor(230).setLineWidth(1);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  // ---------- signature (bottom-aligned nicely) ----------
  let sigY = pageH - 68;
  if (sigY - y < 40) {
    doc.addPage();
    drawFooter();
    sigY = pageH - 68;
  }
  doc.setFont("helvetica", "normal").setFontSize(12).setTextColor(slateTxt);
  doc.text("Authorized Signature : ____________________________________", margin, sigY);

  // ---------- save ----------
  const fn = makeReportFilename("CommitmentsReport", filters);
  doc.save(fn);
}

/* ===================== Form (Add/Edit) ===================== */
function CommitmentForm({ open, onClose, onSave, accounts, initial, periodPlan }) {
  const now = new Date();

  // Limits
  const MAX_AMOUNT_CENTS = 9_999_999 * 100;

  // Bubble helper
  const Bubble = ({ show, message }) => (
    <div
      className={
        "pointer-events-none absolute left-0 top-[100%] mt-1 text-xs rounded-lg bg-rose-50 text-rose-700 border border-rose-300 px-2 py-1 shadow-sm transition-opacity duration-150 " +
        (show ? "opacity-100" : "opacity-0")
      }
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
  const bubbleTimerRef = React.useRef(null);
  const [bubble, setBubble] = React.useState({ key: null, msg: "" });
  const showBubble = (key, msg, ms = 1600) => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubble({ key, msg });
    bubbleTimerRef.current = setTimeout(() => setBubble({ key: null, msg: "" }), ms);
  };

  // Local helpers
  const pad = (n) => String(n).padStart(2, "0");
  const ymdLocal = (d) => {
    if (!d) return "";
    const dt = d instanceof Date ? d : new Date(d);
    return `${dt.getFullYear()}-${dt.getMonth() + 1 < 10 ? "0" : ""}${dt.getMonth() + 1}-${pad(dt.getDate())}`;
  };
  const parseYmd = (s) => {
    if (!s) return null;
    const [Y, M, D] = String(s).split("-").map(Number);
    if (!Y || !M || !D) return null;
    return new Date(Y, M - 1, D);
  };

  // Month boundaries (local)
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const nextLast = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const minThisMonth = ymdLocal(first);
  const maxThisMonth = ymdLocal(last);
  const maxNextMonth = ymdLocal(nextLast);
  const todayYmd = ymdLocal(today);

  // Amount formatting
  const formatCommas = (s, keepTrailingDot = false) => {
    if (!s) return "";
    s = s.replace(/[^0-9.]/g, "");
    const parts = s.split(".");
    const intP = parts[0] ?? "0";
    const decP = parts[1] ?? "";
    const intClean = (intP || "0").replace(/^0+(?=\d)/, "") || "0";
    const withCommas = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (keepTrailingDot) return `${withCommas}.`
    return decP !== "" ? `${withCommas}.${decP}` : withCommas;
  };
  const cleanAmount = (s) => (s || "").replace(/,/g, "");
  const moneyRegex = /^\d{0,15}(\.\d{0,2})?$/;

  const moneyToCents = (s) => {
    const raw = cleanAmount(s);
    if (!raw || !moneyRegex.test(raw)) return 0;
    const [i, d = ""] = raw.split(".");
    const dec = d.padEnd(2, "0").slice(0, 2);
    return Number(i || "0") * 100 + Number(dec || "0");
  };

  const clampAmountToMax = (raw) => {
    const cents = moneyToCents(raw);
    if (cents > 9_999_999 * 100) {
      showBubble("amount", "Maximum is LKR 9,999,999.00");
      return "9,999,999.00";
    }
    return null;
  };

  const setRecurrence = (patch) => setF((prev) => ({ ...prev, recurrence: { ...prev.recurrence, ...patch } }));

  // State
  const [f, setF] = React.useState({
    _id: null,
    accountId: accounts[0]?._id || "",
    name: "",
    category: "Loan",
    amount: "",
    currency: "LKR",
    dueDate: ymdLocal(now),
    status: "pending",
    paidAt: "",
    isRecurring: false,
    recurrence: { frequency: "monthly", interval: 1, startDate: ymdLocal(now), byWeekday: [], byMonthDay: [] },
    endChoice: "never",
    remaining: "",
    endDate: "",
  });

  React.useEffect(() => {
    if (!open) return;
    if (initial) {
      const rec = initial.recurrence || {};
      const endChoice = rec.endDate ? "date" : Number.isInteger(rec.remaining) ? "count" : "never";
      const initialAmount =
        typeof fromCents === "function" ? String(fromCents(initial.amountCents || 0)) : String((initial.amountCents || 0) / 100);

      setF({
        _id: initial._id,
        accountId: initial.accountId,
        name: initial.name || "",
        category: initial.category || "Loan",
        amount: formatCommas(initialAmount),
        currency: initial.currency || "LKR",
        dueDate: ymdLocal(initial.dueDate || initial.paidAt || now),
        status: initial.status || "pending",
        paidAt: initial.paidAt ? ymdLocal(initial.paidAt) : "",
        isRecurring: !!initial.isRecurring,
        recurrence: {
          frequency: rec.frequency || "monthly",
          interval: Math.min(12, rec.interval || 1),
          startDate: ymdLocal(rec.startDate || initial.dueDate || now),
          byWeekday: Array.isArray(rec.byWeekday) ? rec.byWeekday : [],
          byMonthDay: Array.isArray(rec.byMonthDay) ? rec.byMonthDay : [],
        },
        endChoice,
        remaining: Number.isInteger(rec.remaining) ? String(rec.remaining) : "",
        endDate: rec.endDate ? ymdLocal(rec.endDate) : "",
      });
    } else {
      setF((d) => ({ ...d, accountId: accounts[0]?._id || d.accountId }));
    }
  }, [open, initial, accounts]);

  // Derived
  const getAccount = (id) => accounts.find((a) => a._id === id);
  const currentBalanceCents = Number(getAccount(f.accountId)?.balanceCents || 0);
  const wantToPay = f.status === "paid";

  const amountCents = moneyToCents(f.amount);
  const wouldGoNegative = wantToPay && amountCents > currentBalanceCents;

  const plan = periodPlan;
  const commitCap = Number(plan?.commitments?.amount || 0);
  const commitCapCents = toCents(commitCap);
  const usedCents = Number(plan?._usedCommitmentsCents || 0);

  const wouldBreachHardCap =
    !!plan?.commitments?.hardCap &&
    wantToPay &&
    isInPeriod(f.paidAt || f.dueDate, plan?.period) &&
    usedCents + amountCents > commitCapCents;

  // Name
  const onNameKeyDown = (e) => {
    const allowed = /^[A-Za-z\s]$/;
    if (e.key.length === 1 && !allowed.test(e.key)) {
      e.preventDefault();
      showBubble("name", "Letters and spaces only.");
    }
  };
  const onNameChange = (e) => {
    const v = e.target.value;
    if (/^[A-Za-z\s]*$/.test(v)) setF({ ...f, name: v });
    else showBubble("name", "Letters and spaces only.");
  };
  const onNamePaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!/^[A-Za-z\s]*$/.test(text)) {
      e.preventDefault();
      showBubble("name", "Letters and spaces only.");
    }
  };

  // Amount handlers
  const onAmountKeyDown = (e) => {
    if (["-", "e", "E", "+", " "].includes(e.key)) {
      e.preventDefault();
      showBubble("amount", "Positive number, up to 2 decimals.");
    }
  };
  const onAmountPaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    const raw = (text || "").replace(/,/g, "").replace(/[^\d.]/g, "");
    const moneyRegexLocal = /^\d{0,15}(\.\d{0,2})?$/;
    if (!moneyRegexLocal.test(raw)) {
      e.preventDefault();
      showBubble("amount", "Invalid amount format.");
      return;
    }
    const clamped = clampAmountToMax(raw);
    if (clamped !== null) {
      e.preventDefault();
      setF({ ...f, amount: formatCommas(clamped) });
    }
  };
  const onAmountChange = (e) => {
    const raw = (e.target.value || "").replace(/,/g, "");
    if (raw === "") {
      setF({ ...f, amount: "" });
      return;
    }
    if (!/^\d*\.?\d*$/.test(raw)) {
      showBubble("amount", "Only digits and one dot.");
      return;
    }
    if (raw.startsWith(".")) {
      showBubble("amount", "Start with a number (e.g., 0.50).");
      return;
    }
    const [intPart, decPart = ""] = raw.split(".");
    if (decPart.length > 2) {
      showBubble("amount", "Up to 2 decimal places only.");
      return;
    }

    const centsCandidate = moneyToCents(raw);
    if (centsCandidate > MAX_AMOUNT_CENTS) {
      setF({ ...f, amount: "9,999,999.00" });
      showBubble("amount", "Maximum is LKR 9,999,999.00");
      return;
    }

    const keepDot = raw.endsWith(".") && raw.includes(".") && decPart.length === 0;
    setF({ ...f, amount: formatCommas(raw, keepDot) });
  };
  const onAmountBlur = () => {
    const raw = (f.amount || "").replace(/,/g, "");
    if (!raw) return;

    let [i = "0", d = ""] = raw.split(".");
    if (d.length === 0) d = "00";
    else if (d.length === 1) d = d + "0";
    let fixed = `${String(Number(i)).replace(/^0+(?=\d)/, "") || "0"}.${d.slice(0, 2)}`;

    const clamped = clampAmountToMax(fixed);
    if (clamped !== null) fixed = clamped;

    setF((prev) => ({ ...prev, amount: formatCommas(fixed) }));
  };

  // Dates
  const onPaidAtChange = (e) => {
    const d = parseYmd(e.target.value);
    if (!d) return;
    if (d < first) {
      showBubble("paidAt", "Paid date must be within this month.");
      setF({ ...f, paidAt: ymd(first) });
      return;
    }
    if (d > new Date()) {
      showBubble("paidAt", "Paid date can't be in the future.");
      setF({ ...f, paidAt: ymd(new Date()) });
      return;
    }
    setF({ ...f, paidAt: ymd(d) });
  };

  const onDueChange = (e) => {
    const d = parseYmd(e.target.value);
    if (!d) return;
    const today = new Date();
    const nextLast = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    if (d < today) {
      showBubble("dueDate", "Due date can't be in the past.");
      setF({ ...f, dueDate: ymd(today) });
      return;
    }
    if (d > nextLast) {
      showBubble("dueDate", "Due date must be within this or next month.");
      setF({ ...f, dueDate: ymd(nextLast) });
      return;
    }
    setF({ ...f, dueDate: ymd(d) });
  };

  const onStartDateChange = (e) => {
    const d = parseYmd(e.target.value);
    if (!d) return;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    if (d < first) {
      showBubble("startDate", "Start date must be within this month.");
      setRecurrence({ startDate: ymd(first) });
      return;
    }
    if (d > last) {
      showBubble("startDate", "Start date must be within this month.");
      setRecurrence({ startDate: ymd(last) });
      return;
    }
    setRecurrence({ startDate: ymd(d) });
  };

  const onEndDateChange = (e) => {
    const d = parseYmd(e.target.value);
    if (!d) return;
    const today = new Date();
    if (d < today) {
      showBubble("endDate", "End date must be today or a future date.");
      setF({ ...f, endDate: ymd(today) });
      return;
    }
    setF({ ...f, endDate: ymd(d) });
  };

  const onIntervalChange = (e) => {
    const v = e.target.value.replace(/[^\d]/g, "");
    if (v === "") {
      setRecurrence({ interval: "" });
      return;
    }
    let n = Math.max(1, parseInt(v, 10));
    if (n > 12) {
      n = 12;
      showBubble("interval", "Maximum interval is 12");
    }
    setRecurrence({ interval: n });
  };
  const onRemainingChange = (e) => {
    const v = e.target.value.replace(/[^\d]/g, "");
    if (v === "") {
      setF({ ...f, remaining: "" });
      return;
    }
    setF({ ...f, remaining: String(Math.max(1, parseInt(v, 10))) });
  };

  // Submit
  const submit = async (e) => {
    e.preventDefault();

    if (!f.name || !/^[A-Za-z\s]+$/.test(f.name)) {
      showBubble("name", "Enter a valid name (letters & spaces).");
      return;
    }
    if (moneyToCents(f.amount) <= 0) {
      showBubble("amount", "Enter a positive amount with up to 2 decimals.");
      return;
    }
    if (moneyToCents(f.amount) > MAX_AMOUNT_CENTS) {
      showBubble("amount", "Maximum is LKR 9,999,999.00");
      setF((prev) => ({ ...prev, amount: "9,999,999.00" }));
      return;
    }

    if (f.status === "paid") {
      const d = parseYmd(f.paidAt || ymd(new Date()));
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      if (!d || d < monthStart || d > new Date()) {
        showBubble("paidAt", "Paid date must be this month and not in the future.");
        return;
      }
    } else {
      const d = parseYmd(f.dueDate || ymd(new Date()));
      const today = new Date();
      const nextLast = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      if (!d || d < today || d > nextLast) {
        showBubble("dueDate", "Due date must be within this or next month and not in the past.");
        return;
      }
    }

    if (f.isRecurring) {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const sd = parseYmd(f.recurrence.startDate);
      if (!sd || sd < first || sd > last) {
        showBubble("startDate", "Start date must be within this month.");
        return;
      }
      const intervalNum = Number(f.recurrence.interval);
      if (!Number.isInteger(intervalNum) || intervalNum < 1 || intervalNum > 12) {
        showBubble("interval", "Interval must be 1–12.");
        return;
      }
      if (f.endChoice === "count") {
        if (!Number.isInteger(Number(f.remaining)) || Number(f.remaining) < 1) {
          showBubble("remaining", "Occurrences must be a positive whole number.");
          return;
        }
      }
      if (f.endChoice === "date" && f.endDate) {
        const ed = parseYmd(f.endDate);
        if (!ed || ed < new Date()) {
          showBubble("endDate", "End date must be today or a future date.");
          return;
        }
      }
    }

    if (wouldGoNegative) {
      showBubble("amount", "Insufficient funds in the selected account.");
      return;
    }
    if (wouldBreachHardCap) {
      showBubble("amount", "Exceeds Commitments hard cap for this month.");
      return;
    }

    await onSave(f._id, {
      accountId: f.accountId,
      name: f.name,
      category: f.category,
      amountCents: moneyToCents(f.amount),
      currency: f.currency,
      dueDate: parseYmd(f.dueDate) || new Date(f.dueDate),
      status: f.status,
      paidAt: f.status === "paid" && f.paidAt ? parseYmd(f.paidAt) || new Date(f.paidAt) : undefined,
      isRecurring: f.isRecurring,
      recurrence: f.isRecurring
        ? {
            frequency: f.recurrence.frequency,
            interval: Number(f.recurrence.interval || 1),
            startDate: parseYmd(f.recurrence.startDate) || new Date(f.recurrence.startDate || f.dueDate),
            byWeekday: f.recurrence.byWeekday,
            byMonthDay: f.recurrence.byMonthDay,
            ...(f.endChoice === "count" ? { remaining: Number(f.remaining || 0) } : {}),
            ...(f.endChoice === "date"
              ? { endDate: f.endDate ? (parseYmd(f.endDate) || new Date(f.endDate)) : undefined }
              : {}),
          }
        : undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={f._id ? "Edit Commitment" : "Add Commitment"}>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Account" required>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.accountId}
              onChange={(e) => setF({ ...f, accountId: e.target.value })}
            >
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} {a.archived ? "(archived)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Available balance: {LKR.format(Number(getAccount(f.accountId)?.balanceCents || 0) / 100)}
            </p>
          </Field>

          <Field label="Category">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
            >
              <option>Loan</option>
              <option>Credit Card</option>
              <option>Insurance</option>
              <option>Bill</option>
              <option>Other</option>
            </select>
          </Field>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Name" required>
            <div className="relative">
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={f.name}
                onKeyDown={onNameKeyDown}
                onChange={onNameChange}
                onPaste={onNamePaste}
                placeholder="e.g. Insurance Premium"
              />
              <Bubble show={bubble.key === "name"} message={bubble.msg} />
            </div>
          </Field>

          <Field label="Amount" required>
            <div className="relative">
              <input
                inputMode="decimal"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={f.amount}
                onKeyDown={onAmountKeyDown}
                onChange={onAmountChange}
                onPaste={onAmountPaste}
                onBlur={onAmountBlur}
                placeholder="e.g. 100,000.00"
              />
              <Bubble show={bubble.key === "amount"} message={bubble.msg} />
              <p className="text-xs text-slate-500 mt-1">Positive number (max LKR 9,999,999.00), comma-grouped, up to 2 decimals.</p>
            </div>
          </Field>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Status" required>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </Field>

          {f.status === "paid" ? (
            <Field label="Paid at" required>
              <div className="relative">
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={f.paidAt || ymd(new Date())}
                  min={ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                  max={ymd(new Date())}
                  onChange={onPaidAtChange}
                />
                <Bubble show={bubble.key === "paidAt"} message={bubble.msg} />
              </div>
            </Field>
          ) : (
            <Field label="Due date" required>
              <div className="relative">
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={f.dueDate}
                  min={ymd(new Date())}
                  max={ymd(new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0))}
                  onChange={onDueChange}
                />
                <Bubble show={bubble.key === "dueDate"} message={bubble.msg} />
              </div>
            </Field>
          )}

          <Field label="Currency">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
              value={f.currency || "LKR"}
              readOnly
              disabled
              title="Currency is fixed"
            />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <input id="rec" type="checkbox" checked={f.isRecurring} onChange={(e) => setF({ ...f, isRecurring: e.target.checked })} />
          <label htmlFor="rec" className="text-sm text-slate-700">
            Make this recurring
          </label>
        </div>

        {f.isRecurring && (
          <div className="grid gap-4 p-3 rounded-xl border border-slate-200">
            <div className="grid md:grid-cols-4 gap-4">
              <Field label="Frequency" required>
                <select
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  value={f.recurrence.frequency}
                  onChange={(e) => setRecurrence({ frequency: e.target.value })}
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                  <option value="yearly">Yearly</option>
                </select>
              </Field>

              <Field label="Interval" required>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max={12}
                    step="1"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={f.recurrence.interval}
                    onKeyDown={(e) => {
                      if (["-", "e", "E", "+", ".", ","].includes(e.key)) {
                        e.preventDefault();
                        showBubble("interval", "Positive whole numbers only.");
                      }
                    }}
                    onChange={onIntervalChange}
                    placeholder="1"
                  />
                  <Bubble show={bubble.key === "interval"} message={bubble.msg} />
                </div>
              </Field>

              <Field label="Start date" required>
                <div className="relative">
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={f.recurrence.startDate}
                    min={ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                    max={ymd(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))}
                    onChange={onStartDateChange}
                  />
                  <Bubble show={bubble.key === "startDate"} message={bubble.msg} />
                </div>
              </Field>

              <Field label={f.recurrence.frequency === "weekly" ? "Weekdays (0–6)" : "Days of month"}>
                {f.recurrence.frequency === "weekly" ? (
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="1,3,5"
                    value={(f.recurrence.byWeekday || []).join(",")}
                    onChange={(e) =>
                      setRecurrence({
                        byWeekday: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map(Number)
                          .filter(Number.isInteger)
                          .filter((n) => n >= 0 && n <= 6),
                      })
                    }
                  />
                ) : (
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="1,15,28"
                    value={(f.recurrence.byMonthDay || []).join(",")}
                    onChange={(e) =>
                      setRecurrence({
                        byMonthDay: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map(Number)
                          .filter(Number.isInteger)
                          .filter((n) => n >= 1 && n <= 31),
                      })
                    }
                  />
                )}
              </Field>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Ends">
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="endChoice"
                      checked={f.endChoice === "never"}
                      onChange={() => setF({ ...f, endChoice: "never" })}
                    />
                    <span className="text-sm">Never</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="endChoice"
                      checked={f.endChoice === "count"}
                      onChange={() => setF({ ...f, endChoice: "count" })}
                    />
                    <span className="text-sm">After</span>
                    <div className="relative">
                      <input
                        disabled={f.endChoice !== "count"}
                        type="number"
                        min="1"
                        step="1"
                        className="w-24 rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        value={f.remaining}
                        onKeyDown={(e) => {
                          if (["-", "e", "E", "+", ".", ","].includes(e.key)) {
                            e.preventDefault();
                            showBubble("remaining", "Positive whole numbers only.");
                          }
                        }}
                        onChange={onRemainingChange}
                      />
                      <Bubble show={bubble.key === "remaining"} message={bubble.msg} />
                    </div>
                    <span className="text-sm">occurrences</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="endChoice"
                      checked={f.endChoice === "date"}
                      onChange={() => setF({ ...f, endChoice: "date" })}
                    />
                    <span className="text-sm">On</span>
                    <div className="relative">
                      <input
                        disabled={f.endChoice !== "date"}
                        type="date"
                        className="rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        value={f.endDate}
                        min={ymd(new Date())}
                        onChange={onEndDateChange}
                      />
                      <Bubble show={bubble.key === "endDate"} message={bubble.msg} />
                    </div>
                  </label>
                </div>
              </Field>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className={`px-4 py-2 rounded-xl text-white shadow-sm hover:shadow-md ${
              wouldGoNegative || wouldBreachHardCap ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
            disabled={wouldGoNegative || wouldBreachHardCap}
          >
            Save
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white shadow-sm hover:shadow-md"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ===================== Page ===================== */
export default function BankCommitmentsPage() {
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({ accountId: "", status: "", from: "", to: "", q: "" });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const period = thisPeriod();
  const [plan, setPlan] = useState(null);

  const load = async () => {
    setErr("");
    try {
      const [acc, list, bp] = await Promise.all([Accounts.list(), Commitments.list(), Budget.getPlan(period)]);
      setAccounts(acc);
      setItems(list);
      setPlan(bp);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usedCommitmentsCents = useMemo(() => {
    return items
      .filter((t) => t.status === "paid" && isInPeriod(t.paidAt || t.dueDate, period))
      .reduce((sum, t) => sum + (t.amountCents || 0), 0);
  }, [items, period]);

  const pendingCommitmentsCents = useMemo(() => {
    return items
      .filter((t) => t.status === "pending" && isInPeriod(t.dueDate, period))
      .reduce((sum, t) => sum + (t.amountCents || 0), 0);
  }, [items, period]);

  const planWithUsage = useMemo(() => {
    if (!plan) return null;
    return {
      ...plan,
      _usedCommitmentsCents: usedCommitmentsCents,
      _pendingCommitmentsCents: pendingCommitmentsCents,
    };
  }, [plan, usedCommitmentsCents, pendingCommitmentsCents]);

  const onSave = async (id, body) => {
    try {
      if (id) await Commitments.update(id, body);
      else await Commitments.create(body);
      setOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this commitment?")) return;
    await Commitments.remove(id);
    await load();
  };

  const sanitizedQuery = (s) =>
    String(s || "")
      .replace(/[^\x20-\x7E]/g, "") // allow any printable ASCII (letters/digits/special)
      .replace(/\s{2,}/g, " ")      // collapse spaces
      .trimStart();

  const filtered = useMemo(() => {
    return items.filter((t) => {
      const okAcc = !filters.accountId || t.accountId === filters.accountId;
      const okStatus = !filters.status || t.status === filters.status;
      const dt = new Date(t.status === "paid" ? t.paidAt || t.dueDate : t.dueDate);
      const okFrom = !filters.from || dt >= new Date(filters.from);
      const okTo = !filters.to || dt <= new Date(filters.to);

            const qSan = sanitizedQuery(filters.q);
      let okQ = true;
      if (qSan) {
        const lettersOnly = /^[A-Za-z\s]+$/.test(qSan);
        if (lettersOnly) {
          const nameOnly = String(t.name || "").trimStart().toLowerCase();
          okQ = nameOnly.startsWith(qSan.toLowerCase());
        } else {
          okQ = false; // digits/special present → intentionally no matches
        }
      }
return okAcc && okStatus && okFrom && okTo && okQ;
    });
  }, [items, filters]);

  const upcoming = useMemo(() => filtered.filter((t) => t.status === "pending"), [filtered]);
  const paid = useMemo(() => filtered.filter((t) => t.status === "paid"), [filtered]);
  const accName = (id) => accounts.find((a) => a._id === id)?.name || "Account";

  const capR = Number(plan?.commitments?.amount || 0);
  const capC = toCents(capR);
  const usedR = usedCommitmentsCents / 100;
  const pendingR = pendingCommitmentsCents / 100;
  const remainingC = Math.max(0, capC - usedCommitmentsCents);
  const projectedOver = Math.max(0, usedCommitmentsCents + pendingCommitmentsCents - capC);

  const currentFilters = {
    ...filters,
    accountName: filters.accountId ? accName(filters.accountId) : "All Accounts",
  };

  const filteredTotalCents = useMemo(
    () => filtered.reduce((s, r) => s + (r.amountCents || 0), 0),
    [filtered]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900 py-8">
      <div className="mx-auto max-w-6xl px-4">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600">
              Bank Commitments
            </h1>
          </div>
          <div className="flex gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-900 shadow-sm hover:shadow-md"
              onClick={() => setReportOpen(true)}
            >
              <FileText className="w-4 h-4" />
              <span>Generate report</span>
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2 shadow-sm hover:shadow-md"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Commitment</span>
            </button>
          </div>
        </header>

        {/* Budget overview */}
        <section className="mb-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium">
                Commitments Budget — <span className="text-slate-600">{period}</span>
              </div>
              {plan?.commitments?.hardCap && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-700">Hard Cap</span>
              )}
            </div>

            <div className="grid md:grid-cols-4 gap-4 mb-3">
              <div>
                <div className="text-xs text-slate-500">Budget</div>
                <div className="text-slate-900 font-semibold">{LKR.format(capR)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Used (paid)</div>
                <div className="text-slate-900 font-semibold">{LKR.format(usedR)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Pending (this month)</div>
                <div className="text-slate-900 font-semibold">{LKR.format(pendingR)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Remaining</div>
                <div className="text-slate-900 font-semibold">{LKR.format(remainingC / 100)}</div>
              </div>
            </div>

            <Bar value={usedCommitmentsCents} max={capC} hard={!!plan?.commitments?.hardCap} />

            {projectedOver > 0 && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Projected with pending: <b>{LKR.format((usedCommitmentsCents + pendingCommitmentsCents) / 100)}</b> — over by{" "}
                {LKR.format(projectedOver / 100)}
              </div>
            )}

            {!plan && (
              <div className="mt-2 text-xs text-slate-600">
                No budget plan found for {period}. Create one under <b>Budget &gt; Plans</b> to track caps.
              </div>
            )}
          </div>
        </section>

        {/* Filters */}
        <div className="grid md:grid-cols-5 gap-3 mb-6">
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
          <Field label="Status">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
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
          <Field label="Search" hint="type anything · FILTER applies ONLY for letters (name starts with). digits/special → no matches">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="name/category"
              value={filters.q}
              onKeyDown={(e) => {
                // allow all printable keys; keep navigation keys working
                const ctrl = ["Backspace","Delete","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","Tab"];
                if (ctrl.includes(e.key)) return;
                // do not block digits/special; filtering will handle logic
              }}
              onChange={(e) => setFilters({ ...filters, q: sanitizedQuery(e.target.value) })}
            />
          </Field>
        </div>

        {/* Upcoming cards */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-slate-700">
            <Clock className="w-5 h-5 text-orange-500" />
            Upcoming
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {upcoming.length === 0 && <div className="text-slate-500 italic">No upcoming payments.</div>}

            {upcoming.map((t) => (
              <CommitCard key={t._id}>
                {/* Top row */}
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-800 flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-slate-500" />
                    {accName(t.accountId)}
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700 self-start">Pending</span>
                </div>

                {/* Title */}
                <div className="mt-1 text-slate-900 font-semibold leading-tight">{t.name}</div>

                {/* Meta row */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-900 font-medium">{LKR.format((t.amountCents || 0) / 100)}</span>
                  <div className="text-slate-600 text-sm flex items-center gap-2">
                    <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                    <span>Due {new Date(t.dueDate).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex justify-end gap-2 text-sm">
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
                    onClick={() => {
                      setEditing(t);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-red-300 text-red-600 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition hover:bg-red-50"
                    onClick={() => onDelete(t._id)}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </CommitCard>
            ))}
          </div>
        </section>

        {/* Completed cards */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-slate-700">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Completed
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {paid.length === 0 && <div className="text-slate-500 italic">No completed payments.</div>}

            {paid.map((t) => (
              <CommitCard key={t._id}>
                {/* Top row */}
                <div className="flex items-center justify-between">
                  <div className="font-medium text-slate-800 flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-slate-500" />
                    {accName(t.accountId)}
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 self-start">Paid</span>
                </div>

                {/* Title */}
                <div className="mt-1 text-slate-900 font-semibold leading-tight">{t.name}</div>

                {/* Meta row */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-900 font-medium">{LKR.format((t.amountCents || 0) / 100)}</span>
                  <div className="text-slate-600 text-sm">
                    Paid {formatDate(t.paidAt || t.dueDate)}
                    {t.dueDate ? <span className="text-slate-400"> • </span> : null}
                    {t.dueDate ? <span>Due {formatDate(t.dueDate)}</span> : null}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex justify-end gap-2 text-sm">
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
                    onClick={() => {
                      setEditing(t);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                  <button
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-red-300 text-red-600 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition hover:bg-red-50"
                    onClick={() => onDelete(t._id)}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </CommitCard>
            ))}
          </div>
        </section>

        {/* ===================== POLISHED TABLE ===================== */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
            <div className="text-sm text-slate-600">
              Showing <b>{filtered.length}</b> item{filtered.length !== 1 ? "s" : ""} — Total{" "}
              <b>{LKR.format(filteredTotalCents / 100)}</b>
            </div>
            {err && (
              <div className="px-3 py-1.5 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
                {err}
              </div>
            )}
          </div>

          {/* Table container for responsive scroll */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <colgroup>
                <col className="w-[120px]" />
                <col />
                <col className="w-[140px]" />
                <col className="w-[180px]" />
                <col className="w-[140px]" />
                <col className="w-[120px]" />
                <col className="w-[160px]" />
              </colgroup>

              <thead className="bg-slate-100/70 text-slate-900 sticky top-0 z-10">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Name</th>
                  <th className="px-3 py-2 text-left font-semibold">Category</th>
                  <th className="px-3 py-2 text-left font-semibold">Account</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500 italic">
                      No commitments match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((t, i) => (
                    <tr
                      key={t._id}
                      className={`transition-colors ${i % 2 ? "bg-white" : "bg-slate-50/60"} hover:bg-indigo-50/70`}
                    >
                      <td className="px-3 py-2 text-slate-700">
                        {formatDate(t.status === "paid" ? t.paidAt || t.dueDate : t.dueDate)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{t.name}</div>
                        <div className="text-xs text-slate-500">
                          {t.isRecurring ? (t.recurrence?.frequency || "Recurring") : "One-time"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{t.category}</td>
                      <td className="px-3 py-2 text-slate-700">{accName(t.accountId)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">
                        {LKR.format((t.amountCents || 0) / 100)}
                      </td>
                      <td className="px-3 py-2">
                        {t.status === "paid" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700 border border-orange-200">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <button
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            onClick={() => {
                              setEditing(t);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                            <span>Edit</span>
                          </button>
                          <button
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 bg-white text-red-600 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"
                            onClick={() => onDelete(t._id)}
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Footer with totals */}
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100/70 border-t border-slate-200">
                    <td className="px-3 py-2 text-left text-sm text-slate-600" colSpan={4}>
                      {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900">
                      {LKR.format(filteredTotalCents / 100)}
                    </td>
                    <td className="px-3 py-2" colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Modals */}
        <CommitmentForm
          open={open}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSave={onSave}
          accounts={accounts}
          initial={editing}
          periodPlan={planWithUsage}
        />

        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          rowCount={filtered.length}
          onGenerate={async () => {
            await generateCommitmentsPDF({
              rows: filtered.map((r) => ({ ...r, accountName: accName(r.accountId) })),
              filters: currentFilters,
            });
            setReportOpen(false);
          }}
        />
      </div>
    </div>
  );
}
