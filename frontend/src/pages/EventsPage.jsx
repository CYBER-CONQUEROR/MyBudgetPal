// src/pages/EventsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
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

/* ===================== NEW: PDF to match sketch ===================== */
async function generateEventExpensesReportPDF({
  rows,
  filters,
  period,
  logoUrl = "/reportLogo.png",
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header
  let textX = margin;
  try {
    const logoData = await loadImageDataURL(logoUrl);
    console.log(logoUrl);
    if (logoData) {
      doc.addImage(logoData, "PNG", margin, margin - 4, 44, 44);
      textX = margin + 56;
    }
  } catch (_) {}
  doc.setFont("helvetica", "bold").setFontSize(20).text("My Budget Pal", textX, margin + 12);
  doc.setFont("helvetica", "normal").setFontSize(16).text("Event Expenses Report", textX, margin + 34);

  // Left vertical caption
  doc.setFontSize(9).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal", 12, pageH / 2, { angle: 90 });
  doc.setTextColor(0);

  let y = margin + 70;

  const fmtDate = (dStr) => (dStr ? new Date(dStr).toLocaleDateString() : "—");

  // Filters block (from your UI state)
  const rangeLabel =
    filters?.from || filters?.to
      ? `${fmtDate(filters?.from || "")}  -  ${fmtDate(filters?.to || "")}`
      : "____________  -  ____________";
  const modeLabel = filters?.mode ? (filters.mode === "single" ? "Single" : "Itemized") : "All";
  const dateFieldLabel = filters?.dateField === "due" ? "Due Date" : "Created Date";

  doc.setFont("helvetica", "normal").setFontSize(11);
  doc.text(`Scoped Month (Created): ${period || "—"}`, margin, y);
  y += 16;
  doc.text(`Date range       : ${rangeLabel}`, margin, y);
  y += 16;
  doc.text(`Filter option 1  : Mode = ${modeLabel}`, margin, y);
  y += 16;
  doc.text(`Filter option 2  : Date field = ${dateFieldLabel}`, margin, y);
  y += 24;

  // Single Item Events
  const singles = rows.filter((e) => e.mode === "single");
  let singleTotalC = 0;

  if (singles.length) {
    doc.setFont("helvetica", "bold").setFontSize(13).text("Single Item Events", margin, y);
    y += 10;

    const head = [["Title", "DueDate", "StartDate", "EndDate", "Amount (LKR)"]];
    const body = singles.map((e) => {
      singleTotalC += e.targetCents || 0;
      return [
        e.title,
        e?.dates?.due ? new Date(e.dates.due).toLocaleDateString() : "—",
        e?.dates?.start ? new Date(e.dates.start).toLocaleDateString() : "—",
        e?.dates?.end ? new Date(e.dates.end).toLocaleDateString() : "—",
        currency(e.targetCents, e.currency || "LKR"),
      ];
    });

    autoTable(doc, {
      startY: y + 8,
      head,
      body,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [242, 246, 252], textColor: 40 },
      margin: { left: margin, right: margin },
    });

    y = doc.lastAutoTable.finalY + 16;
    doc.setFont("helvetica", "normal").setFontSize(11);
    doc.text(`Single Event total = ${currency(singleTotalC)}`, margin, y);
    y += 24;
  }

  // Itemized Events
  const itemized = rows.filter((e) => e.mode === "itemized");
  let itemizedGrandC = 0;

  if (itemized.length) {
    doc.setFont("helvetica", "bold").setFontSize(13).text("Itemized Events", margin, y);
    y += 8;

    itemized.forEach((e, idx) => {
      const head = [["Title", "DueDate", "StartDate", "EndDate", "Item", "Amount (LKR)"]];
      let subTotalC = 0;
      const body = (e.subItems || []).map((s) => {
        const amt = Number(s.targetCents || 0);
        subTotalC += amt;
        return [
          e.title,
          e?.dates?.due ? new Date(e.dates.due).toLocaleDateString() : "—",
          e?.dates?.start ? new Date(e.dates.start).toLocaleDateString() : "—",
          e?.dates?.end ? new Date(e.dates.end).toLocaleDateString() : "—",
          s.name || "—",
          currency(amt, e.currency || "LKR"),
        ];
      });

      // If no subitems, still list the event row with a blank item
      if (body.length === 0) {
        subTotalC += Number(e.targetCents || 0);
        body.push([
          e.title,
          e?.dates?.due ? new Date(e.dates.due).toLocaleDateString() : "—",
          e?.dates?.start ? new Date(e.dates.start).toLocaleDateString() : "—",
          e?.dates?.end ? new Date(e.dates.end).toLocaleDateString() : "—",
          "(no items)",
          currency(e.targetCents || 0, e.currency || "LKR"),
        ]);
      }

      autoTable(doc, {
        startY: y + (idx === 0 ? 6 : 2),
        head,
        body,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [242, 246, 252], textColor: 40 },
        margin: { left: margin, right: margin },
      });

      y = doc.lastAutoTable.finalY + 16;
      doc.setFont("helvetica", "normal").setFontSize(11);
      doc.text(`Total for ${e.title} = ${currency(subTotalC)}`, margin, y);
      y += 32;

      itemizedGrandC += subTotalC;
    });

    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text(`Total For Itemized Events = ${currency(itemizedGrandC)}`, margin, y);
    y += 16;
  }

  // GRAND TOTALS
  const grandTotalC = singleTotalC + itemizedGrandC;
  const numberOfEvents = rows.length;

  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(`All Total Event Expenses = ${currency(grandTotalC)}`, margin, y);
  y += 16;
  doc.text(`Number Of Events = ${numberOfEvents}`, margin, y);
  y += 40;

  // Signature
  doc.setFont("helvetica", "normal").setFontSize(12);
  doc.text("Signature : ...........................................", margin, pageH - 60);

  // Footer page number
  const pageCount = doc.internal.getNumberOfPages();
  doc.setFontSize(9);
  doc.text(`Page ${pageCount}`, pageW - margin, pageH - 16, { align: "right" });

  // Save
  const fn = makeReportFilename("EventExpensesReport");
  doc.save(fn);
}

/* ===================== PROGRESS BARS ===================== */
function Bar({ value, max, hard = false }) {
  const pct = max > 0 ? value / max : 0;
  const w = `${clamp01(pct) * 100}%`;
  const color = pct <= 0.85 ? "bg-emerald-500" : pct <= 1 ? "bg-amber-500" : "bg-rose-500";
  const ring = hard && pct > 1 ? "ring-2 ring-rose-400" : "";
  return (
    <div className={`h-2 w-full rounded-full bg-slate-200 overflow-hidden ${ring}`}>
      <div className={`h-full ${color}`} style={{ width: w }} />
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
                  className={`px-3 py-2 rounded-xl border ${
                    f.mode === m ? "bg-indigo-600 text-white border-indigo-600" : "bg-white"
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
                className="px-3 py-1.5 rounded-xl border"
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
                  className="col-span-1 rounded-xl border"
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
            Heads up: This event’s target ({currency(targetCents, f.currency)}) exceeds your remaining Events budget for{" "}
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
            className={`px-4 py-2 rounded-xl text-white ${
              (f.mode === "single"
                ? targetCents > accBalCents
                : toCents(itemizedTotal) > accBalCents)
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700"
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
            You’re trying to fund more than this event’s remaining target. Remaining:{" "}
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
            className={`px-4 py-2 rounded-xl text-white ${
              disableSubmit
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700"
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
            You can only remove up to what’s unspent. Refundable:{" "}
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
            className={`px-4 py-2 rounded-xl text-white ${
              disableSubmit
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-amber-600 hover:bg-amber-700"
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
            You can’t spend more than what’s funded. Available:{" "}
            {currency(remainingFundedCents, event?.currency || "LKR")}.
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className={`px-4 py-2 rounded-xl text-white ${
              disableSubmit ? "bg-slate-400 cursor-not-allowed" : "bg-rose-600 hover:bg-rose-700"
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
  const fundedPct = (ev.targetCents || 0) > 0 ? Math.round(((ev.fundedCents || 0) / ev.targetCents) * 100) : 0;
  const spentPct = (ev.targetCents || 0) > 0 ? Math.round(((ev.spentCents || 0) / ev.targetCents) * 100) : 0;

  const hasSpend = (ev.spentCents || 0) > 0;
  const refundableCents = Math.max(0, (ev.fundedCents || 0) - (ev.spentCents || 0));
  const canDefund = refundableCents > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-lg font-semibold">{ev.title}</div>
          <div className="text-xs text-slate-500">
            {ev.mode === "single" ? "Single amount" : "Itemized"} •{" "}
            {ev?.dates?.due ? `Due ${new Date(ev.dates.due).toLocaleDateString()}` : "No due date"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Target</div>
          <div className="font-semibold">{currency(ev.targetCents, ev.currency || "LKR")}</div>
        </div>
      </div>

      <div className="grid gap-2">
        <div>
          <div className="flex justify-between text-xs">
            <span>Funded</span>
            <span>
              {currency(ev.fundedCents, ev.currency)} • {fundedPct}%
            </span>
          </div>
          <Bar value={ev.fundedCents || 0} max={ev.targetCents || 1} />
        </div>
        <div>
          <div className="flex justify-between text-xs">
            <span>Spent</span>
            <span>
              {currency(ev.spentCents, ev.currency)} • {spentPct}%
            </span>
          </div>
          <Bar value={ev.spentCents || 0} max={ev.targetCents || 1} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white" onClick={() => onFund(ev)}>
          + Fund
        </button>
        {canDefund && (
          <button className="px-3 py-1.5 rounded-xl bg-amber-600 text-white" onClick={() => onDefund(ev)}>
            Remove Funds
          </button>
        )}
        <button className="px-3 py-1.5 rounded-xl bg-rose-600 text-white" onClick={() => onSpend(ev)}>
          + Spend
        </button>
        <button className="px-3 py-1.5 rounded-xl border" onClick={() => onEdit(ev)}>
          Edit
        </button>

        {/* Delete: hide if any spend; disable if funded > 0 */}
        {(ev.spentCents || 0) === 0 && (
          <button
            className={`px-3 py-1.5 rounded-xl border ${
              ev.fundedCents > 0 ? "border-slate-300 text-slate-400 cursor-not-allowed" : "border-red-300 text-red-600"
            }`}
            onClick={() => (ev.fundedCents > 0 ? null : onDelete(ev))}
            disabled={ev.fundedCents > 0}
            title={ev.fundedCents > 0 ? "Remove funds first to delete" : "Delete"}
          >
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
      const okQ = !q || [e.title, e.notes].some((s) => (s || "").toLowerCase().includes(q));
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
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-6xl px-4">
        {/* Header with Month Scope */}
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Events</h1>
            <p className="text-slate-500 text-sm">
              Scoped to <b>{viewPeriod}</b> by <b>Created Month</b>. Events created in other months won’t count here.
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
            <button className="px-3 py-2 rounded-xl border" onClick={load}>
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
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 shadow-sm"
            >
              Generate Report
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              + Create Event
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

        {/* Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="text-slate-500">
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

        {/* Table */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Mode</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-right">Target</th>
                <th className="px-3 py-2 text-right">Funded</th>
                <th className="px-3 py-2 text-right">Spent</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Due</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                    No events
                  </td>
                </tr>
              ) : (
                filtered.map((e) => {
                  const hasSpend = (e.spentCents || 0) > 0;
                  const refundable = Math.max(0, (e.fundedCents || 0) - (e.spentCents || 0)) > 0;
                  const canDelete = !hasSpend && (e.fundedCents || 0) === 0;
                  return (
                    <tr key={e._id} className="border-t">
                      <td className="px-3 py-2">{e.title}</td>
                      <td className="px-3 py-2">{e.mode}</td>
                      <td className="px-3 py-2">{accounts.find((a) => a._id === e.primaryAccountId)?.name || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {currency(e.targetCents, e.currency || "LKR")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {currency(e.fundedCents, e.currency || "LKR")}
                      </td>
                      <td className="px-3 py-2 text-right">{currency(e.spentCents, e.currency || "LKR")}</td>
                      <td className="px-3 py-2">
                        {e?.createdAt ? new Date(e.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {e?.dates?.due ? new Date(e.dates.due).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right space-x-3">
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => {
                            setEditing(e);
                            setOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button className="text-emerald-600 hover:underline" onClick={() => setFunding(e)}>
                          Fund
                        </button>
                        {refundable && (
                          <button className="text-amber-600 hover:underline" onClick={() => setDefunding(e)}>
                            Remove Funds
                          </button>
                        )}
                        {!hasSpend && (
                          <button
                            className={canDelete ? "text-red-600 hover:underline" : "text-slate-400 cursor-not-allowed"}
                            onClick={() => (canDelete ? onDeleteEvent(e) : null)}
                            disabled={!canDelete}
                            title={canDelete ? "Delete" : e.fundedCents > 0 ? "Remove funds first to delete" : ""}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
