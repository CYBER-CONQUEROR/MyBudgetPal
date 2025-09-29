// src/pages/bank.js
import { Clock, CheckCircle2, Pencil, Trash2, CalendarDays, Banknote } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import api from "../api/api.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ===================== API ===================== */
const Accounts = {
  list: () => api.get("accounts", { params: { includeArchived: "false" } }).then(r => r.data),
};
const Commitments = {
  list: (p = {}) => api.get("commitments", { params: p }).then(r => r.data),
  create: (b) => api.post("commitments", b).then(r => r.data),
  update: (id, b) => api.put(`commitments/${id}`, b).then(r => r.data),
  remove: (id) => api.delete(`commitments/${id}`).then(r => r.data),
};
const Budget = {
  getPlan: (period) => api.get(`budget/plans/${period}`).then(r => r.data).catch((e) => {
    if (e?.response?.status === 404) return null; // no plan for this month
    throw e;
  }),
};

/* ===================== helpers ===================== */
const LKR = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const toCents = (n) => Math.round(Number(n || 0) * 100);
const fromCents = (c) => (Number(c || 0) / 100).toFixed(2);
const ymd = (x) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const cents = (n) => Math.round(Number(n || 0) * 100);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
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
const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString() : "";

/* ===================== small UI bits ===================== */
function Field({ label, required, children, hint }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
        {label}{required && <span className="text-red-500">*</span>}
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
    document.body.style.overflow = "hidden"; // lock page scroll
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Scrollable overlay */}
      <div className="fixed inset-0 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full items-center justify-center p-4">
          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`relative w-full ${wide ? "max-w-5xl" : "max-w-2xl"} rounded-2xl bg-white shadow-xl border border-slate-200 flex flex-col max-h-[90vh]`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header (fixed) */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <h3 id={titleId} className="text-lg font-semibold">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="text-slate-500 hover:text-slate-700 text-xl"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Content (scrolls) */}
            <div className="p-5 overflow-y-auto">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar({ value = 0, max = 0, hard = false }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  const [w, setW] = React.useState(0);

  // Animate on mount & when "value/max" changes
  React.useEffect(() => {
    // Start at 0, then jump to target on next frame
    setW(0);
    const id = requestAnimationFrame(() => setW(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const over = max > 0 && value > max;

  return (
    <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden">
      {/* Fill */}
      <div
        className={[
          "h-full rounded-full",
          "transition-[width] duration-700 ease-out",
          "motion-reduce:transition-none",
          over
            ? "bg-rose-500"
            : hard
              ? "bg-sky-500"
              : "bg-emerald-500",
        ].join(" ")}
        style={{ width: `${w}%` }}
        aria-hidden
      />

      {/* Subtle hard-cap hatch overlay */}
      {hard && (
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          aria-hidden
          style={{
            // light hatch pattern; very subtle
            background:
              "repeating-linear-gradient(45deg, transparent 0 8px, rgba(255,255,255,.5) 8px 16px)",
          }}
        />
      )}

      {/* A11y text */}
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
          <button className="px-4 py-2 rounded-xl border border-slate-300" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded-xl bg-slate-900 text-white" onClick={onGenerate}>Generate</button>
        </div>
      </div>
    </Modal>
  );
}

/* ===================== jsPDF helpers ===================== */
const PUBLIC_LOGO_URL = "/reportLogo.png"; // file should live in /public

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
  if (filters?.accountName) parts.push(filters.accountName.replace(/\s+/g, ''));
  if (filters?.from) parts.push(String(filters.from).slice(0, 10));
  if (filters?.to) parts.push(String(filters.to).slice(0, 10));
  parts.push(ts.toISOString().replace(/[:T]/g, '-').slice(0, 15));
  return parts.filter(Boolean).join('_') + ".pdf";
}

async function generateCommitmentsPDF({ rows, filters, title = "Bank Commitment Report", logoUrl = PUBLIC_LOGO_URL }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header: logo + brand
  const logoData = await loadImageDataURL(logoUrl);
  let y = margin;

  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", margin, y - 6, 46, 46);
    } catch (e) {
      console.warn("Logo draw failed:", e);
    }
  }
  // Brand name bigger
  doc.setFont("helvetica", "bold").setFontSize(22).text("My Budget Pal", margin + 56, y + 20);
  // Title with extra spacing below brand
  const titleY = y + 56;
  doc.setFont("helvetica", "normal").setFontSize(20).text(title, margin, titleY);

  // Filters: one per line (Account, Range, Status, Search)
  const filterLines = [
    `Account: ${filters?.accountName || "All Accounts"}`,
    `Range: ${filters?.from || "…"} – ${filters?.to || "…"}`,
    ...(filters?.status ? [`Status: ${filters.status}`] : []),
    ...(filters?.q ? [`Search: "${filters.q}"`] : []),
  ];
  let fy = titleY + 18;
  doc.setFontSize(11).setTextColor(100);
  filterLines.forEach((line) => { doc.text(line, margin, fy); fy += 14; });
  doc.setTextColor(0);

  // Left vertical caption
  doc.setFontSize(10).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
  doc.setTextColor(0);

  // Table
  const head = [["Name", "Account Name", "Category", "Status", "Date", "Recurring", "Amount (LKR)"]];
  const body = rows.map(r => [
    r.name || "",
    r.accountName || "",
    r.category || "",
    r.status || "",
    formatDate(r.paidAt || r.dueDate || r.date),
    r.isRecurring ? (r.recurrence?.frequency || "Yes") : "No",
    (r.amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })
  ]);

  autoTable(doc, {
    startY: fy + 6,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [242, 246, 252], textColor: 40 },
    didDrawPage: () => {
      const str = `Page ${doc.internal.getNumberOfPages()}`;
      doc.setFontSize(9);
      doc.text(str, pageW - margin, pageH - 16, { align: "right" });
    }
  });

  // KPIs: three separate lines (Count, Total, Average)
  const totals = rollup(rows);
  const afterTableY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY : (fy + 6);
  let ky = afterTableY + 18;
  doc.setFontSize(11);
  doc.text(`Items: ${totals.count}`, margin, ky); ky += 14;
  doc.text(`Total: LKR ${(totals.sumCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, margin, ky); ky += 14;
  doc.text(`Average: LKR ${(totals.avgCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, margin, ky);

  const sigY = pageH - 60; // 60pt from bottom of page
  doc.setFontSize(12).setFont("helvetica", "normal");
  doc.text("Signature : ...........................................", margin, sigY);

  const fn = makeReportFilename("CommitmentsReport", filters);
  doc.save(fn);
}

/* ===================== Form (Add/Edit) ===================== */
function CommitmentForm({ open, onClose, onSave, accounts, initial, periodPlan }) {
  const now = new Date();

  /* =========================
     Limits
     ========================= */
  const MAX_AMOUNT_CENTS = 9_999_999 * 100; // 9,999,999.00 -> 999,999,900
  const MAX_INTERVAL = 12;

  /* =========================
     Tiny inline message bubble
     ========================= */
  const Bubble = ({ show, message }) => (
    <div
      className={
        "pointer-events-none absolute left-0 top-[100%] mt-1 text-xs rounded-lg " +
        "bg-rose-50 text-rose-700 border border-rose-300 px-2 py-1 shadow-sm " +
        "transition-opacity duration-150 " + (show ? "opacity-100" : "opacity-0")
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

  /* =========================
     Helpers (local)
     ========================= */
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => {
    if (!d) return "";
    const dt = (d instanceof Date) ? d : new Date(d);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  };
  // Parse "YYYY-MM-DD" as LOCAL time
  const parseYmd = (s) => {
    if (!s) return null;
    const [Y, M, D] = String(s).split("-").map(Number);
    if (!Y || !M || !D) return null;
    return new Date(Y, M - 1, D);
  };

  // month boundaries (local)
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const nextLast = new Date(now.getFullYear(), now.getMonth() + 2, 0); // end of next month
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const minThisMonth = ymd(first);
  const maxThisMonth = ymd(last);
  const maxNextMonth = ymd(nextLast);
  const todayYmd = ymd(today);

  // Amount formatting
  const formatCommas = (s, keepTrailingDot = false) => {
    if (!s) return "";
    s = s.replace(/[^0-9.]/g, "");
    const parts = s.split(".");
    const intP = (parts[0] ?? "0");
    const decP = (parts[1] ?? "");
    const intClean = (intP || "0").replace(/^0+(?=\d)/, "") || "0";
    const withCommas = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (keepTrailingDot) return `${withCommas}.`;
    return decP !== "" ? `${withCommas}.${decP}` : withCommas;
  };
  const cleanAmount = (s) => (s || "").replace(/,/g, "");
  const moneyRegex = /^\d{0,15}(\.\d{0,2})?$/;

  const moneyToCents = (s) => {
    const raw = cleanAmount(s);
    if (!raw || !moneyRegex.test(raw)) return 0;
    const [i, d = ""] = raw.split(".");
    const dec = d.padEnd(2, "0").slice(0, 2);
    return (Number(i || "0") * 100) + Number(dec || "0");
  };

  const clampAmountToMax = (raw) => {
    const cents = moneyToCents(raw);
    if (cents > MAX_AMOUNT_CENTS) {
      showBubble("amount", "Maximum is LKR 9,999,999.00");
      return "9,999,999.00";
    }
    return null; // no clamp needed
  };

  const setRecurrence = (patch) =>
    setF((prev) => ({ ...prev, recurrence: { ...prev.recurrence, ...patch } }));

  /* =========================
     State (original + defaults)
     ========================= */
  const [f, setF] = React.useState({
    _id: null,
    accountId: accounts[0]?._id || "",
    name: "",
    category: "Loan",
    amount: "",
    currency: "LKR",
    dueDate: ymd(now),
    status: "pending",
    paidAt: "",
    isRecurring: false,
    recurrence: { frequency: "monthly", interval: 1, startDate: ymd(now), byWeekday: [], byMonthDay: [] },
    endChoice: "never",
    remaining: "",
    endDate: "",
  });

  React.useEffect(() => {
    if (!open) return;
    if (initial) {
      const rec = initial.recurrence || {};
      const endChoice = rec.endDate ? "date" : (Number.isInteger(rec.remaining) ? "count" : "never");
      const initialAmount = (typeof fromCents === "function")
        ? String(fromCents(initial.amountCents || 0))
        : String((initial.amountCents || 0) / 100);

      setF({
        _id: initial._id,
        accountId: initial.accountId,
        name: initial.name || "",
        category: initial.category || "Loan",
        amount: formatCommas(initialAmount),
        currency: initial.currency || "LKR",
        dueDate: ymd(initial.dueDate || initial.paidAt || now),
        status: initial.status || "pending",
        paidAt: initial.paidAt ? ymd(initial.paidAt) : "",
        isRecurring: !!initial.isRecurring,
        recurrence: {
          frequency: rec.frequency || "monthly",
          interval: Math.min(MAX_INTERVAL, rec.interval || 1),
          startDate: ymd(rec.startDate || initial.dueDate || now),
          byWeekday: Array.isArray(rec.byWeekday) ? rec.byWeekday : [],
          byMonthDay: Array.isArray(rec.byMonthDay) ? rec.byMonthDay : [],
        },
        endChoice,
        remaining: Number.isInteger(rec.remaining) ? String(rec.remaining) : "",
        endDate: rec.endDate ? ymd(rec.endDate) : "",
      });
    } else {
      setF((d) => ({ ...d, accountId: accounts[0]?._id || d.accountId }));
    }
  }, [open, initial, accounts]);

  /* =========================
     Derived (original)
     ========================= */
  const getAccount = (id) => accounts.find(a => a._id === id);
  const currentBalanceCents = Number(getAccount(f.accountId)?.balanceCents || 0);
  const wantToPay = f.status === "paid";

  const amountCents = moneyToCents(f.amount);
  const wouldGoNegative = wantToPay && amountCents > currentBalanceCents;

  const plan = periodPlan;
  const commitCap = Number(plan?.commitments?.amount || 0);
  const commitCapCents = (typeof toCents === "function") ? toCents(commitCap) : Math.round(commitCap * 100);
  const usedCents = Number(plan?._usedCommitmentsCents || 0);

  const wouldBreachHardCap =
    !!plan?.commitments?.hardCap &&
    wantToPay &&
    (typeof isInPeriod === "function" ? isInPeriod(f.paidAt || f.dueDate, plan?.period) : true) &&
    usedCents + amountCents > commitCapCents;

  /* =========================
     Field handlers (with bubbles)
     ========================= */
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

  // Amount
  const onAmountKeyDown = (e) => {
    if (["-", "e", "E", "+"].includes(e.key)) {
      e.preventDefault();
      showBubble("amount", "Positive number, up to 2 decimals.");
    }
  };
  const onAmountPaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    const raw = cleanAmount(text);
    if (!moneyRegex.test(raw)) {
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
    const raw = cleanAmount(e.target.value);
    if (raw === "") { setF({ ...f, amount: "" }); return; }
    if (!/^\d*\.?\d*$/.test(raw)) { showBubble("amount", "Only digits and one dot."); return; }
    if (raw.startsWith(".")) { showBubble("amount", "Start with a number (e.g., 0.50)."); return; }
    const [intPart, decPart = ""] = raw.split(".");
    if (decPart.length > 2) { showBubble("amount", "Up to 2 decimal places only."); return; }

    // Clamp to 9,999,999.00 if user exceeds
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
    const raw = cleanAmount(f.amount);
    if (!raw) return;

    // normalize to two decimals
    let [i = "0", d = ""] = raw.split(".");
    if (d.length === 0) d = "00";
    else if (d.length === 1) d = d + "0";
    let fixed = `${String(Number(i)).replace(/^0+(?=\d)/, "") || "0"}.${d.slice(0, 2)}`;

    // final clamp check
    const clamped = clampAmountToMax(fixed);
    if (clamped !== null) {
      fixed = clamped;
    }

    setF((prev) => ({ ...prev, amount: formatCommas(fixed) }));
  };

  // === Dates ===

  // Paid at: within this month AND not in future (<= today)
  const onPaidAtChange = (e) => {
    const d = parseYmd(e.target.value);
    if (!d) return;
    if (d < first) {
      showBubble("paidAt", "Paid date must be within this month.");
      setF({ ...f, paidAt: ymd(first) });
      return;
    }
    if (d > today) {
      showBubble("paidAt", "Paid date can't be in the future.");
      setF({ ...f, paidAt: todayYmd });
      return;
    }
    setF({ ...f, paidAt: ymd(d) });
  };

  // Due date (pending): >= today AND <= end of next month
  const onDueChange = (e) => {
    const d = parseYmd(e.target.value);
    if (!d) return;
    if (d < today) {
      showBubble("dueDate", "Due date can't be in the past.");
      setF({ ...f, dueDate: todayYmd });
      return;
    }
    if (d > nextLast) {
      showBubble("dueDate", "Due date must be within this or next month.");
      setF({ ...f, dueDate: maxNextMonth });
      return;
    }
    setF({ ...f, dueDate: ymd(d) });
  };

  // Start date: must be within this month
  const onStartDateChange = (e) => {
    const d = parseYmd(e.target.value);
    if (!d) return;
    if (d < first) {
      showBubble("startDate", "Start date must be within this month.");
      setRecurrence({ startDate: minThisMonth });
      return;
    }
    if (d > last) {
      showBubble("startDate", "Start date must be within this month.");
      setRecurrence({ startDate: maxThisMonth });
      return;
    }
    setRecurrence({ startDate: ymd(d) });
  };

  // End date ("Ends → On"): must be today or future; can be in other months
  const onEndDateChange = (e) => {
    const d = parseYmd(e.target.value);
    if (!d) return;
    if (d < today) {
      showBubble("endDate", "End date must be today or a future date.");
      setF({ ...f, endDate: todayYmd });
      return;
    }
    setF({ ...f, endDate: ymd(d) });
  };

  const blockNonPositiveIntKeys = (e, keyName) => {
    if (["-", "e", "E", "+", ".", ","].includes(e.key)) {
      e.preventDefault();
      showBubble(keyName, "Positive whole numbers only.");
    }
  };
  const onIntervalChange = (e) => {
    const v = e.target.value.replace(/[^\d]/g, "");
    if (v === "") { setRecurrence({ interval: "" }); return; }
    let n = Math.max(1, parseInt(v, 10));
    if (n > MAX_INTERVAL) {
      n = MAX_INTERVAL;
      showBubble("interval", "Maximum interval is 12");
    }
    setRecurrence({ interval: n });
  };
  const onRemainingChange = (e) => {
    const v = e.target.value.replace(/[^\d]/g, "");
    if (v === "") { setF({ ...f, remaining: "" }); return; }
    setF({ ...f, remaining: String(Math.max(1, parseInt(v, 10))) });
  };

  /* =========================
     Submit (bubble validation)
     ========================= */
  const submit = async (e) => {
    e.preventDefault();

    if (!f.name || !/^[A-Za-z\s]+$/.test(f.name)) {
      showBubble("name", "Enter a valid name (letters & spaces).");
      return;
    }
    if (!moneyRegex.test(cleanAmount(f.amount)) || moneyToCents(f.amount) <= 0) {
      showBubble("amount", "Enter a positive amount with up to 2 decimals.");
      return;
    }
    if (moneyToCents(f.amount) > MAX_AMOUNT_CENTS) {
      showBubble("amount", "Maximum is LKR 9,999,999.00");
      setF((prev) => ({ ...prev, amount: "9,999,999.00" }));
      return;
    }

    // Re-validate selected dates with new rules
    if (f.status === "paid") {
      const d = parseYmd(f.paidAt || todayYmd);
      if (!d || d < first || d > today) {
        showBubble("paidAt", "Paid date must be this month and not in the future.");
        return;
      }
    } else {
      const d = parseYmd(f.dueDate || todayYmd);
      if (!d || d < today || d > nextLast) {
        showBubble("dueDate", "Due date must be within this or next month and not in the past.");
        return;
      }
    }

    if (f.isRecurring) {
      const sd = parseYmd(f.recurrence.startDate);
      if (!sd || sd < first || sd > last) {
        showBubble("startDate", "Start date must be within this month.");
        return;
      }
      const intervalNum = Number(f.recurrence.interval);
      if (!Number.isInteger(intervalNum) || intervalNum < 1 || intervalNum > MAX_INTERVAL) {
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
        if (!ed || ed < today) {
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
      paidAt: f.status === "paid" && f.paidAt ? (parseYmd(f.paidAt) || new Date(f.paidAt)) : undefined,
      isRecurring: f.isRecurring,
      recurrence: f.isRecurring ? {
        frequency: f.recurrence.frequency,
        interval: Number(f.recurrence.interval || 1),
        startDate: parseYmd(f.recurrence.startDate) || new Date(f.recurrence.startDate || f.dueDate),
        byWeekday: f.recurrence.byWeekday,
        byMonthDay: f.recurrence.byMonthDay,
        ...(f.endChoice === "count" ? { remaining: Number(f.remaining || 0) } : {}),
        ...(f.endChoice === "date" ? { endDate: f.endDate ? (parseYmd(f.endDate) || new Date(f.endDate)) : undefined } : {}),
      } : undefined,
    });
  };

  /* =========================
     Render
     ========================= */
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
              Available balance: {typeof LKR !== "undefined"
                ? LKR.format((Number(getAccount(f.accountId)?.balanceCents || 0)) / 100)
                : (Number(getAccount(f.accountId)?.balanceCents || 0) / 100).toLocaleString("en-LK", { style: "currency", currency: "LKR" })}
            </p>
          </Field>

          <Field label="Category">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.category}
              onChange={(e) => setF({ ...f, category: e.target.value })}
            >
              <option>Loan</option><option>Credit Card</option><option>Insurance</option><option>Bill</option><option>Other</option>
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
              <p className="text-xs text-slate-500 mt-1">
                Positive number (max LKR 9,999,999.00), comma-grouped, up to 2 decimals. (Auto-adds decimals on blur.)
              </p>
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
                  value={f.paidAt || todayYmd}
                  min={minThisMonth}
                  max={todayYmd}
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
                  min={todayYmd}
                  max={maxNextMonth}
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
          <input
            id="rec"
            type="checkbox"
            checked={f.isRecurring}
            onChange={(e) => setF({ ...f, isRecurring: e.target.checked })}
          />
          <label htmlFor="rec" className="text-sm text-slate-700">Make this recurring</label>
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
                    max={MAX_INTERVAL}
                    step="1"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    value={f.recurrence.interval}
                    onKeyDown={(e) => blockNonPositiveIntKeys(e, "interval")}
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
                    min={minThisMonth}
                    max={maxThisMonth}
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
                    onChange={(e) => setRecurrence({
                      byWeekday: e.target.value
                        .split(",")
                        .map(s => s.trim())
                        .filter(Boolean)
                        .map(Number)
                        .filter(Number.isInteger)
                        .filter(n => n >= 0 && n <= 6),
                    })}
                  />
                ) : (
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="1,15,28"
                    value={(f.recurrence.byMonthDay || []).join(",")}
                    onChange={(e) => setRecurrence({
                      byMonthDay: e.target.value
                        .split(",")
                        .map(s => s.trim())
                        .filter(Boolean)
                        .map(Number)
                        .filter(Number.isInteger)
                        .filter(n => n >= 1 && n <= 31),
                    })}
                  />
                )}
              </Field>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Ends">
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="endChoice" checked={f.endChoice === "never"} onChange={() => setF({ ...f, endChoice: "never" })} />
                    <span className="text-sm">Never</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input type="radio" name="endChoice" checked={f.endChoice === "count"} onChange={() => setF({ ...f, endChoice: "count" })} />
                    <span className="text-sm">After</span>
                    <div className="relative">
                      <input
                        disabled={f.endChoice !== "count"}
                        type="number"
                        min="1"
                        step="1"
                        className="w-24 rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        value={f.remaining}
                        onKeyDown={(e) => blockNonPositiveIntKeys(e, "remaining")}
                        onChange={onRemainingChange}
                      />
                      <Bubble show={bubble.key === "remaining"} message={bubble.msg} />
                    </div>
                    <span className="text-sm">occurrences</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input type="radio" name="endChoice" checked={f.endChoice === "date"} onChange={() => setF({ ...f, endChoice: "date" })} />
                    <span className="text-sm">On</span>
                    <div className="relative">
                      <input
                        disabled={f.endChoice !== "date"}
                        type="date"
                        className="rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        value={f.endDate}
                        min={todayYmd}
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
            className={`px-4 py-2 rounded-xl text-white ${(wouldGoNegative || wouldBreachHardCap) ? "bg-slate-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
            disabled={wouldGoNegative || wouldBreachHardCap}
          >
            Save
          </button>
          <button type="button" className="px-4 py-2 rounded-xl border border-slate-300" onClick={onClose}>Cancel</button>
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
      setPlan(bp); // could be null
    } catch (e) {
      setErr(e?.response?.data?.error || e.message);
    }
  };
  useEffect(() => { load(); }, []);

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
      setOpen(false); setEditing(null);
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

  const filtered = useMemo(() => {
    return items.filter((t) => {
      const okAcc = !filters.accountId || t.accountId === filters.accountId;
      const okStatus = !filters.status || t.status === filters.status;
      const dt = new Date(t.status === "paid" ? (t.paidAt || t.dueDate) : t.dueDate);
      const okFrom = !filters.from || dt >= new Date(filters.from);
      const okTo = !filters.to || dt <= new Date(filters.to);
      const q = (filters.q || "").toLowerCase();
      const okQ = !q || [t.name, t.category].some((v) => (v || "").toLowerCase().includes(q));
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
  const projectedOver = Math.max(0, (usedCommitmentsCents + pendingCommitmentsCents) - capC);

  const currentFilters = { ...filters, accountName: filters.accountId ? accName(filters.accountId) : "All Accounts" };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900 py-8">
      <div className="mx-auto max-w-6xl px-4">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600">Bank Commitments</h1>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-slate-300" onClick={() => setReportOpen(true)}>
              Generate report
            </button>
            <button className="px-4 py-2 rounded-xl bg-indigo-600 text-white" onClick={() => { setEditing(null); setOpen(true); }}>
              + Add Commitment
            </button>
          </div>
        </header>

        {/* Budget overview (kept) */}
        <section className="mb-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
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
              <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
                Projected with pending: <b>{LKR.format((usedCommitmentsCents + pendingCommitmentsCents) / 100)}</b> — over by {LKR.format(projectedOver / 100)}
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
            <select className="w-full rounded-xl border border-slate-300 px-3 py-2" value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}>
              <option value="">All</option>
              {accounts.map((a) => (<option key={a._id} value={a._id}>{a.name}</option>))}
            </select>
          </Field>
          <Field label="Status">
            <select className="w-full rounded-xl border border-slate-300 px-3 py-2" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </Field>
          <Field label="From"><input type="date" className="w-full rounded-xl border border-slate-300 px-3 py-2" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" className="w-full rounded-xl border border-slate-300 px-3 py-2" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
          <Field label="Search"><input className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="name / category" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></Field>
        </div>

        {/* Lists & table (kept) */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-slate-700">
            <Clock className="w-5 h-5 text-orange-500" />
            Upcoming
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {upcoming.length === 0 && (
              <div className="text-slate-500 italic">No upcoming payments.</div>
            )}
            {upcoming.map((t) => (
              <div
                key={t._id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-slate-800 flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-slate-500" />
                    {accName(t.accountId)}
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
                    Pending
                  </span>
                </div>

                <div className="text-slate-900 font-medium">{t.name}</div>
                <div className="text-slate-600 text-sm flex items-center gap-2 mt-1">
                  <span>{LKR.format((t.amountCents || 0) / 100)}</span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                    {new Date(t.dueDate).toLocaleDateString()}
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2 text-sm">
                  <button
                    className="flex items-center gap-1 px-3 py-1 rounded-xl border hover:bg-slate-50"
                    onClick={() => {
                      setEditing(t);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                  <button
                    className="flex items-center gap-1 px-3 py-1 rounded-xl border border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => onDelete(t._id)}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-slate-700">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Completed
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {paid.length === 0 && (
              <div className="text-slate-500 italic">No completed payments.</div>
            )}
            {paid.map((t) => (
              <div
                key={t._id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-slate-800 flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-slate-500" />
                    {accName(t.accountId)}
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                    Paid
                  </span>
                </div>

                <div className="text-slate-900 font-medium">{t.name}</div>
                <div className="text-slate-600 text-sm flex items-center gap-2 mt-1">
                  <span>{LKR.format((t.amountCents || 0) / 100)}</span>
                  <span>•</span>
                  <span>
                    Paid {formatDate(t.paidAt || t.dueDate)}
                    {t.dueDate ? <> • Due {formatDate(t.dueDate)}</> : null}
                  </span>
                </div>

                <div className="mt-4 flex justify-end gap-2 text-sm">
                  <button
                    className="flex items-center gap-1 px-3 py-1 rounded-xl border hover:bg-slate-50"
                    onClick={() => {
                      setEditing(t);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                  <button
                    className="flex items-center gap-1 px-3 py-1 rounded-xl border border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => onDelete(t._id)}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {err && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-t-2xl border-b border-red-200">
              {err}
            </div>
          )}

          <table className="w-full text-sm">
            <thead className="bg-slate-200 text-slate-900">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-slate-500 italic"
                  >
                    No commitments
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr
                    key={t._id}
                    className="border-t hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-3 py-2">
                      {formatDate(
                        t.status === "paid" ? (t.paidAt || t.dueDate) : t.dueDate
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{t.name}</td>
                    <td className="px-3 py-2">{t.category}</td>
                    <td className="px-3 py-2">{accName(t.accountId)}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {LKR.format((t.amountCents || 0) / 100)}
                    </td>
                    <td className="px-3 py-2">
                      {t.status === "paid" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" /> Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right flex justify-end gap-2">
                      <button
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                        onClick={() => {
                          setEditing(t);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" /> Edit
                      </button>
                      <button
                        className="flex items-center gap-1 text-red-600 hover:text-red-800"
                        onClick={() => onDelete(t._id)}
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <CommitmentForm
          open={open}
          onClose={() => { setOpen(false); setEditing(null); }}
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
              rows: filtered.map(r => ({ ...r, accountName: accName(r.accountId) })),
              filters: currentFilters,
            });
            setReportOpen(false);
          }}
        />
      </div>
    </div>
  );
}
