// = FILE: frontend/src/pages/SavingsGoalsPage.jsx =
import React, { useEffect, useMemo, useState, useCallback,useRef  } from "react";
import axios from "axios";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import api from "../api/api.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ------------------------- API facades ------------------------- */
const Goals = {
  list: (p = {}) => api.get("savings-goals", { params: p }).then(r => r.data),
  get: (id) => api.get(`savings-goals/${id}`).then(r => r.data),
  create: (b) => api.post("savings-goals", b).then(r => r.data),
  update: (id, b) => api.put(`savings-goals/${id}`, b).then(r => r.data),
  remove: (id) => api.delete(`savings-goals/${id}`).then(r => r.data),
  fund: (id, b) => api.post(`savings-goals/${id}/fund`, b).then(r => r.data),
  withdraw: (id, b) => api.post(`savings-goals/${id}/withdraw`, b).then(r => r.data),
};

const Budget = { getPlan: (period) => api.get(`budget/plans/${period}`).then(r => r.data) };
const Accounts = { list: () => api.get("accounts", { params: { includeArchived: "false" } }).then(r => r.data) };

/* ------------------------- helpers ------------------------- */
const LKR = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const toCents = (rupees) => Math.round(Number(rupees || 0) * 100);
const fromCents = (c) => (Number(c || 0) / 100).toFixed(2);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const fmtMonth = (d) => d.toLocaleString("en-US", { month: "short", year: "numeric" });
const periodOf = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}`;
const monthBounds = (year, monthIndex0) => {
  const start = new Date(Date.UTC(year, monthIndex0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex0 + 1, 0, 23, 59, 59, 999));
  return { start, end };
};
const within = (ts, start, end) => {
  const t = new Date(ts).getTime();
  return t >= start.getTime() && t <= end.getTime();
};

// Sum monthly savings activity across all goals (funds/withdrawals)
function sumMonthlySavingsActivity(goals, start, end) {
  let inCents = 0;
  let outCents = 0;
  for (const g of goals) {
    for (const e of g.ledger || []) {
      if (!e?.at) continue;
      if (!within(e.at, start, end)) continue;
      if (e.kind === "fund") inCents += Number(e.amountCents || 0);
      else if (e.kind === "withdraw") outCents += Number(e.amountCents || 0);
    }
  }
  return { net: inCents - outCents, inCents, outCents };
}

/* ------------------------- PDF REPORT ------------------------- */
function makeReportFilename(prefix, ts = new Date()) {
  return `${prefix}_${ts.toISOString().replace(/[:T]/g, "-").slice(0, 15)}.pdf`;
}

/* ---------- helper: load logo as DataURL ---------- */
const loadImageDataURL = async (url) => {
  try {
    const res = await fetch(url, { cache: "no-store", mode: "cors" });
    if (!res.ok) throw new Error("Logo fetch failed");
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Logo load failed; continuing without logo:", e);
    return null;
  }
};

/* ---------- helper: ensure room before drawing table/header ---------- */
const ensureSpaceForTable = (
  doc,
  currentY,
  {
    margin = 40,
    pageH = doc.internal.pageSize.getHeight(),
    minRows = 4,      // keep at least this many rows with header
    rowH = 18,        // ~ font 9 + padding + grid
    headerH = 26,     // estimated header height
    extra = 16,       // breathing space before table
    onAddPage = () => {},
  } = {}
) => {
  const need = headerH + minRows * rowH + extra;
  if (currentY + need > pageH - margin) {
    doc.addPage();
    onAddPage();
    return margin; // reset Y
  }
  return currentY;
};

/* ===================== Savings Goals PDF (PURPLE headers, styled) ===================== */
async function generateSavingsPDF({
  goals = [],
  filters = {},
  logoUrl = "/reportLogo.png",
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  // Layout & palette (match Commitments/Budget)
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const brand = { r: 79, g: 70, b: 229 };         // purple/indigo-600
  const brandLight = { r: 241, g: 245, b: 255 };  // panel bg
  const slateTxt = 40;
  const TOTAL_PAGES_TOKEN = "{total_pages_count_string}";

  // helpers
  const fmtLKR = (n) =>
    (Number(n) || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const moneyRs = (rupees) => `LKR ${fmtLKR(rupees)}`;
  const humanDateTime = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const buildFilename = (prefix, data) => {
    const d = new Date();
    const parts = [prefix || "Report"];
    if (data?.status) parts.push(String(data.status).replace(/\s+/g, ""));
    if (data?.priority) parts.push(String(data.priority).replace(/\s+/g, ""));
    if (data?.q) parts.push("q");
    parts.push(d.toISOString().replace(/[:T]/g, "-").slice(0, 15));
    return parts.filter(Boolean).join("_") + ".pdf";
  };

  // Footer
  const drawFooter = () => {
    doc.setDrawColor(235).setLineWidth(1);
    doc.line(margin, pageH - 40, pageW - margin, pageH - 40);

    doc.setFontSize(9).setTextColor(120);
    doc.text(`Generated: ${humanDateTime}`, margin, pageH - 22);

    const pageStr = `Page ${doc.internal.getNumberOfPages()} of ${TOTAL_PAGES_TOKEN}`;
    const pageX = pageW - margin - 120; // a bit left from edge (matches others)
    doc.text(pageStr, pageX, pageH - 22, { align: "right" });

    doc.setTextColor(slateTxt);
  };

  // Header (logo + brand + purple rule)
  const logoSize = 46;
  const headerY = margin;
  const logoDataUrl = await loadImageDataURL(logoUrl);
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, headerY, logoSize, logoSize);
    } catch {}
  }
  const headerTextX = margin + (logoDataUrl ? logoSize + 12 : 0);
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(slateTxt);
  doc.text("My Budget Pal", headerTextX, headerY + 30);

  const sepY = headerY + logoSize + 12;
  doc.setDrawColor(brand.r, brand.g, brand.b).setLineWidth(2);
  doc.line(margin, sepY, pageW - margin, sepY);

  // Title
  const titleY = sepY + 28;
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(slateTxt);
  doc.text("Savings Goals Report", pageW / 2, titleY, { align: "center" });

  // Filter panel
  const filterLines = [
    `Status  : ${filters?.status ?? "All"}`,
    `Priority: ${filters?.priority ?? "All"}`,
    ...(filters?.q ? [`Search : "${filters.q}"`] : []),
  ];
  const boxX = margin;
  const boxY = titleY + 20;
  const lineH = 14;
  const boxH = Math.max(1, filterLines.length) * lineH + 16;
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

  // watermark
  doc.setFontSize(10).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, {
    angle: 90,
  });
  doc.setTextColor(slateTxt);

  // Overview (Summary-style)
  let cursorY = boxY + boxH + 22;

  const totalTargetRs = goals.reduce(
    (sum, g) => sum + Number(g?.targetCents || 0) / 100,
    0
  );
  const totalSavedRs = goals.reduce(
    (sum, g) => sum + Number(g?.savedCents || 0) / 100,
    0
  );
  const totalRemainRs = Math.max(0, totalTargetRs - totalSavedRs);
  const completed = goals.filter((g) => !!g.completed).length;
  const active = Math.max(0, goals.length - completed);

  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("Overview", margin, cursorY);
  cursorY += 10;
  doc.setDrawColor(brand.r, brand.g, brand.b).setLineWidth(1.2);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 14;

  const overviewRows = [
    ["Total Goals", String(goals.length)],
    ["Active Goals", String(active)],
    ["Completed Goals", String(completed)],
    ["Total Target", moneyRs(totalTargetRs)],
    ["Total Saved", moneyRs(totalSavedRs)],
    ["Remaining", moneyRs(totalRemainRs)],
  ];
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(60);
  const labelX = margin + 10;
  const labelW = Math.max(...overviewRows.map(([l]) => doc.getTextWidth(l)));
  const colonX = labelX + labelW + 6;
  const valueAnchor = Math.min(pageW - margin - 40, colonX + 10 + 220);
  const lineGap = 18;

  overviewRows.forEach(([label, value]) => {
    doc.text(label, labelX, cursorY);
    doc.text(":", colonX, cursorY);
    doc.text(value, valueAnchor, cursorY, { align: "right" });
    cursorY += lineGap;
  });

  doc.setDrawColor(230).setLineWidth(1);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 24;
  doc.setTextColor(slateTxt);

  // Common table styling (PURPLE HEADERS)
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
      fillColor: [brand.r, brand.g, brand.b], // PURPLE header
      textColor: [255, 255, 255],             // white text
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: { fillColor: [247, 248, 250] },
    didDrawPage: () => drawFooter(),
  };

  const reWatermark = () => {
    doc.setFontSize(10).setTextColor(120);
    doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, {
      angle: 90,
    });
    doc.setTextColor(slateTxt);
  };

  // Each goal
  for (const g of goals) {
    // ensure space for the goal header block
    cursorY = ensureSpaceForTable(doc, cursorY, {
      margin,
      pageH,
      minRows: 0,
      rowH: 0,
      headerH: 0,
      extra: 80,
      onAddPage: () => {
        drawFooter();
        reWatermark();
      },
    });

    // Goal title
    doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(slateTxt);
    doc.text(`Goal: ${g?.name || "—"}`, margin, cursorY);
    cursorY += 14;

    // Goal mini-summary
    const tRs = Number(g?.targetCents || 0) / 100;
    const sRs = Number(g?.savedCents || 0) / 100;
    const rRs = Math.max(0, tRs - sRs);
    const goalRows = [
      ["Target", moneyRs(tRs)],
      ["Saved", moneyRs(sRs)],
      ["Remaining", moneyRs(rRs)],
      ["Priority", String(g?.priority ?? "—")],
      ["Status", g?.completed ? "Completed" : "Active"],
      ...(g?.deadline
        ? [["Deadline", new Date(g.deadline).toLocaleDateString()]]
        : []),
    ];

    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(60);
    const gLabelX = margin + 10;
    const gLabelW = Math.max(...goalRows.map(([lbl]) => doc.getTextWidth(lbl)));
    const gColonX = gLabelX + gLabelW + 6;
    const gValueAnchor = Math.min(pageW - margin - 40, gColonX + 10 + 220);

    goalRows.forEach(([label, value]) => {
      doc.text(label, gLabelX, cursorY);
      doc.text(":", gColonX, cursorY);
      doc.text(String(value), gValueAnchor, cursorY, { align: "right" });
      cursorY += 14;
    });

    // Ledger table (prevent orphan header)
    const ledger = Array.isArray(g?.ledger) ? g.ledger : [];
    if (ledger.length) {
      cursorY = ensureSpaceForTable(doc, cursorY, {
        margin,
        pageH,
        minRows: 4,
        rowH: 18,
        headerH: 26,
        extra: 16,
        onAddPage: () => {
          drawFooter();
          reWatermark();
        },
      });

      const head = [["Date", "Type", "Amount", "Note"]];
      const body = ledger.map((e) => [
        e?.at ? new Date(e.at).toLocaleDateString() : "—",
        e?.kind || "—",
        moneyRs(Number(e?.amountCents || 0) / 100),
        e?.note || "",
      ]);

      autoTable(doc, {
        ...tableCommon,
        startY: cursorY + 6,
        head,
        body,
        columnStyles: {
          2: { halign: "right" }, // Amount right
        },
      });
      cursorY = (doc.lastAutoTable?.finalY || cursorY) + 24;
    } else {
      doc.setFont("helvetica", "italic").setFontSize(10).setTextColor(100);
      doc.text("No ledger entries.", margin, cursorY);
      cursorY += 22;
      doc.setTextColor(slateTxt);
    }
  }

  // Summary (grand totals)
  cursorY = ensureSpaceForTable(doc, cursorY, {
    margin,
    pageH,
    minRows: 0,
    rowH: 0,
    headerH: 0,
    extra: 110,
    onAddPage: () => {
      drawFooter();
      reWatermark();
    },
  });

  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(slateTxt);
  doc.text("Summary", margin, cursorY);
  cursorY += 10;
  doc.setDrawColor(brand.r, brand.g, brand.b).setLineWidth(1.2);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 14;

  const summaryRows = [
    ["Total Goals", String(goals.length)],
    ["Active Goals", String(active)],
    ["Completed Goals", String(completed)],
    ["Grand Total Target", moneyRs(totalTargetRs)],
    ["Grand Total Saved", moneyRs(totalSavedRs)],
    ["Grand Remaining", moneyRs(totalRemainRs)],
  ];

  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(60);
  const sLabelX = margin + 10;
  const sLabelW = Math.max(...summaryRows.map(([lbl]) => doc.getTextWidth(lbl)));
  const sColonX = sLabelX + sLabelW + 6;
  const sValueAnchor = Math.min(pageW - margin - 40, sColonX + 10 + 220);

  summaryRows.forEach(([label, value]) => {
    doc.text(label, sLabelX, cursorY);
    doc.text(":", sColonX, cursorY);
    doc.text(value, sValueAnchor, cursorY, { align: "right" });
    cursorY += 18;
  });

  doc.setDrawColor(230).setLineWidth(1);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 24;

  // Signature
  let sigY = pageH - 68;
  if (sigY - cursorY < 40) {
    doc.addPage();
    drawFooter();
    reWatermark();
    sigY = pageH - 68;
  }
  doc.setFont("helvetica", "normal").setFontSize(12).setTextColor(slateTxt);
  doc.text(
    "Authorized Signature : ____________________________________",
    margin,
    sigY
  );

  // finalize total pages
  if (typeof doc.putTotalPages === "function")
    doc.putTotalPages(TOTAL_PAGES_TOKEN);

  // save
  const fn = buildFilename("SavingsReport", {
    status: filters?.status,
    priority: filters?.priority,
    q: filters?.q,
  });
  doc.save(fn);
}
/* ------------------------- UI atoms ------------------------- */
function Field({ label, required, children, hint }) { /* unchanged */ 
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

function MoneyInput({ value, onChange, required, ...props }) { /* unchanged */ 
  const sanitize = (v) => { let x = String(v ?? "").trim(); x = x.replace(/[^\d.]/g, ""); const parts = x.split("."); if (parts.length > 2) x = parts[0] + "." + parts.slice(1).join(""); const [whole, dec = ""] = x.split("."); const dec2 = dec.slice(0, 2); return dec2.length ? `${whole}.${dec2}` : whole; };
  return (
    <input type="text" inputMode="decimal" placeholder="0.00" required={required}
      className="w-full rounded-xl border border-slate-300 px-3 py-2"
      value={value} onChange={(e) => onChange(sanitize(e.target.value))}
      onBlur={(e) => { const v = e.target.value; if (!v || v === ".") return onChange(""); const num = Number(v); onChange(Number.isFinite(num) ? num.toFixed(2) : ""); }}
      {...props}
    />
  );
}

function Modal({ open, onClose, title, children }) { /* unchanged */ 
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl border border-slate-200" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 text-xl" aria-label="Close">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority = "medium" }) { /* unchanged */ 
  const map = { high: "bg-rose-100 text-rose-700 border-rose-200", medium: "bg-amber-100 text-amber-700 border-amber-200", low: "bg-emerald-100 text-emerald-700 border-emerald-200", };
  const label = priority[0].toUpperCase() + priority.slice(1);
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${map[priority] || map.medium}`}>{label} Priority</span>;
}

function DueBadge({ deadline, completed }) { /* unchanged */ 
  if (!deadline) return null;
  const today = new Date();
  const dd = Math.ceil((new Date(deadline) - new Date(today.toISOString().slice(0,10))) / (1000*60*60*24));
  if (completed) return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Completed</span>;
  if (dd < 0) return <span className="px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-700">Overdue by {Math.abs(dd)}d</span>;
  if (dd <= 7) return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Due in {dd}d</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">Due {new Date(deadline).toLocaleDateString()}</span>;
}

/* ------------------------- Charts ------------------------- */
function RadialProgress({ percent = 0, centerLabel = "of budget" }) { /* unchanged */ 
  const data = [{ name: "Progress", value: Math.max(0, Math.min(100, Math.round(percent))) }];
  return (
    <div className="relative h-[220px] w-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="70%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <defs><linearGradient id="gradProgress" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#10b981" /></linearGradient></defs>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={24} fill="url(#gradProgress)" background />
          <Tooltip formatter={(v) => `${v}%`} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center"><div className="text-3xl font-semibold text-slate-900">{Math.round(percent)}%</div><div className="text-xs text-slate-500">{centerLabel}</div></div>
      </div>
    </div>
  );
}
const GoalRadial = ({ savedCents, targetCents }) => (
  <RadialProgress percent={clamp01((savedCents||0)/Math.max(1, targetCents||1))*100} centerLabel="of target" />
);

/* ------------------------- Forms ------------------------- */
function GoalForm({ open, onClose, onSave, initial }) {
  /* =========================
     Limits & helpers
     ========================= */
  const MAX_INT_DIGITS = 7; // 9,999,999
  const MAX_AMOUNT_CENTS = 999999999; // 9,999,999.99
  const today = new Date();
  const twoYearsFromToday = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate());

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const minDeadline = ymd(today);
  const maxDeadline = ymd(twoYearsFromToday);

  const formatCommas = (raw, keepTrailingDot = false) => {
    if (!raw) return "";
    const s = String(raw).replace(/[^0-9.]/g, "");
    const [intP = "0", decP = ""] = s.split(".");
    const intClean = (intP || "0").replace(/^0+(?=\d)/, "") || "0";
    const withCommas = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (keepTrailingDot) return `${withCommas}.`;
    return decP !== "" ? `${withCommas}.${decP}` : withCommas;
  };
  const cleanAmount = (s) => (s || "").replace(/,/g, "");
  const moneyToCents = (s) => {
    const raw = cleanAmount(s);
    if (!raw) return 0;
    const [i = "0", d = ""] = raw.split(".");
    if (!/^\d+$/.test(i)) return 0;
    if (d && !/^\d{1,2}$/.test(d)) return 0;
    return Number(i) * 100 + Number(d.padEnd(2, "0").slice(0, 2) || 0);
  };
  const fromCentsSafe = (cents) => {
    if (typeof fromCents === "function") return fromCents(cents);
    return (Number(cents || 0) / 100).toFixed(2);
  };
  const toCentsSafe = (str) => {
    if (typeof toCents === "function") return toCents(str);
    return moneyToCents(str);
  };

  /* =========================
     Bubble (inline messages)
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
  const bubbleTimerRef = useRef(null);
  const [bubble, setBubble] = useState({ key: null, msg: "" });
  const showBubble = (key, msg, ms = 1600) => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubble({ key, msg });
    bubbleTimerRef.current = setTimeout(() => setBubble({ key: null, msg: "" }), ms);
  };

  /* =========================
     State
     ========================= */
  const [f, setF] = useState({ _id: null, name: "", target: "", deadline: "", priority: "medium" });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const val = fromCentsSafe(initial.targetCents || 0); // "1234.56"
      setF({
        _id: initial._id,
        name: initial.name || "",
        target: formatCommas(val),
        deadline: initial.deadline ? initial.deadline.slice(0, 10) : "",
        priority: initial.priority || "medium",
      });
    } else {
      setF({ _id: null, name: "", target: "", deadline: "", priority: "medium" });
    }
  }, [open, initial]);

  /* =========================
     Name: letters & spaces only
     ========================= */
  const onNameKeyDown = (e) => {
    // Allow control keys
    if (["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Home", "End"].includes(e.key)) return;
    // Allow letters (unicode) and spaces
    const ok = /^[\p{L}\s]$/u.test(e.key);
    if (!ok) {
      e.preventDefault();
      showBubble("name", "Letters and spaces only.");
    }
  };
  const onNamePaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text") || "";
    if (!/^[\p{L}\s]*$/u.test(text)) {
      e.preventDefault();
      showBubble("name", "Letters and spaces only.");
    }
  };
  const onNameChange = (e) => {
    const v = e.target.value;
    if (/^[\p{L}\s]*$/u.test(v)) setF({ ...f, name: v });
    else showBubble("name", "Letters and spaces only.");
  };

  /* =========================
     Target (money) input rules
     ========================= */
  const targetRef = useRef(null);

  const clampToMaxIfNeeded = (raw) => {
    const cents = moneyToCents(raw);
    if (cents > MAX_AMOUNT_CENTS) {
      showBubble("target", "Maximum is LKR 9,999,999.99");
      return "9,999,999.99";
    }
    return null;
  };

  const onTargetKeyDown = (e) => {
    // Disallow negatives, exponent, plus
    if (["-", "e", "E", "+"].includes(e.key)) {
      e.preventDefault();
      showBubble("target", "Positive number only (up to 2 decimals).");
      return;
    }
    if (e.key === ".") {
      // block if first char or if dot already exists
      const val = f.target || "";
      const raw = cleanAmount(val);
      if (!raw || raw.includes(".")) {
        e.preventDefault();
        showBubble("target", raw ? "Only one decimal point allowed." : "Cannot start with a decimal.");
      }
      return;
    }
  };

  const onTargetPaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text") || "";
    const raw = cleanAmount(text);

    // Must be digits with optional single dot, not starting with dot
    if (!/^\d+(\.\d{0,2})?$/.test(raw)) {
      e.preventDefault();
      showBubble("target", "Invalid amount format (up to 2 decimals).");
      return;
    }
    // Clamp if exceeds max
    const clamped = clampToMaxIfNeeded(raw);
    if (clamped !== null) {
      e.preventDefault();
      setF((prev) => ({ ...prev, target: formatCommas(clamped) }));
    }
  };

  const onTargetChange = (e) => {
    const incoming = e.target.value;
    const raw = cleanAmount(incoming);

    if (raw === "") {
      setF({ ...f, target: "" });
      return;
    }
    // Must be digits + optional single dot
    if (!/^\d*\.?\d*$/.test(raw)) {
      showBubble("target", "Digits and one dot only.");
      return;
    }
    // Cannot start with dot
    if (raw.startsWith(".")) {
      showBubble("target", "Cannot start with a decimal.");
      return;
    }

    const [intPart = "", decPart = ""] = raw.split(".");
    // Limit integer digits to 7
    if (intPart.length > MAX_INT_DIGITS) {
      setF({ ...f, target: "9,999,999.99" });
      showBubble("target", "Maximum is LKR 9,999,999.99");
      return;
    }
    // Max 2 decimal places while typing
    if (decPart.length > 2) {
      showBubble("target", "Up to 2 decimal places only.");
      return;
    }

    // Clamp if numeric value exceeds max
    const clamped = clampToMaxIfNeeded(raw);
    if (clamped !== null) {
      setF({ ...f, target: formatCommas(clamped) });
      return;
    }

    const keepDot = raw.endsWith(".") && !decPart.length;
    setF({ ...f, target: formatCommas(raw, keepDot) });
  };

  const onTargetBlur = () => {
    const raw = cleanAmount(f.target);
    // Validate full value; keep focus if invalid
    const refocus = () => setTimeout(() => targetRef.current?.focus(), 0);

    if (!raw) {
      showBubble("target", "Enter a positive amount.");
      refocus();
      return;
    }
    if (raw.startsWith(".")) {
      showBubble("target", "Cannot start with a decimal.");
      refocus();
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(raw) && !/^\d+$/.test(raw)) {
      // either int, or 1–2 decimals; ".000" or 3+ decimals invalid
      showBubble("target", "Invalid amount (use up to 2 decimals).");
      refocus();
      return;
    }
    // Disallow 3+ decimals explicitly
    const parts = raw.split(".");
    if (parts[1] && parts[1].length > 2) {
      showBubble("target", "Up to 2 decimal places only.");
      refocus();
      return;
    }
    const cents = moneyToCents(raw);
    if (cents <= 0) {
      showBubble("target", "Amount must be positive.");
      refocus();
      return;
    }
    if (cents > MAX_AMOUNT_CENTS) {
      setF((prev) => ({ ...prev, target: formatCommas("9,999,999.99") }));
      showBubble("target", "Maximum is LKR 9,999,999.99");
      refocus();
      return;
    }

    // Normalize formatting (keep user's decimals as-is; no forced trailing zeros)
    const [i = "0", d = ""] = raw.split(".");
    const normalized = d === "" ? String(Number(i)) : `${String(Number(i))}.${d}`;
    setF((prev) => ({ ...prev, target: formatCommas(normalized) }));
  };

  /* =========================
     Deadline validation
     ========================= */
  const onDeadlineChange = (e) => {
    const v = e.target.value;
    if (!v) {
      setF({ ...f, deadline: "" });
      return;
    }
    const d = new Date(v + "T00:00:00");
    if (d < new Date(minDeadline + "T00:00:00")) {
      showBubble("deadline", "Deadline cannot be in the past.");
      setF({ ...f, deadline: minDeadline });
      return;
    }
    if (d > new Date(maxDeadline + "T00:00:00")) {
      showBubble("deadline", "Max allowed is 2 years from today.");
      setF({ ...f, deadline: maxDeadline });
      return;
    }
    setF({ ...f, deadline: v });
  };

  /* =========================
     Submit
     ========================= */
  const submit = async (e) => {
    e.preventDefault();

    // Name validation
    if (!f.name || !/^[\p{L}\s]+$/u.test(f.name)) {
      showBubble("name", "Enter a valid name (letters & spaces).");
      return;
    }

    // Target validation (final)
    const raw = cleanAmount(f.target);
    if (!raw || raw.startsWith(".")) {
      showBubble("target", "Enter a positive amount (cannot start with a decimal).");
      targetRef.current?.focus();
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(raw) && !/^\d+$/.test(raw)) {
      showBubble("target", "Invalid amount (use up to 2 decimals).");
      targetRef.current?.focus();
      return;
    }
    const cents = moneyToCents(raw);
    if (cents <= 0) {
      showBubble("target", "Amount must be positive.");
      targetRef.current?.focus();
      return;
    }
    if (cents > MAX_AMOUNT_CENTS) {
      showBubble("target", "Maximum is LKR 9,999,999.99");
      setF((prev) => ({ ...prev, target: formatCommas("9,999,999.99") }));
      targetRef.current?.focus();
      return;
    }

    // Deadline range (optional)
    if (f.deadline) {
      const d = new Date(f.deadline + "T00:00:00");
      if (d < new Date(minDeadline + "T00:00:00") || d > new Date(maxDeadline + "T00:00:00")) {
        showBubble("deadline", "Deadline must be between today and 2 years from now.");
        return;
      }
    }

    const body = {
      name: f.name.trim(),
      targetCents: toCentsSafe(raw),
      deadline: f.deadline || undefined,
      priority: f.priority,
    };
    if (f._id) await onSave(f._id, body);
    else await onSave(null, body);
  };

  /* =========================
     Render
     ========================= */
  return (
    <Modal open={open} onClose={onClose} title={f._id ? "Edit Goal" : "Add Goal"}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Name" required>
          <div className="relative">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.name}
              onKeyDown={onNameKeyDown}
              onChange={onNameChange}
              onPaste={onNamePaste}
              placeholder="e.g. Emergency Fund"
              required
            />
            <Bubble show={bubble.key === "name"} message={bubble.msg} />
          </div>
        </Field>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Target (LKR)" required>
            <div className="relative">
              <input
                ref={targetRef}
                inputMode="decimal"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={f.target}
                onKeyDown={onTargetKeyDown}
                onChange={onTargetChange}
                onBlur={onTargetBlur}
                placeholder="e.g. 100,000.00"
                aria-describedby="targetHelp"
                required
              />
              <Bubble show={bubble.key === "target"} message={bubble.msg} />
              <p id="targetHelp" className="text-xs text-slate-500 mt-1">
                Positive number (max LKR 9,999,999.99), up to 2 decimals. Automatically comma-grouped.
              </p>
            </div>
          </Field>

          <Field label="Deadline">
            <div className="relative">
              <input
                type="date"
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                value={f.deadline}
                min={minDeadline}
                max={maxDeadline}
                onChange={onDeadlineChange}
              />
              <Bubble show={bubble.key === "deadline"} message={bubble.msg} />
              <p className="text-xs text-slate-500 mt-1">
                Choose a date from today up to 2 years ahead.
              </p>
            </div>
          </Field>

          <Field label="Priority" required>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.priority}
              onChange={(e) => setF({ ...f, priority: e.target.value })}
              required
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="px-4 py-2 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700">
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

function FundForm({ open, onClose, onSubmit, accounts, goal, mode = "fund" }) {
  /* =========================
     Currency helpers & limits
     ========================= */
  const MAX_AMOUNT_CENTS = 999999999; // 9,999,999.99
  const formatCommas = (raw, keepTrailingDot = false) => {
    if (!raw) return "";
    const s = String(raw).replace(/[^0-9.]/g, "");
    const [intP = "0", decP = ""] = s.split(".");
    const intClean = (intP || "0").replace(/^0+(?=\d)/, "") || "0";
    const withCommas = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (keepTrailingDot) return `${withCommas}.`;
    return decP !== "" ? `${withCommas}.${decP}` : withCommas;
  };
  const cleanAmount = (s) => (s || "").replace(/,/g, "");
  const moneyToCents = (s) => {
    const raw = cleanAmount(s);
    if (!raw) return 0;
    const [i = "0", d = ""] = raw.split(".");
    if (!/^\d+$/.test(i)) return 0;
    if (d && !/^\d{1,2}$/.test(d)) return 0;
    return Number(i) * 100 + Number(d.padEnd(2, "0").slice(0, 2) || 0);
  };
  const centsToPretty = (c) => (Number(c || 0) / 100).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const maxSevenIntDigits = (raw) => {
    const [i = ""] = cleanAmount(raw).split(".");
    return i.length <= 7;
  };

  // toCents fallback (if your helper exists we reuse it)
  const toCentsSafe = (str) => (typeof toCents === "function" ? toCents(str) : moneyToCents(str));

  /* =========================
     Bubble messages
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
  const bubbleTimerRef = useRef(null);
  const [bubble, setBubble] = useState({ key: null, msg: "" });
  const showBubble = (key, msg, ms = 1600) => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubble({ key, msg });
    bubbleTimerRef.current = setTimeout(() => setBubble({ key: null, msg: "" }), ms);
  };

  /* =========================
     State & derived
     ========================= */
  const [f, setF] = useState({ accountId: accounts[0]?._id || "", amount: "", note: "" });
  useEffect(() => {
    if (!open) return;
    setF({ accountId: accounts[0]?._id || "", amount: "", note: "" });
  }, [open, accounts]);

  const selectedAcc = useMemo(
    () => accounts.find(a => a._id === f.accountId),
    [accounts, f.accountId]
  );

  const balanceCents = Number(selectedAcc?.balanceCents || 0);
  const remainingCents = Math.max(0, (goal?.targetCents || 0) - (goal?.savedCents || 0));
  const goalSavedCents = Number(goal?.savedCents || 0);

  // Dynamic max depending on mode
  const dynamicMaxCents = useMemo(() => {
    if (mode === "fund") {
      const caps = [balanceCents, remainingCents, MAX_AMOUNT_CENTS].filter((n) => Number.isFinite(n));
      return Math.max(0, Math.min(...caps));
    }
    // withdraw
    return Math.max(0, Math.min(goalSavedCents, MAX_AMOUNT_CENTS));
  }, [mode, balanceCents, remainingCents, goalSavedCents]);

  // Pretty max label (for bubble)
  const dynamicMaxLabel = useMemo(() => `Maximum is LKR ${centsToPretty(dynamicMaxCents)}`, [dynamicMaxCents]);

  // Amount input helpers
  const amountRef = useRef(null);

  // Clamp helper
  const clampToDynamicMaxIfNeeded = (raw) => {
    const cents = moneyToCents(raw);
    if (cents > dynamicMaxCents) {
      showBubble("amount", dynamicMaxLabel);
      return (dynamicMaxCents / 100).toFixed(2); // plain string (no commas)
    }
    // Also enforce absolute ceiling of 9,999,999.99, in case dynamicMax is higher (shouldn’t be)
    if (cents > MAX_AMOUNT_CENTS) {
      showBubble("amount", "Maximum is LKR 9,999,999.99");
      return "9,999,999.99";
    }
    return null;
  };

  // Re-clamp when account switches (or goal/remaining changes)
  useEffect(() => {
    if (!f.amount) return;
    const raw = cleanAmount(f.amount);
    const clamped = clampToDynamicMaxIfNeeded(raw);
    if (clamped !== null) {
      setF((prev) => ({ ...prev, amount: formatCommas(clamped) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicMaxCents]);

  /* =========================
     Amount field validations
     ========================= */
  const onAmountKeyDown = (e) => {
    if (["-", "e", "E", "+"].includes(e.key)) {
      e.preventDefault();
      showBubble("amount", "Positive number only (up to 2 decimals).");
      return;
    }
    if (e.key === ".") {
      const val = f.amount || "";
      const raw = cleanAmount(val);
      if (!raw || raw.includes(".")) {
        e.preventDefault();
        showBubble("amount", raw ? "Only one decimal point allowed." : "Cannot start with a decimal.");
      }
      return;
    }
  };

  const onAmountPaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text") || "";
    const raw = cleanAmount(text);

    if (!/^\d+(\.\d{0,2})?$/.test(raw)) {
      e.preventDefault();
      showBubble("amount", "Invalid amount format (up to 2 decimals).");
      return;
    }
    if (!maxSevenIntDigits(raw)) {
      e.preventDefault();
      showBubble("amount", "Maximum is LKR 9,999,999.99");
      return;
    }
    const clamped = clampToDynamicMaxIfNeeded(raw);
    if (clamped !== null) {
      e.preventDefault();
      setF((prev) => ({ ...prev, amount: formatCommas(clamped) }));
    }
  };

  const onAmountChange = (e) => {
    const incoming = e.target.value;
    const raw = cleanAmount(incoming);

    if (raw === "") {
      setF({ ...f, amount: "" });
      return;
    }
    if (!/^\d*\.?\d*$/.test(raw)) {
      showBubble("amount", "Digits and one dot only.");
      return;
    }
    if (raw.startsWith(".")) {
      showBubble("amount", "Cannot start with a decimal.");
      return;
    }
    const [i = "", d = ""] = raw.split(".");
    // Limit integer part to 7 digits (9,999,999)
    if (i.length > 7) {
      setF({ ...f, amount: "9,999,999.99" });
      showBubble("amount", "Maximum is LKR 9,999,999.99");
      return;
    }
    // Max 2 decimal places while typing
    if (d.length > 2) {
      showBubble("amount", "Up to 2 decimal places only.");
      return;
    }

    const clamped = clampToDynamicMaxIfNeeded(raw);
    if (clamped !== null) {
      setF({ ...f, amount: formatCommas(clamped) });
      return;
    }

    const keepDot = raw.endsWith(".") && d.length === 0;
    setF({ ...f, amount: formatCommas(raw, keepDot) });
  };

  const onAmountBlur = () => {
    const raw = cleanAmount(f.amount);
    const refocus = () => setTimeout(() => amountRef.current?.focus(), 0);

    if (!raw) {
      showBubble("amount", "Enter a positive amount.");
      refocus();
      return;
    }
    if (raw.startsWith(".")) {
      showBubble("amount", "Cannot start with a decimal.");
      refocus();
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(raw) && !/^\d+$/.test(raw)) {
      showBubble("amount", "Invalid amount (use up to 2 decimals).");
      refocus();
      return;
    }
    const parts = raw.split(".");
    if (parts[1] && parts[1].length > 2) {
      showBubble("amount", "Up to 2 decimal places only.");
      refocus();
      return;
    }
    const cents = moneyToCents(raw);
    if (cents <= 0) {
      showBubble("amount", "Amount must be positive.");
      refocus();
      return;
    }

    // Dynamic cap check
    if (cents > dynamicMaxCents) {
      const fixed = (dynamicMaxCents / 100).toFixed(2);
      setF((prev) => ({ ...prev, amount: formatCommas(fixed) }));
      showBubble("amount", dynamicMaxLabel);
      refocus();
      return;
    }
    if (cents > MAX_AMOUNT_CENTS) {
      setF((prev) => ({ ...prev, amount: formatCommas("9,999,999.99") }));
      showBubble("amount", "Maximum is LKR 9,999,999.99");
      refocus();
      return;
    }

    // Normalize commas
    const [i = "0", d = ""] = raw.split(".");
    const normalized = d === "" ? String(Number(i)) : `${String(Number(i))}.${d}`;
    setF((prev) => ({ ...prev, amount: formatCommas(normalized) }));
  };

  /* =========================
     Derived flags (existing)
     ========================= */
  const amountCents = toCentsSafe(f.amount);
  const insufficient = mode === "fund" ? amountCents > balanceCents : false;
  const exceedsRemaining = mode === "fund" ? amountCents > remainingCents : false;
  const exceedsGoalBalance = mode === "withdraw" ? amountCents > goalSavedCents : false;

  /* =========================
     Submit
     ========================= */
  const submit = async (e) => {
    e.preventDefault();

    // Final amount checks
    const raw = cleanAmount(f.amount);
    if (!raw || raw.startsWith(".")) {
      showBubble("amount", "Enter a positive amount (cannot start with a decimal).");
      amountRef.current?.focus();
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(raw) && !/^\d+$/.test(raw)) {
      showBubble("amount", "Invalid amount (use up to 2 decimals).");
      amountRef.current?.focus();
      return;
    }
    const cents = moneyToCents(raw);
    if (cents <= 0) {
      showBubble("amount", "Amount must be positive.");
      amountRef.current?.focus();
      return;
    }
    if (cents > dynamicMaxCents) {
      showBubble("amount", dynamicMaxLabel);
      const fixed = (dynamicMaxCents / 100).toFixed(2);
      setF((prev) => ({ ...prev, amount: formatCommas(fixed) }));
      amountRef.current?.focus();
      return;
    }

    // Keep your original guards too (UX feedback area)
    if (insufficient) return alert("Insufficient balance in selected account.");
    if (exceedsRemaining) return alert("Amount exceeds remaining to reach target.");
    if (exceedsGoalBalance) return alert("Amount exceeds goal's saved balance.");

    await onSubmit({ accountId: f.accountId, amountCents: cents, note: f.note });
  };

  /* =========================
     Render
     ========================= */
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "fund" ? `Fund “${goal?.name || "Goal"}”` : `Withdraw from “${goal?.name || "Goal"}”`}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Account" required>
          <select
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
            value={f.accountId}
            onChange={(e) => setF({ ...f, accountId: e.target.value })}
          >
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
          {selectedAcc && (
            <p className="text-xs text-slate-500 mt-1">
              Available: {typeof LKR !== "undefined"
                ? LKR.format(balanceCents / 100)
                : (balanceCents / 100).toLocaleString("en-LK", { style: "currency", currency: "LKR" })}
            </p>
          )}
        </Field>

        <Field
          label={mode === "fund" ? "Amount to fund (LKR)" : "Amount to withdraw (LKR)"}
          required
        >
          <div className="relative">
            <input
              ref={amountRef}
              inputMode="decimal"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={f.amount}
              onKeyDown={onAmountKeyDown}
              onChange={onAmountChange}
              onBlur={onAmountBlur}
              placeholder="e.g. 100,000.00"
              aria-describedby="amountHelp"
              required
            />
            <Bubble show={bubble.key === "amount"} message={bubble.msg} />
            <p id="amountHelp" className="text-xs text-slate-500 mt-1">
              Positive number (max {mode === "fund"
                ? `LKR ${centsToPretty(dynamicMaxCents)}`
                : `LKR ${centsToPretty(dynamicMaxCents)}`}), up to 2 decimals. Automatically comma-grouped.
            </p>
          </div>

          {mode === "fund" && (
            <p className="text-xs text-slate-500 mt-1">
              Remaining to target: {typeof LKR !== "undefined"
                ? LKR.format(remainingCents / 100)
                : (remainingCents / 100).toLocaleString("en-LK", { style: "currency", currency: "LKR" })}
            </p>
          )}
          {mode === "withdraw" && (
            <p className="text-xs text-slate-500 mt-1">
              Goal balance: {typeof LKR !== "undefined"
                ? LKR.format(goalSavedCents / 100)
                : (goalSavedCents / 100).toLocaleString("en-LK", { style: "currency", currency: "LKR" })}
            </p>
          )}
        </Field>

        {(insufficient || exceedsRemaining || exceedsGoalBalance) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm px-3 py-2">
            {insufficient && <div>Insufficient balance in selected account.</div>}
            {exceedsRemaining && <div>Amount exceeds remaining to reach target.</div>}
            {exceedsGoalBalance && <div>Amount exceeds goal&apos;s saved balance.</div>}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className={`px-4 py-2 rounded-xl text-white ${(insufficient || exceedsRemaining || exceedsGoalBalance) ? "bg-slate-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"}`}
            disabled={insufficient || exceedsRemaining || exceedsGoalBalance}
          >
            {mode === "fund" ? "Fund" : "Withdraw"}
          </button>
          <button type="button" className="px-4 py-2 rounded-xl border border-slate-300" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------- Page ------------------------- */
export default function SavingsGoalsPage() {
  const [accounts, setAccounts] = useState([]);
  const [goals, setGoals] = useState([]);
  const [filters, setFilters] = useState({ status: "all", q: "", priority: "all" });
  const [openGoalForm, setOpenGoalForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fundOpen, setFundOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [activeGoal, setActiveGoal] = useState(null);
  const [err, setErr] = useState("");

  // Budget plan state
  const now = new Date();
  const period = periodOf(now);
  const { start: mStart, end: mEnd } = monthBounds(now.getFullYear(), now.getMonth());
  const [budgetSavingsRupees, setBudgetSavingsRupees] = useState(null);

  // --- NEW: debounced query value for filters.q ---
  const [qDebounced, setQDebounced] = useState(filters.q);
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(filters.q.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  const load = useCallback(async () => {
    setErr("");
    try {
      const [acc, list, plan] = await Promise.all([
        Accounts.list(),
        Goals.list({ status: filters.status, q: qDebounced, priority: filters.priority }),
        Budget.getPlan(period).catch(() => null),
      ]);
      setAccounts(acc);

      // ⬇️ prefix-only filter on goal name (case-insensitive) — keeps other logic intact
      const query = (qDebounced || "").trim().toLowerCase();
      const listPref = query
        ? list.filter((g) => String(g?.name || "").toLowerCase().startsWith(query))
        : list;
      setGoals(listPref);

      setBudgetSavingsRupees(plan?.savings?.amount ?? null); // planOut returns rupees
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message);
    }
  }, [filters.status, filters.priority, qDebounced, period]);

  // run loader whenever its deps change
  useEffect(() => {
    load();
  }, [load]);

  const onSaveGoal = async (id, body) => {
    if (id) await Goals.update(id, body);
    else await Goals.create(body);
    setOpenGoalForm(false);
    setEditing(null);
    await load();
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this goal? (It must be empty.)")) return;
    try {
      await Goals.remove(id);
      await load();
    } catch (e) {
      alert(e?.response?.data?.detail || e.message);
    }
  };

  const openFund = (g) => {
    setActiveGoal(g);
    setFundOpen(true);
  };
  const openWithdraw = (g) => {
    setActiveGoal(g);
    setWithdrawOpen(true);
  };

  const doFund = async ({ accountId, amountCents, note }) => {
    try {
      await Goals.fund(activeGoal._id, { accountId, amountCents, note });
      setFundOpen(false);
      setActiveGoal(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.detail || e.message);
    }
  };
  const doWithdraw = async ({ accountId, amountCents, note }) => {
    try {
      await Goals.withdraw(activeGoal._id, { accountId, amountCents, note });
      setWithdrawOpen(false);
      setActiveGoal(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.detail || e.message);
    }
  };

  const active = useMemo(() => goals.filter((g) => !g.completed), [goals]);
  const completed = useMemo(() => goals.filter((g) => g.completed), [goals]);

  // monthly totals (NET = funds - withdrawals)
  const {
    net: netMonthlyCents,
    inCents: monthlyInCents,
    outCents: monthlyOutCents,
  } = useMemo(() => sumMonthlySavingsActivity(goals, mStart, mEnd), [goals, mStart, mEnd]);

  // For budget usage, don't let negative withdrawals create negative usage
  const budgetCents = Number.isFinite(budgetSavingsRupees) ? toCents(budgetSavingsRupees) : 0;
  const usedForBudgetCents = Math.max(0, netMonthlyCents);
  const usedPct = budgetCents > 0 ? clamp01(usedForBudgetCents / budgetCents) * 100 : 0;

  // per-goal net this month
  const goalsNetThisMonth = useMemo(() => {
    const map = {};
    for (const g of goals) {
      let inC = 0,
        outC = 0;
      for (const e of g.ledger || []) {
        if (!e?.at) continue;
        if (!within(e.at, mStart, mEnd)) continue;
        if (e.kind === "fund") inC += Number(e.amountCents || 0);
        else if (e.kind === "withdraw") outC += Number(e.amountCents || 0);
      }
      map[g._id] = { net: inC - outC, inC, outC };
    }
    return map;
  }, [goals, mStart, mEnd]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="mx-auto max-w-6xl px-4">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600 mx-y-4">Savings Goals</h1>
            <p className="text-slate-500 text-sm">
              Plan savings, fund from any account, and track against your monthly budget.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded-xl border"
              onClick={() => generateSavingsPDF({ goals, filters, logoUrl: "/reportLogo.png" })}
            >
              Generate Report
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => {
                setEditing(null);
                setOpenGoalForm(true);
              }}
            >
              + Add Goal
            </button>
          </div>
        </header>

        <section className="mb-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-slate-500">
                  Savings Budget — {fmtMonth(new Date())} ({period})
                </div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Budget vs This Month’s Contributions
                </h2>
              </div>
              <div className="text-sm text-slate-500">
                {budgetSavingsRupees != null ? (
                  <span>
                    Budget set in <span className="font-medium">Budget Plan</span>
                  </span>
                ) : (
                  <span className="text-amber-600">No plan for this month</span>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mt-4 items-center">
              <div className="flex justify-center">
                <RadialProgress percent={usedPct} centerLabel="of budget" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Budgeted</span>
                  <span className="font-semibold">
                    {budgetSavingsRupees != null ? LKR.format(Number(budgetSavingsRupees)) : "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Contributed this month (net)</span>
                  <span
                    className={`font-semibold ${
                      netMonthlyCents < 0 ? "text-rose-600" : netMonthlyCents > 0 ? "text-emerald-700" : ""
                    }`}
                  >
                    {LKR.format(netMonthlyCents / 100)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Gross in / out</span>
                  <span className="text-slate-600">
                    {LKR.format(monthlyInCents / 100)} in · {LKR.format(monthlyOutCents / 100)} out
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Remaining in budget</span>
                  <span
                    className={`font-semibold ${
                      usedForBudgetCents > budgetCents ? "text-rose-600" : ""
                    }`}
                  >
                    {budgetSavingsRupees != null
                      ? LKR.format(Math.max(0, budgetCents - usedForBudgetCents) / 100)
                      : "—"}
                  </span>
                </div>

                <div className="h-px bg-slate-100" />
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                    <div className="text-slate-500">Active goals</div>
                    <div className="text-slate-900 font-semibold">{active.length}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                    <div className="text-slate-500">Completed</div>
                    <div className="text-slate-900 font-semibold">{completed.length}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-200">
                    <div className="text-slate-500">Avg net / goal</div>
                    <div className="text-slate-900 font-semibold">
                      {goals.length ? LKR.format((netMonthlyCents / 100) / goals.length) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <div className="grid sm:grid-cols-8 gap-3 mb-6">
          <Field label="Status">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </Field>

          <Field label="Priority">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            >
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>

          <div className="sm:col-span-6">
            <Field label="Search">
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="goal name"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setQDebounced(filters.q.trim()); // trigger immediate search on Enter
                  }
                }}
              />
            </Field>
          </div>
        </div>

        {err && (
          <div className="p-3 mb-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">
            {err}
          </div>
        )}

        {/* Active */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Active</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {active.length === 0 && <div className="text-slate-500">No active goals.</div>}
            {active.map((g) => {
              const remaining = Math.max(0, (g.targetCents || 0) - (g.savedCents || 0));
              const agg = goalsNetThisMonth[g._id] || { net: 0, inC: 0, outC: 0 };
              return (
                <div key={g._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="text-lg font-semibold text-slate-900">{g.name}</div>
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={g.priority} />
                        <DueBadge deadline={g.deadline} completed={g.completed} />
                      </div>
                    </div>
                    <div className="text-sm text-slate-600">
                      Target:{" "}
                      <span className="font-medium">{LKR.format((g.targetCents || 0) / 100)}</span>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4 items-center">
                    <div className="flex justify-center">
                      <GoalRadial savedCents={g.savedCents} targetCents={g.targetCents} />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Saved</span>
                        <span className="font-medium">{LKR.format((g.savedCents || 0) / 100)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Remaining</span>
                        <span className="font-medium">{LKR.format(remaining / 100)}</span>
                      </div>
                      {g.deadline && (
                        <div className="text-xs text-slate-500">
                          Deadline: {new Date(g.deadline).toLocaleDateString()}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Net this month</span>
                        <span
                          className={`font-medium ${
                            agg.net < 0 ? "text-rose-600" : agg.net > 0 ? "text-emerald-700" : ""
                          }`}
                        >
                          {LKR.format(agg.net / 100)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex justify-end">
                        ({LKR.format(agg.inC / 100)} in · {LKR.format(agg.outC / 100)} out)
                      </div>

                      <div className="h-px bg-slate-100" />
                      <div className="pt-1 flex flex-wrap gap-2">
                        <button
                          className="px-3 py-1.5 rounded-xl border"
                          onClick={() => {
                            setEditing(g);
                            setOpenGoalForm(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="px-3 py-1.5 rounded-xl border border-red-300 text-red-600"
                          onClick={() => onDelete(g._id)}
                        >
                          Delete
                        </button>
                        <button
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white"
                          onClick={() => openFund(g)}
                        >
                          Fund
                        </button>
                        <button
                          className="px-3 py-1.5 rounded-xl bg-slate-800 text-white"
                          onClick={() => openWithdraw(g)}
                        >
                          Withdraw
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Completed */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Completed</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {completed.length === 0 && <div className="text-slate-500">No completed goals yet.</div>}
            {completed.map((g) => {
              const agg = goalsNetThisMonth[g._id] || { net: 0, inC: 0, outC: 0 };
              return (
                <div key={g._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="text-lg font-semibold text-slate-900">{g.name}</div>
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={g.priority} />
                        <DueBadge deadline={g.deadline} completed={g.completed} />
                      </div>
                    </div>
                    <div className="text-sm text-slate-600">
                      Target:{" "}
                      <span className="font-medium">{LKR.format((g.targetCents || 0) / 100)}</span>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4 items-center">
                    <div className="flex justify-center">
                      <GoalRadial savedCents={g.savedCents} targetCents={g.targetCents} />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Saved</span>
                        <span className="font-medium">{LKR.format((g.savedCents || 0) / 100)}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Completed on: {new Date(g.updatedAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">Net this month</span>
                        <span
                          className={`font-medium ${
                            agg.net < 0 ? "text-rose-600" : agg.net > 0 ? "text-emerald-700" : ""
                          }`}
                        >
                          {LKR.format(agg.net / 100)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex justify-end">
                        ({LKR.format(agg.inC / 100)} in · {LKR.format(agg.outC / 100)} out)
                      </div>
                      <div className="h-px bg-slate-100" />
                      <div className="pt-1 flex flex-wrap gap-2">
                        <button
                          className="px-3 py-1.5 rounded-xl border"
                          onClick={() => {
                            setEditing(g);
                            setOpenGoalForm(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="px-3 py-1.5 rounded-xl border border-red-300 text-red-600"
                          onClick={() => onDelete(g._id)}
                        >
                          Delete
                        </button>
                        <button
                          className="px-3 py-1.5 rounded-xl bg-slate-800 text-white"
                          onClick={() => openWithdraw(g)}
                        >
                          Withdraw
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Modals */}
        <GoalForm
          open={openGoalForm}
          onClose={() => {
            setOpenGoalForm(false);
            setEditing(null);
          }}
          onSave={onSaveGoal}
          initial={editing}
        />
        <FundForm
          open={fundOpen}
          onClose={() => {
            setFundOpen(false);
            setActiveGoal(null);
          }}
          onSubmit={doFund}
          accounts={accounts}
          goal={activeGoal}
          mode="fund"
        />
        <FundForm
          open={withdrawOpen}
          onClose={() => {
            setWithdrawOpen(false);
            setActiveGoal(null);
          }}
          onSubmit={doWithdraw}
          accounts={accounts}
          goal={activeGoal}
          mode="withdraw"
        />
      </div>
    </div>
  );
}
