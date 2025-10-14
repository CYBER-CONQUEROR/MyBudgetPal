// src/pages/BudgetPlanPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { thisMonth, nextMonthOfToday, monthLabel, addMonths, money } from "../budget/utils";
import { C } from "../budget/compute";
import { deletePlanApi, getPlan } from "../budget/api";
import useBudgetData from "../budget/useBudgetData";
import { buildDtdRows, buildModules, totalsFromModules, buildBarData } from "../budget/compute";
import SummaryCard from "../components/budget/SummaryCard";
import PeriodStrip from "../components/budget/PeriodStrip";
import DtdTable from "../components/budget/DtdTable";
import BudgetPie from "../components/budget/BudgetPie";
import CategoryBars from "../components/budget/CategoryBars";
import CreateBudgetModal from "../components/budget/modals/CreateBudgetModal";
import EditBudgetModal from "../components/budget/modals/EditBudgetModal";
import EditOneModal from "../components/budget/modals/EditOneModal";
import EditDtdOneModal from "../components/budget/modals/EditDtdOneModal";
import DangerZone from "../components/budget/DangerZone";

// NEW
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import api from "../api/api.js";

// Icons for buttons
import { FileText, PencilLine, PlusCircle } from "lucide-react";

/* ==========================================================================================
   FLEXIBLE RAW-DATA AGGREGATION (no special /actuals endpoints required)
   ========================================================================================== */

/** Try to parse a JS date (ms) from various common fields */
function tsOf(x) {
  const v =
    x?.at ??
    x?.date ??
    x?.when ??
    x?.paidAt ??
    x?.dueDate ??
    x?.dates?.end ??
    x?.dates?.due ??
    x?.dates?.start ??
    x?.createdAt ??
    x?.updatedAt;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
}

/** Get rupees from object that may store amount in cents or rupees */
function rupeesOf(x) {
  if (x == null) return 0;
  if (x.spentCents != null) return Number(x.spentCents || 0) / 100;
  if (x.amountCents != null) return Number(x.amountCents || 0) / 100;
  if (x.amount != null) return Number(x.amount || 0);
  if (x.value != null) return Number(x.value || 0);
  return 0;
}

/** In-range check for timestamps (millis) */
function withinMs(ms, startMs, endMs) {
  return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
}

/** Month start/end helpers (UTC to avoid TZ bleed) */
function monthBounds(period /* 'YYYY-MM' */) {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
}

/** Safely read a Category id string from different shapes */
function categoryIdOf(e) {
  const v = e?.categoryId ?? e?.category ?? e?.category_id;
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return String(v._id ?? v.id ?? "");
  return "";
}

/** Sum DTD expenses (and per-category breakdown) from a raw list */
function aggregateDtdActual(expenses, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;
  const byCat = {};
  for (const e of Array.isArray(expenses) ? expenses : []) {
    const ms = tsOf(e);
    if (!withinMs(ms, startMs, endMs)) continue;
    const amt = rupeesOf(e);
    total += amt;
    const cid = categoryIdOf(e);
    if (cid) byCat[cid] = (byCat[cid] || 0) + amt;
  }
  return { total, byCat };
}

/** Sum bank commitments paid in month (paidAt preferred, else dueDate) */
function aggregateCommitmentsActual(commitments, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;
  for (const c of Array.isArray(commitments) ? commitments : []) {
    const ms = tsOf({ ...c, at: c?.paidAt ?? c?.dueDate });
    if (!withinMs(ms, startMs, endMs)) continue;
    total += rupeesOf(c);
  }
  return total;
}

/** Sum events actuals in month */
function aggregateEventsActual(events, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;
  for (const ev of Array.isArray(events) ? events : []) {
    const ms = tsOf(ev);
    if (!withinMs(ms, startMs, endMs)) continue;
    total += rupeesOf(ev);
  }
  return total;
}

/** Net savings contributions across all goals' ledgers in month (fund - withdraw) */
function aggregateSavingsActual(goals, start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  let net = 0;
  for (const g of Array.isArray(goals) ? goals : []) {
    for (const e of Array.isArray(g?.ledger) ? g.ledger : []) {
      const ms = tsOf(e);
      if (!withinMs(ms, startMs, endMs)) continue;
      const amt = rupeesOf(e); // ledger uses amountCents
      if (e?.kind === "fund") net += amt;
      else if (e?.kind === "withdraw") net -= amt;
    }
  }
  return net;
}

/* ======================= CONFIG: tweak if your backend paths differ ======================= */
const listEndpoints = {
  expenses: "expenses",      // DTD expenses
  events: "events",          // Events spending
  commitments: "commitments",// BankCommitment occurrences
  savingsGoals: "savings-goals", // include ledgers
};

// Helper: extract array from common list response shapes
function extractArray(resp) {
  const d = resp?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.results)) return d.results;
  if (d && typeof d === "object") {
    for (const v of Object.values(d)) if (Array.isArray(v)) return v;
  }
  return [];
}

async function fetchList(path, params) {
  try {
    const r = await api.get(path, params ? { params } : undefined);
    return extractArray(r);
  } catch (e1) {
    try {
      const r2 = await api.get(path);
      return extractArray(r2);
    } catch (e2) {
      console.error("fetchList failed", path, params, e2?.response?.status, e2?.message);
      return [];
    }
  }
}

/** For range export: pull raw lists and compute Actuals for one period */
async function computeActualsForPeriod(period) {
  const { start, end } = monthBounds(period);
  const params = {
    start: start.toISOString(),
    end: end.toISOString(),
    includeArchived: "false",
  };

  // fetch in parallel
  const [expenses, events, commitments, savingsGoals] = await Promise.all([
    fetchList(listEndpoints.expenses, params),
    fetchList(listEndpoints.events, params),
    fetchList(listEndpoints.commitments, params),
    fetchList(listEndpoints.savingsGoals, { ...params, includeLedger: "true" }),
  ]);

  const dtdAgg = aggregateDtdActual(expenses, start, end);
  const eventsTotal = aggregateEventsActual(events, start, end);
  const commitmentsTotal = aggregateCommitmentsActual(commitments, start, end);
  const savingsNet = aggregateSavingsActual(savingsGoals, start, end);

  const actuals = {
    savings: savingsNet,
    commitments: commitmentsTotal,
    events: eventsTotal,
    dtd: dtdAgg.total,
  };
  const dtdActuals = dtdAgg.byCat;

  return { actuals, dtdActuals };
}

/* ---------------- PDF helpers ---------------- */
function makeReportFilename(prefix, ts = new Date()) {
  return `${prefix}_${ts.toISOString().replace(/[:T]/g, "-").slice(0, 15)}.pdf`;
}

/**
 * PDF generator — expects each plan item as:
 *   { period: 'YYYY-MM', plan, actuals, dtdActuals: {catId: rupees} }
 */
// ---- Logo URL (pick one that fits your app) ----
const PUBLIC_LOGO_URL =
  process.env.REACT_APP_PUBLIC_LOGO_URL ||      // CRA style
  import.meta?.env?.VITE_PUBLIC_LOGO_URL ||     // Vite style
  "/reportLogo.png";                            // fallback

// ---- Helper: load image as data URL for jsPDF ----
export async function loadImageDataURL(url) {
  try {
    const res = await fetch(url, { cache: "no-store", mode: "cors" });
    if (!res.ok) throw new Error(`Failed to fetch logo: ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    return dataUrl;
  } catch (e) {
    console.warn("Logo load failed; continuing without logo:", e);
    return null;
  }
}

async function generateBudgetPDF({
  plans,
  rangeLabel,
  logoUrl = PUBLIC_LOGO_URL, // keep same source used by Commitments
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  // ===== layout & palette (same as Commitments) =====
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const brand = { r: 79, g: 70, b: 229 };        // indigo-600
  const brandLight = { r: 241, g: 245, b: 255 }; // indigo-50
  const slateTxt = 40;
  const TOTAL_PAGES_TOKEN = "{total_pages_count_string}";

  // helpers
  const humanDateTime = new Date().toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const drawFooter = () => {
    doc.setDrawColor(235).setLineWidth(1);
    doc.line(margin, pageH - 40, pageW - margin, pageH - 40);
    doc.setFontSize(9).setTextColor(120);
    doc.text(`Generated: ${humanDateTime}`, margin, pageH - 22);
    const pageStr = `Page ${doc.internal.getNumberOfPages()} of ${TOTAL_PAGES_TOKEN}`;
    const pageX = pageW - margin - 120; // match Commitments inset
    doc.text(pageStr, pageX, pageH - 22, { align: "right" });
    doc.setTextColor(slateTxt);
  };

  // ===== header (logo + brand title + indigo separator) =====
  const logoSize = 46;
  const headerY = margin;
  try {
    const dataUrl = await loadImageDataURL(logoUrl);
    if (dataUrl) doc.addImage(dataUrl, "PNG", margin, headerY, logoSize, logoSize);
  } catch {}
  const headerTextX = margin + logoSize + 12;
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(slateTxt);
  doc.text("My Budget Pal", headerTextX, headerY + 30);

  const sepY = headerY + logoSize + 12;
  doc.setDrawColor(brand.r, brand.g, brand.b).setLineWidth(2);
  doc.line(margin, sepY, pageW - margin, sepY);

  // Title (centered)
  const titleY = sepY + 28;
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(slateTxt);
  doc.text("Budget Plans Report", pageW / 2, titleY, { align: "center" });

  // ===== soft filter panel (same style) =====
  const boxX = margin;
  const boxY = titleY + 20;
  const filterLines = [`Range : ${rangeLabel || "—"}`];
  const lineH = 14;
  const boxH = filterLines.length * lineH + 16;
  const boxW = pageW - margin * 2;

  doc.setDrawColor(230).setFillColor(brandLight.r, brandLight.g, brandLight.b);
  doc.roundedRect(boxX, boxY, boxW, boxH, 6, 6, "F");

  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(100);
  let fy = boxY + 12;
  filterLines.forEach((line) => { doc.text(line, boxX + 10, fy + 10); fy += lineH; });
  doc.setTextColor(slateTxt);

  // watermark (same)
  doc.setFontSize(10).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
  doc.setTextColor(slateTxt);

  // ===== tables =====
  let y = boxY + boxH + 22;
  let grandBudgeted = 0;
  let grandActual = 0;

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
      fillColor: [brand.r, brand.g, brand.b], // indigo header like Commitments
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: { fillColor: [247, 248, 250] },
    didDrawPage: () => drawFooter(),
  };

  for (const { period, plan, actuals, dtdActuals } of (plans || [])) {
    // New page if tight
    if (y > pageH - 160) {
      doc.addPage();
      drawFooter();
      // re-watermark
      doc.setFontSize(10).setTextColor(120);
      doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
      doc.setTextColor(slateTxt);
      y = margin;
    }

    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(slateTxt);
    doc.text(`Period: ${period}`, margin, y);
    y += 16;

    if (!plan) {
      doc.setFont("helvetica", "italic").setFontSize(11).setTextColor(80);
      doc.text("No plan for this month.", margin, y);
      y += 24;
      continue;
    }

    // High-level Budget vs Actual
    const rowsA = [
      ["Savings",      money(plan?.savings?.amount || 0),      money(actuals?.savings || 0)],
      ["Commitments",  money(plan?.commitments?.amount || 0),  money(actuals?.commitments || 0)],
      ["Events",       money(plan?.events?.amount || 0),       money(actuals?.events || 0)],
      ["DTD Total",    money(plan?.dtd?.amount || 0),          money(actuals?.dtd || 0)],
    ];

    const totalBudgeted =
      (plan?.savings?.amount || 0) +
      (plan?.commitments?.amount || 0) +
      (plan?.events?.amount || 0) +
      (plan?.dtd?.amount || 0);

    const totalActual =
      (actuals?.savings || 0) +
      (actuals?.commitments || 0) +
      (actuals?.events || 0) +
      (actuals?.dtd || 0);

    grandBudgeted += totalBudgeted;
    grandActual   += totalActual;

    autoTable(doc, {
      ...tableCommon,
      startY: y,
      head: [["Category", "Budgeted", "Actual"]],
      body: rowsA,
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
    y = (doc.lastAutoTable?.finalY || y) + 14;

    // DTD sub-budgets
    if (plan?.dtd?.subBudgets?.length) {
      const dtdRows = plan.dtd.subBudgets.map((sb) => {
        const catId = String(sb?.categoryId?._id ?? sb?.categoryId ?? "");
        const name = sb?.name || sb?.categoryId?.name || "—";
        const budgetR = Number(sb?.amount || 0);
        const actualR = (dtdActuals && Number(dtdActuals[catId])) || 0;
        return [name, money(budgetR), money(actualR)];
      });

      autoTable(doc, {
        ...tableCommon,
        startY: y,
        head: [["DTD Category", "Budgeted", "Actual"]],
        body: dtdRows,
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      });
      y = (doc.lastAutoTable?.finalY || y) + 20;
    }

    // Period totals
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(slateTxt);
    doc.text(`Total Budgeted: ${money(totalBudgeted)}`, margin, y);
    y += 14;
    doc.text(`Total Actual:   ${money(totalActual)}`, margin, y);
    y += 24;
  }

  // ===== Summary (same look/feel as Commitments) =====
  if (y > pageH - 120) {
    doc.addPage();
    drawFooter();
    // re-watermark
    doc.setFontSize(10).setTextColor(120);
    doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
    doc.setTextColor(slateTxt);
    y = margin + 10;
  }

  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(slateTxt);
  doc.text("Summary", margin, y);
  y += 10;
  doc.setDrawColor(brand.r, brand.g, brand.b).setLineWidth(1);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

  // aligned label : value (tight)
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(60);
  const rowsSum = [
    ["Grand Total Budgeted", money(grandBudgeted)],
    ["Grand Total Actual",   money(grandActual)],
  ];
  const labelX = margin + 10;
  const labelWidths = rowsSum.map(([lbl]) => doc.getTextWidth(lbl));
  const maxLabelW = Math.max(...labelWidths);
  const colonX = labelX + maxLabelW + 6;
  const valueAnchor = Math.min(pageW - margin - 40, colonX + 10 + 220);
  const lineGap = 18;

  rowsSum.forEach(([label, value]) => {
    doc.text(label, labelX, y);
    doc.text(":", colonX, y);
    doc.text(value, valueAnchor, y, { align: "right" });
    y += lineGap;
  });

  doc.setDrawColor(230).setLineWidth(1);
  doc.line(margin, y, pageW - margin, y);
  y += 24;

  // ===== signature (bottom aligned) =====
  let sigY = pageH - 68;
  if (sigY - y < 40) {
    doc.addPage();
    drawFooter();
    sigY = pageH - 68;
  }
  doc.setFont("helvetica", "normal").setFontSize(12).setTextColor(slateTxt);
  doc.text("Authorized Signature : ____________________________________", margin, sigY);

  // finalize X of Y and save
  if (typeof doc.putTotalPages === "function") doc.putTotalPages(TOTAL_PAGES_TOKEN);
  const fn = makeReportFilename("BudgetReport");
  doc.save(fn);
}


/* ---------------- Component ---------------- */
export default function BudgetPlanPage() {
  const [period, setPeriod] = useState(thisMonth());
  const { plan, income, dtdExpenses, loading, error, refetch, actuals } = useBudgetData(period);

  const realCurrent = thisMonth();
  const realNext = nextMonthOfToday();
  const isCurrentPeriod = period === realCurrent;
  const isNextOfToday = period === realNext;

  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showEditWhole, setShowEditWhole] = useState(false);
  const [showEditOne, setShowEditOne] = useState(null);
  const [showEditDtdOne, setShowEditDtdOne] = useState(null);

  // === availability of months with plans (plus allow exactly one month ahead)
  const [availablePeriods, setAvailablePeriods] = useState([]);

  const budgets = useMemo(
    () => ({
      savings: Number(plan?.savings?.amount || 0),
      commitments: Number(plan?.commitments?.amount || 0),
      events: Number(plan?.events?.amount || 0),
      dtdTotal: Number(plan?.dtd?.amount || 0),
      income: income || 0,
    }),
    [plan, income]
  );

  const dtdRows = useMemo(() => buildDtdRows(plan, dtdExpenses), [plan, dtdExpenses]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? dtdRows.filter((r) => r.name.toLowerCase().includes(q)) : dtdRows;
  }, [filter, dtdRows]);

  const modules = useMemo(() => buildModules(budgets, C), [budgets]);
  const totalBudgeted = useMemo(() => totalsFromModules(modules), [modules]);
  const unbudgeted = Math.max(0, budgets.income - totalBudgeted);

  const barData = useMemo(() => buildBarData(budgets, actuals), [budgets, actuals]);

  const canCreateForThisPeriod = isCurrentPeriod;
  const showForecastCard = !plan && isNextOfToday;
  const showCreateButton = !plan && canCreateForThisPeriod;

  // Build a window of months to check (12 months back up to next month)
  const buildWindow = () => {
    const arr = [];
    let cur = addMonths(thisMonth(), -12);
    const limit = nextMonthOfToday();
    while (cur <= limit) {
      arr.push(cur);
      cur = addMonths(cur, +1);
    }
    return arr;
  };

  // Prefetch which months have plans (run once)
  useEffect(() => {
    let alive = true;
    (async () => {
      const windowMonths = buildWindow();
      const hits = await Promise.all(
        windowMonths.map((m) => getPlan(m).then((p) => (p ? m : null)).catch(() => null))
      );
      if (alive) setAvailablePeriods(hits.filter(Boolean));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh the availability list after mutations
  const refreshAvailable = async () => {
    const windowMonths = buildWindow();
    const hits = await Promise.all(
      windowMonths.map((m) => getPlan(m).then((p) => (p ? m : null)).catch(() => null))
    );
    setAvailablePeriods(hits.filter(Boolean));
  };

  const goPrev = () => setPeriod((p) => addMonths(p, -1));
  const goNext = () => setPeriod((p) => {
    const next = addMonths(p, +1);
    return next <= nextMonthOfToday() ? next : p;
  });

  const onChangeBlocked = async (newPeriod) => {
    if (newPeriod === period) return;
    const nextAllowed = nextMonthOfToday();
    if (newPeriod === nextAllowed) {
      setPeriod(newPeriod);
      return;
    }
    const p = await getPlan(newPeriod).catch(() => null);
    if (p) {
      setPeriod(newPeriod);
      if (!availablePeriods.includes(newPeriod)) {
        setAvailablePeriods((prev) => [...prev, newPeriod]);
      }
    } else {
      window.alert("No budget plan for that month.");
    }
  };

  const deletePlan = async () => {
    if (!plan) return;
    if (!window.confirm("Delete this month's budget plan? This cannot be undone.")) return;
    await deletePlanApi(period);
    await refetch();
    await refreshAvailable();
  };

  /* --------- Report state --------- */
  const [startMonth, setStartMonth] = useState(thisMonth());
  const [endMonth, setEndMonth] = useState(thisMonth());
  const [loadingReport, setLoadingReport] = useState(false);

  // Build current month DTD actuals map for the single-month PDF (still uses hook data)
  const dtdActualsMap = useMemo(() => {
    const hasBreakdown = actuals && actuals.dtdBreakdown && typeof actuals.dtdBreakdown === "object";
    if (hasBreakdown) return actuals.dtdBreakdown;
    const { byCat } = aggregateDtdActual(
      dtdExpenses || [],
      monthBounds(period).start,
      monthBounds(period).end
    );
    return byCat;
  }, [actuals, dtdExpenses, period]);

  const generateSingle = async () => {
    setLoadingReport(true);
    try {
      const p = await getPlan(period).catch(() => null);
      let moduleActuals = actuals;
      if (
        !moduleActuals ||
        (moduleActuals &&
          [moduleActuals.savings, moduleActuals.commitments, moduleActuals.events, moduleActuals.dtd].every(
            (v) => v == null
          ))
      ) {
        const { actuals: computed } = await computeActualsForPeriod(period);
        moduleActuals = computed;
      }
      await generateBudgetPDF({
        plans: [{ period, plan: p, actuals: moduleActuals, dtdActuals: dtdActualsMap }],
        rangeLabel: monthLabel(period),
      });
    } finally {
      setLoadingReport(false);
    }
  };

  const generateRange = async () => {
    setLoadingReport(true);
    try {
      const plans = [];
      let cur = startMonth;
      while (cur <= endMonth) {
        const p = await getPlan(cur).catch(() => null);
        const { actuals: a, dtdActuals } = await computeActualsForPeriod(cur);
        plans.push({ period: cur, plan: p, actuals: a, dtdActuals });
        cur = addMonths(cur, +1);
      }
      await generateBudgetPDF({
        plans,
        rangeLabel: `${monthLabel(startMonth)} → ${monthLabel(endMonth)}`,
      });
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="animate-pulse h-48 rounded-2xl bg-slate-100" />
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 p-6">
            {error}
          </div>
        ) : (
          <>
            {/* Header & actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="pb-1 text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600">
                  Budget Management
                </h1>
                <p className="text-sm text-slate-600">
                  Manage your monthly budget and track your spending with ease.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Generate Report */}
                <button
                  onClick={generateSingle}
                  className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:opacity-60 inline-flex items-center gap-2"
                  disabled={loadingReport}
                  title="Generate PDF for current month"
                >
                  <FileText size={18} className="shrink-0" />
                  <span>Generate Report</span>
                </button>

                {/* Edit Budget Plan */}
                <button
                  className={`px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300 inline-flex items-center gap-2 ${
                    plan ? "" : "opacity-40 cursor-not-allowed"
                  }`}
                  onClick={() => plan && setShowEditWhole(true)}
                  disabled={!plan}
                  title="Edit this month's budget plan"
                >
                  <PencilLine size={18} className="shrink-0" />
                  <span>Edit Budget Plan</span>
                </button>

                {/* Add Budget */}
                <button
                  className={`px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 inline-flex items-center gap-2 ${
                    plan || !canCreateForThisPeriod ? "opacity-40 cursor-not-allowed" : ""
                  }`}
                  onClick={() => !plan && canCreateForThisPeriod && setShowCreate(true)}
                  disabled={!!plan || !canCreateForThisPeriod}
                  title={canCreateForThisPeriod ? "Add budget for this month" : "Only current month allowed"}
                >
                  <PlusCircle size={18} className="shrink-0" />
                  <span>Add Budget</span>
                </button>
              </div>
            </div>

            {/* Range Report Section */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Generate Range Report</h2>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-sm text-slate-600 mr-3">Start Month</label>
                  <input
                    type="month"
                    value={startMonth}
                    onChange={(e) => setStartMonth(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-4 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-600 mr-3">End Month</label>
                  <input
                    type="month"
                    value={endMonth}
                    onChange={(e) => setEndMonth(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-4 focus:ring-indigo-200"
                  />
                </div>
                <button
                  onClick={generateRange}
                  disabled={loadingReport}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:opacity-60"
                >
                  Generate Range Report
                </button>
              </div>
            </div>

            {/* Period strip navigation */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
              <PeriodStrip
                period={period}
                plan={plan}
                availablePeriods={availablePeriods}
                onPrev={goPrev}
                onNext={goNext}
                onChangeBlocked={onChangeBlocked}
              />
            </div>

            {/* No plan states */}
            {!plan &&
              (nextMonthOfToday() === period ? (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6 flex items-center justify-between">
                  <div>
                    <div className="text-indigo-900 font-semibold">
                      Get the Budget Forecast for {monthLabel(period)}
                    </div>
                    <div className="text-indigo-700/80 text-sm">
                      See a suggested allocation based on your recent spending and commitments.
                    </div>
                  </div>
                  <button
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                    onClick={() => (window.location.href = `/budget/forecast?period=${period}`)}
                  >
                    Get Forecast
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-between shadow-sm">
                  <div>
                    <div className="text-slate-800 font-semibold">No plan for {monthLabel(period)}</div>
                    <div className="text-slate-500 text-sm">
                      {period === thisMonth()
                        ? "Create a budget plan to get started."
                        : "There is no budget plan for this month."}
                    </div>
                  </div>
                  {!plan && isCurrentPeriod && (
                    <button
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
                      onClick={() => setShowCreate(true)}
                    >
                      Create Budget Plan
                    </button>
                  )}
                </div>
              ))}

            {/* Has plan */}
            {plan && (
              <>
                <div className="grid grid-cols-12 gap-3">
                  <SummaryCard
                    label="Savings"
                    value={budgets.savings}
                    color={C.indigo}
                    onEdit={() => setShowEditOne("savings")}
                  />
                  <SummaryCard
                    label="Commitments"
                    value={budgets.commitments}
                    color={C.green}
                    onEdit={() => setShowEditOne("commitments")}
                  />
                  <SummaryCard
                    label="Events"
                    value={budgets.events}
                    color={C.teal}
                    onEdit={() => setShowEditOne("events")}
                  />
                  <SummaryCard label="DTD Total" value={budgets.dtdTotal} color={C.amber} disabled />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <DtdTable
                    rows={filtered}
                    total={budgets.dtdTotal}
                    filter={filter}
                    setFilter={setFilter}
                    onEditRow={(r) => setShowEditDtdOne({ categoryId: r.categoryId, name: r.name, alloc: r.alloc })}
                  />
                </div>

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-6">
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
                      <BudgetPie
                        modules={modules}
                        totalBudgeted={totalBudgeted}
                        unbudgeted={unbudgeted}
                      />
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-6">
                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
                      <CategoryBars data={barData} />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-rose-200 bg-rose-50/60">
                  <DangerZone onDelete={deletePlan} />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateBudgetModal
          period={period}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refetch();
            await refreshAvailable();
          }}
        />
      )}
      {showEditWhole && plan && (
        <EditBudgetModal
          period={period}
          initial={{
            savings: plan?.savings?.amount ?? "",
            commitments: plan?.commitments?.amount ?? "",
            events: plan?.events?.amount ?? "",
            dtd: Object.fromEntries(
              (plan?.dtd?.subBudgets || []).map((sb) => [
                String(sb?.categoryId?._id ?? sb?.categoryId ?? ""),
                Number(sb.amount || 0),
              ])
            ),
          }}
          income={income}
          onClose={() => setShowEditWhole(false)}
          onSaved={async () => {
            setShowEditWhole(false);
            await refetch();
            await refreshAvailable();
          }}
        />
      )}
      {showEditOne && plan && (
        <EditOneModal
          period={period}
          field={showEditOne}
          currentAmount={Number(plan?.[showEditOne]?.amount || 0)}
          income={income}
          otherTotals={{
            savings: Number(plan?.savings?.amount || 0),
            commitments: Number(plan?.commitments?.amount || 0),
            events: Number(plan?.events?.amount || 0),
            dtd: Number(plan?.dtd?.amount || 0),
          }}
          onClose={() => setShowEditOne(null)}
          onSaved={async () => {
            setShowEditOne(null);
            await refetch();
            await refreshAvailable();
          }}
        />
      )}
      {showEditDtdOne && plan && (
        <EditDtdOneModal
          period={period}
          categoryId={showEditDtdOne.categoryId}
          name={showEditDtdOne.name}
          currentAlloc={showEditDtdOne.alloc}
          plan={plan}
          income={income}
          onClose={() => setShowEditDtdOne(null)}
          onSaved={async () => {
            setShowEditDtdOne(null);
            await refetch();
            await refreshAvailable();
          }}
        />
      )}
    </div>
  );
}
