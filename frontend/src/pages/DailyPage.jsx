// src/pages/DailyPage.jsx
import React, { useEffect, useMemo, useState, useCallback,useRef } from "react";
import { BarChart3, Plus, Settings, Edit2, Trash2, RefreshCw, Search, Filter, X, FileText, CalendarDays, Tag, Building2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import api from "../api/api.js"; // axios instance with baseURL=/api and withCredentials:true
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* =========================
   Local date helpers
   ========================= */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
const isSameMonth = (d, ref = new Date()) => d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
const inRange = (d, start, end) => {
  const ts = new Date(d).setHours(0, 0, 0, 0);
  const s = start ? new Date(start).setHours(0, 0, 0, 0) : -Infinity;
  const e = end ? new Date(end).setHours(23, 59, 59, 999) : Infinity;
  return ts >= s && ts <= e;
};

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

/* =========================
   API helpers
   ========================= */
const asList = (res) =>
  Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : [];

const expensesAPI = {
  list: async (q = {}) => asList(await api.get("expenses", { params: q })),
  create: async (payload) => (await api.post("expenses", payload)).data,
  update: async (id, payload) => (await api.put(`expenses/${id}`, payload)).data,
  remove: async (id) => (await api.delete(`expenses/${id}`)).data,
};

const categoriesAPI = {
  list: async () => asList(await api.get("categories")),
  create: async (name) => (await api.post("categories", { name })).data,
  update: async (id, body) => (await api.put(`categories/${id}`, body)).data,
  remove: async (id, reassign = "Other") =>
    (await api.delete(`categories/${id}`, { params: { reassign } })).data,
};

const budgetAPI = {
  getPlan: async (period) => {
    try {
      const res = await api.get(`budget/plans/${period}`);
      return res.data || null;
    } catch (e) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  },
};

const accountsAPI = {
  list: async () => asList(await api.get("accounts", { params: { includeArchived: "false" } })),
};

/* =========================
   Money helpers
   ========================= */

const rupeesFrom = (maybeCents, maybeRupees) =>
  maybeCents != null ? Number(maybeCents) / 100 : Number(maybeRupees || 0);
const fmtLKR = (n) =>
  `LKR ${Number(n || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* =========================
   PDF GENERATOR (Grouped)
   ========================= */
function formatDate(d) {
  return d ? new Date(d).toLocaleDateString() : "";
}
function makeReportFilename(prefix, ts = new Date()) {
  return `${prefix}_${ts.toISOString().replace(/[:T]/g, "-").slice(0, 15)}.pdf`;
}

async function generateExpensesPDFGrouped({
  rows,
  filters,
  cats,
  accounts,
  logoUrl = PUBLIC_LOGO_URL, // keep your default
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  // ---- layout constants (tweak freely) ----
  const margin = 40;          // base page margin
  const headerH = 64;         // reserved height for header area (logo + titles)
  const logoW = 44;           // rendered logo width/height (square)
  const logoH = 44;
  const gap = 12;             // space between logo and text block
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ---- header: logo + text, side-by-side ----
  let textX = margin; // will shift right if logo is drawn
  const titleY = margin + 18;     // first text baseline
  const subTitleY = titleY + 24;  // second line baseline

  try {
    const logoData = await loadImageDataURL(logoUrl);
    if (logoData) {
      // draw the logo anchored to top-left of header block
      doc.addImage(logoData, "PNG", margin, margin - 4, logoW, logoH);
      textX = margin + logoW + gap; // push text right of the logo
    }
  } catch (e) {
    console.warn("Logo draw failed:", e);
    textX = margin;
  }

  // titles
  doc.setFont("helvetica", "bold").setFontSize(22).text("My Budget Pal", textX, titleY);
  doc.setFont("helvetica", "normal").setFontSize(18).text("Day-to-Day Expense Report", textX, subTitleY);

  // everything below starts AFTER the reserved header block
  let cursorY = margin + headerH;

  // ---- filters block ----
  const filterLines = [
    `From: ${filters.start || "…"}   To: ${filters.end || "…"}`,
    filters.categoryId ? `Category: ${cats.find(c => c._id === filters.categoryId)?.name || "—"}` : "Category: All",
    filters.accountId ? `Account: ${accounts.find(a => a._id === filters.accountId)?.name || "—"}` : "Account: All",
  ];
  doc.setFontSize(11).setTextColor(100);
  filterLines.forEach((line) => { doc.text(line, margin, cursorY); cursorY += 14; });
  doc.setTextColor(0);

  // left vertical caption
  doc.setFontSize(9).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
  doc.setTextColor(0);

  // ---- group by category ----
  const grouped = {};
  rows.forEach(r => {
    const cat = r.categoryName || r.category?.name || "Uncategorized";
    (grouped[cat] ||= []).push(r);
  });

  // page footer (page number)
  const addPageNumber = () => {
    const str = `Page ${doc.internal.getNumberOfPages()}`;
    doc.setFontSize(9);
    doc.text(str, pageW - margin, pageH - 16, { align: "right" });
  };

  let grandTotal = 0;
  let grandCount = 0;

  // render each category block
  for (const [catName, catRows] of Object.entries(grouped)) {
    // category title
    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text(catName, margin, cursorY + 10);
    cursorY += 16;

    // build table rows
    const head = [["Title", "Date", "Account", "Description", "Amount (LKR)"]];
    const body = catRows.map(r => {
      grandTotal += r.amountCents || 0;
      grandCount++;
      return [
        r.title,
        r.date ? new Date(r.date).toLocaleDateString() : "",
        accounts.find(a => String(a._id) === String(r.accountId))?.name || "—",
        r.description || "",
        (r.amountCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 }),
      ];
    });

    // render table
    autoTable(doc, {
      startY: cursorY,
      head,
      body,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [242, 246, 252], textColor: 40 },
      didDrawPage: addPageNumber,
      margin: { left: margin, right: margin },
    });

    // move cursor under the table
    const afterTableY = doc.lastAutoTable?.finalY || cursorY;

    // subtotal line
    const catTotal = catRows.reduce((a, r) => a + (r.amountCents || 0), 0);
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text(
      `Subtotal for ${catName}: LKR ${(catTotal / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      margin,
      afterTableY + 14
    );

    cursorY = afterTableY + 30;

    // if we're too close to the bottom, add a new page before the next category
    if (cursorY > pageH - 100) {
      doc.addPage();
      addPageNumber();
      // reset vertical caption on new page (optional)
      doc.setFontSize(9).setTextColor(120);
      doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
      doc.setTextColor(0);
      cursorY = margin; // start fresh below top margin on new page
    }
  }

  // ---- grand totals ----
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(`Total items: ${grandCount}`, margin, cursorY);
  doc.text(
    `Grand total: LKR ${(grandTotal / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    margin,
    cursorY + 18
  );
  doc.text(
    `Average: LKR ${grandCount ? (grandTotal / grandCount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00"}`,
    margin,
    cursorY + 36
  );

  // ---- signature (always above footer area) ----
  const sigY = pageH - 60;
  doc.setFont("helvetica", "normal").setFontSize(12);
  doc.text("Signature : ...........................................", margin, sigY);

  addPageNumber();
  const fn = makeReportFilename("ExpensesReport");
  doc.save(fn);
}

/* =========================
   Page
   ========================= */
export default function DailyPage() {
  // Fixed month for budget UI
  const today = new Date();
  const fixedStart = ymd(startOfMonth(today));
  const fixedEnd = ymd(endOfMonth(today));
  const period = ym(today);


  // Filters for the LIST only
  const [filters, setFilters] = useState({
    title: "",
    description: "",
    start: "",
    end: "",
    categoryId: "",
    accountId: "",
  });

  // Data
  const [listExpenses, setListExpenses] = useState([]);
  const [rawMonthExpenses, setRawMonthExpenses] = useState([]);
  const [cats, setCats] = useState([]);
  const [plan, setPlan] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const reloadAll = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");

      const params = {};
      if (filters.start) params.startDate = filters.start;
      if (filters.end) params.endDate = filters.end;
      params.sortBy = "date";
      params.order = "desc";

      const [listRes, monthRes, catsRes, planRes, acctsRes] = await Promise.allSettled([
        expensesAPI.list(params),
        expensesAPI.list({ startDate: fixedStart, endDate: fixedEnd }),
        categoriesAPI.list(),
        budgetAPI.getPlan(period),
        accountsAPI.list(),
      ]);

      if (listRes.status === "fulfilled") setListExpenses(listRes.value || []);
      else setErr(listRes.reason?.message || "Failed to load expenses");

      if (monthRes.status === "fulfilled") setRawMonthExpenses(monthRes.value || []);
      if (catsRes.status === "fulfilled") setCats(catsRes.value || []);
      if (planRes.status === "fulfilled") setPlan(planRes.value || null);
      if (acctsRes.status === "fulfilled") setAccounts(acctsRes.value || []);
    } catch (e) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filters.start, filters.end, period, fixedStart, fixedEnd]);

  useEffect(() => {
    reloadAll();
  }, [reloadAll]);

  // Client-side filters
  const visibleExpenses = useMemo(() => {
    const termTitle = (filters.title || "").trim().toLowerCase();
    const termDesc = (filters.description || "").trim().toLowerCase();
    const catId = (filters.categoryId || "").trim();
    const accId = (filters.accountId || "").trim();

    return (listExpenses || []).filter((e) => {
      const okTitle = termTitle ? (e.title || "").toLowerCase().includes(termTitle) : true;
      const okDesc = termDesc ? (e.description || "").toLowerCase().includes(termDesc) : true;
      const okCat = catId
        ? String(e.categoryId || e.category?._id) === String(catId)
        : true;
      const okAcc = accId ? String(e.accountId) === String(accId) : true;
      const okRange = inRange(e.date, filters.start, filters.end);
      return okTitle && okDesc && okCat && okAcc && okRange;
    });
  }, [listExpenses, filters]);

  /* ---- Budget math (fixed month only) ---- */
  const monthExpenses = useMemo(() => {
    return (rawMonthExpenses || []).filter((e) => isSameMonth(new Date(e.date), today));
  }, [rawMonthExpenses, today]);

  const monthSpent = useMemo(
    () => (monthExpenses || []).reduce((sum, e) => sum + rupeesFrom(e.amountCents, e.amount), 0),
    [monthExpenses]
  );

  const dtdCap = plan?.dtd?.amount ?? 0;
  const totalPlanned = dtdCap || (plan?.dtd?.subBudgets || []).reduce((acc, s) => acc + (s.amount || 0), 0);
  const remaining = Math.max(0, (totalPlanned || 0) - (monthSpent || 0));
  const pieData = [
    { name: "Spent", value: Math.min(monthSpent, totalPlanned) },
    { name: "Remaining", value: Math.max(0, totalPlanned - monthSpent) },
  ];

  const spentByCatId = useMemo(() => {
    const map = new Map();
    (monthExpenses || []).forEach((e) => {
      const id = e.categoryId || e.category?._id;
      const amt = rupeesFrom(e.amountCents, e.amount);
      if (!id) return;
      map.set(String(id), (map.get(String(id)) || 0) + amt);
    });
    return map;
  }, [monthExpenses]);

  const subUsages = useMemo(() => {
    const subs = plan?.dtd?.subBudgets || [];
    return subs.map((s) => {
      const id = s.categoryId;
      const catId = typeof id === "object" && id?._id ? id._id : String(id);
      const name = s.name || id?.name || "Unnamed";
      const planned = s.amount ?? 0;
      const spent = spentByCatId.get(String(catId)) || 0;
      const pct = planned > 0 ? Math.min(100, Math.round((spent / planned) * 100)) : 0;
      return { catId, name, planned, spent, pct, color: id?.color };
    });
  }, [plan, spentByCatId]);

  const onNew = () => { setEditing(null); setShowForm(true); };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [catOpen, setCatOpen] = useState(false);

  const onEdit = (e) => { setEditing(e); setShowForm(true); };
  const onDelete = async (id) => {
    if (!window.confirm("Delete this expense?")) return;
    try { await expensesAPI.remove(id); reloadAll(); } catch (e) { alert(e.message || "Delete failed"); }
  };

  const accountName = (id) => {
    const a = accounts.find((x) => String(x._id) === String(id));
    if (!a) return "—";
    const bits = [a.name, a.type];
    return bits.filter(Boolean).join(" • ");
  };

  const hasAnyFilter =
    filters.title || filters.description || filters.start || filters.end || filters.categoryId || filters.accountId;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-2">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="pb-1 text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600">
              Day-to-Day Expenses
            </h1>
            <p className="text-slate-600">This month’s plan and spending, with category usage.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCatOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 shadow-sm"
            >
              <Settings size={16} /> Manage Categories
            </button>
            <button
              onClick={onNew}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 shadow-sm"
            >
              <Plus size={16} /> Add Expense
            </button>
            <button
              onClick={() => generateExpensesPDFGrouped({ rows: visibleExpenses, filters, cats, accounts })}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 shadow-sm"
            >
              <FileText size={16} /> Generate Report
            </button>
          </div>
        </div>
        {/* Summary + usage */}
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: donut + stats */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">This Month — {period}</h3>
              <span className="text-sm text-slate-500">Budget usage</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip formatter={(v) => fmtLKR(v)} />
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={88}
                      outerRadius={120}
                      startAngle={90}
                      endAngle={-270}
                      paddingAngle={1}
                    >
                      <Cell key="spent" fill="#6366F1" />
                      <Cell key="remain" fill="#E5E7EB" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {plan ? (
                <div className="grid grid-cols-3 gap-3">
                  <MiniStat label="Total Budget" value={fmtLKR(totalPlanned)} />
                  <MiniStat label="Spent (this month)" value={fmtLKR(monthSpent)} />
                  <MiniStat label="Remaining" value={fmtLKR(remaining)} />
                </div>
              ) : (
                <div className="text-center text-slate-500">
                  No total budget configured for this month.
                </div>
              )}
            </div>
          </div>

          {/* Right: category bars (month-only) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-xl font-semibold">Categories — Usage (This month)</h3>
            <div className="mt-4 space-y-3">
              {(subUsages.length ? subUsages : [{ name: "Unnamed", planned: 0, spent: 0, pct: 0 }]).map((r) => (
                <div key={r.catId || r.name} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-slate-500">
                      {fmtLKR(r.spent)} / {fmtLKR(r.planned)} ({r.pct}%)
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-2 rounded-full" style={{ width: `${r.pct}%`, backgroundColor: r.color || "#6366F1" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-medium">
                <Filter size={14} /> Filters
              </div>
              {hasAnyFilter && (
                <button
                  onClick={() => { setFilters({ title: "", description: "", start: "", end: "", categoryId: "", accountId: "" }); }}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700 text-xs"
                  title="Clear all"
                >
                  <X size={14} /> Clear all
                </button>
              )}
            </div>
            <div className="text-sm text-slate-500">
              Budget Month: <strong>{period}</strong>
            </div>
          </div>

          {/* Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="relative">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Title</label>
              <Search size={16} className="absolute left-2 top-9 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                placeholder="Search by title"
                value={filters.title}
                onChange={(e) => setFilters(f => ({ ...f, title: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Description</label>
              <input
                placeholder="Search description"
                value={filters.description}
                onChange={(e) => setFilters(f => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Row 2 */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">From</label>
              <input
                type="date"
                value={filters.start}
                onChange={(e) => setFilters(f => ({ ...f, start: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">To</label>
              <input
                type="date"
                value={filters.end}
                onChange={(e) => setFilters(f => ({ ...f, end: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Category</label>
              <select
                value={filters.categoryId}
                onChange={(e) => setFilters(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              >
                <option value="">All</option>
                {cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Account</label>
              <select
                value={filters.accountId}
                onChange={(e) => setFilters(f => ({ ...f, accountId: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              >
                <option value="">All</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} {a.type ? `• ${a.type}` : ""} {a.institution ? `• ${a.institution}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 md:justify-end">

              <button
                onClick={() => { setFilters({ title: "", description: "", start: "", end: "", categoryId: "", accountId: "" }); }}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 shadow-sm"
                title="Reset filters"
              >
                <Filter size={14} /> Reset
              </button>
            </div>
          </div>
        </div>

        {/* Expenses list */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xxl font-semibold">Expenses ({visibleExpenses.length})</h3>
            {!accounts.length && (
              <div className="inline-flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                No accounts available — create one in Accounts.
              </div>
            )}
          </div>

          {loading ? (
            <div className="mt-6 text-slate-500">Loading…</div>
          ) : !visibleExpenses.length ? (
            <div className="mt-6 text-slate-500">No expenses in this range.</div>
          ) : (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleExpenses.length === 0 ? (
                <div className="col-span-full text-center text-slate-500 py-8">
                  No expenses to show
                </div>
              ) : (
                visibleExpenses.map((e) => {
                  const amount = rupeesFrom(e.amountCents, e.amount);
                  const catName = e.categoryName || e.category?.name || e.category || "—";
                  return (
                    <div
                      key={e._id}
                      className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm hover:shadow-md transition"
                    >
                      <div className="flex items-start justify-between gap-4">
                        {/* Left: title + meta + desc */}
                        <div className="min-w-0 flex-1">
                          <div className="text-lg font-semibold text-slate-1000 truncate">
                            {e.title}
                          </div>

                          {/* Meta row */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                              {new Date(e.date).toLocaleDateString()}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Tag className="w-3.5 h-3.5 text-slate-400" />
                              {catName}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              {accountName(e.accountId)}
                            </span>
                          </div>

                          {e.description && (
                            <div className="mt-2 text-sm text-slate-700 line-clamp-2">
                              {e.description}
                            </div>
                          )}
                        </div>

                        {/* Right: amount + actions */}
                        <div className="text-right shrink-0">
                          <div className="text-lg font-semibold text-rose-600">
                            {fmtLKR(amount)}
                          </div>

                          <div className="mt-2 flex gap-2 justify-end">
                            <button
                              onClick={() => onEdit(e)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs md:text-sm hover:bg-slate-50"
                            >
                              <Edit2 className="w-4 h-4" /> Edit
                            </button>
                            <button
                              onClick={() => onDelete(e._id)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs md:text-sm text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="w-4 h-4" /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showForm && (
        <ExpenseFormModal
          categories={cats}
          accounts={accounts}
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={async (payload) => {
            try {
              if (editing?._id) await expensesAPI.update(editing._id, payload);
              else await expensesAPI.create(payload);
              setShowForm(false); setEditing(null); reloadAll();
            } catch (e) { alert(e.message || "Save failed"); }
          }}
        />
      )}

      {catOpen && (
        <CategoryManagerModal
          categories={cats}
          expenses={listExpenses}
          onClose={(changed) => { setCatOpen(false); if (changed) reloadAll(); }}
        />
      )}
    </div>
  );
}

/* =========================
   Small pieces
   ========================= */
function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

/* =========================
   Expense Form Modal
   ========================= */
const comma = (i) => i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const toFixed2Raw = (plain) => {
  let s = (plain || "").replace(/[^\d.]/g, "");

  // only one dot
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }

  // cannot start with dot
  if (s.startsWith(".")) s = "0" + s;

  // strip leading zeros on integer part; 2 decimals max
  if (s.includes(".")) {
    const [i, d] = s.split(".");
    const I = (i.replace(/^0+(?=\d)/, "") || "0");
    s = I + "." + (d || "").slice(0, 2);
  } else {
    s = (s.replace(/^0+(?=\d)/, "") || "0");
  }

  let n = Number(s);
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n > MAX_AMOUNT) n = MAX_AMOUNT;

  return n.toFixed(2); // guaranteed 2 decimals
};

/* Convert raw "12345.67" -> display "12,345.67" */


/* Parse display "12,345.67" -> numeric 12345.67 */
/* Count significant chars (digits/dot) left of caret index */


/* Find index in string where 'sigCount' significant chars have passed */



/* ===== Fallback helpers (remove if you already have them) ===== */

const centsFrom = (n) => Math.round(Number(n || 0) * 100);

/* ===== Amount constraints ===== */
const MAX_AMOUNT = 9_999_999.99;
const SIG_RX = /[0-9.]/; // "significant" chars for caret math



/* Sanitize to a fixed-2 raw numeric string (no commas), enforcing:
   - positive only
   - one dot max
   - cannot start with dot
   - max 2 decimals (so ".000" can't happen)
   - clamp to MAX_AMOUNT
*/


/* Convert raw "12345.67" -> display "12,345.67" */
const toDisplay = (rawFixed2) => {
  const [i, d] = (rawFixed2 || "0.00").split(".");
  return `${comma(i)}.${(d || "").padEnd(2, "0")}`;
};

/* Parse display "12,345.67" -> numeric 12345.67 */
const fromDisplayNumber = (disp) => {
  const s = (disp || "").replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/* Count significant chars (digits/dot) left of caret index */
const countSigLeftOf = (s, caretIdx) => {
  let c = 0;
  const upto = Math.min(caretIdx ?? 0, s.length);
  for (let i = 0; i < upto; i++) if (SIG_RX.test(s[i])) c++;
  return c;
};

/* Find index in string where 'sigCount' significant chars have passed */
const indexForSigCount = (s, sigCount) => {
  if (sigCount <= 0) return 0;
  let c = 0;
  for (let i = 0; i < s.length; i++) {
    if (SIG_RX.test(s[i])) c++;
    if (c >= sigCount) return i + 1;
  }
  return s.length;
};
function ExpenseFormModal({ categories, accounts, initial, onClose, onSave }) {
  const isEdit = !!initial;

  /* ===== Limit date to current month ===== */
  const { minDateStr, maxDateStr } = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { minDateStr: ymd(first), maxDateStr: ymd(last) };
  }, []);

  /* ===== Title (letters/spaces only) ===== */
  const [title, setTitle] = useState(initial?.title || "");
  const onTitleBeforeInput = (e) => {
    if (e.inputType && !e.data) return; // deletions etc.
    if (e.data && /[^A-Za-z\s]/.test(e.data)) e.preventDefault();
  };
  const onTitlePaste = (e) => {
    e.preventDefault();
    const t = (e.clipboardData?.getData("text") || "");
    const cleaned = t.replace(/[^A-Za-z\s]/g, "");
    if (!cleaned) return;
    const target = e.target;
    const start = target.selectionStart ?? title.length;
    const end = target.selectionEnd ?? title.length;
    setTitle(title.slice(0, start) + cleaned + title.slice(end));
  };

  /* ===== Amount (display + caret) via useRef-powered validator ===== */
  const initialNumeric =
    initial?.amountCents != null
      ? Math.min(MAX_AMOUNT, Math.max(0, initial.amountCents / 100))
      : Math.min(MAX_AMOUNT, Math.max(0, Number(initial?.amount) || 0));

  const initialRaw = toFixed2Raw(String(initialNumeric));
  const [amountDisplay, setAmountDisplay] = useState(toDisplay(initialRaw));

  const amountRef = useRef(null);
  const prevDisplayRef = useRef(amountDisplay);
  const pendingSigRef = useRef(null); // where to put caret (by sig-count) after re-render

  /* Core function: validate + format + track caret */
  const validateAndFormatAmount = (inputEl, nextTyped) => {
    const prevDisplay = prevDisplayRef.current;
    const prevCaretIdx = inputEl.selectionStart ?? prevDisplay.length;

    // how many "significant chars" were left of caret
    const prevSig = countSigLeftOf(prevDisplay, prevCaretIdx);

    // sanitize -> raw fixed-2 -> display with commas
    const raw = toFixed2Raw((nextTyped || "").replace(/,/g, ""));
    const nextDisplay = toDisplay(raw);

    // remember caret sig-count for after state update
    pendingSigRef.current = prevSig;

    // update state + last display
    prevDisplayRef.current = nextDisplay;
    setAmountDisplay(nextDisplay);
  };

  // restore caret right after display changes, using the saved sig-count
  useEffect(() => {
    const el = amountRef.current;
    if (!el) return;
    if (pendingSigRef.current == null) return;

    const desiredSig = pendingSigRef.current;
    const nextIdx = indexForSigCount(amountDisplay, desiredSig);

    requestAnimationFrame(() => {
      el.setSelectionRange(nextIdx, nextIdx);
    });

    pendingSigRef.current = null;
  }, [amountDisplay]);

  // === ✨ Fix: '.' key moves caret to decimals so you can type them immediately
  const jumpCaretToDecimals = () => {
    const el = amountRef.current;
    if (!el) return;
    const dotIdx = amountDisplay.indexOf(".");
    if (dotIdx >= 0) {
      const target = dotIdx + 1;
      requestAnimationFrame(() => {
        el.setSelectionRange(target, target);
      });
    }
  };

  const onAmountKeyDown = (e) => {
    if (e.key === "-" || e.key === "+") e.preventDefault();

    // If user hits '.' or Numpad 'Decimal', jump cursor to after the dot.
    if (e.key === "." || e.code === "NumpadDecimal" || e.key === "Decimal") {
      e.preventDefault();
      // disallow starting with dot (your rule),
      // but since we always show ".00", just place the caret after the dot.
      jumpCaretToDecimals();
      return;
    }
  };

  const onAmountBeforeInput = (e) => {
    if (e.inputType && e.data && !/^[\d.]$/.test(e.data)) e.preventDefault();
  };
  const onAmountChange = (e) => validateAndFormatAmount(e.target, e.target.value);
  const onAmountPaste  = (e) => {
    e.preventDefault();
    const text = (e.clipboardData?.getData("text") || "");
    validateAndFormatAmount(amountRef.current, text);
  };
  const onAmountBlur = () => {
    validateAndFormatAmount(amountRef.current, amountDisplay);
  };

  /* ===== Date (clamped to this month) ===== */
  const initialDate = initial?.date ? ymd(new Date(initial.date)) : ymd(new Date());
  const clampDate = (dStr) => (dStr < minDateStr ? minDateStr : dStr > maxDateStr ? maxDateStr : dStr);
  const [date, setDate] = useState(clampDate(initialDate));
  const onDateChange = (e) => setDate(clampDate(e.target.value || date));

  /* ===== Dropdowns / others ===== */
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId || initial?.category?._id || categories?.[0]?._id || ""
  );
  const [accountId, setAccountId] = useState(
    initial?.accountId ||
    accounts.find((a) => a.type === "cash")?._id ||
    accounts?.[0]?._id ||
    ""
  );
  const [description, setDescription] = useState(initial?.description || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  /* ===== Submit ===== */
  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    // title checks
    if (!title.trim()) return setErr("Title is required");
    if (/[^A-Za-z\s]/.test(title)) return setErr("Title can contain only letters and spaces");

    // amount checks
    const amountNum = Math.min(MAX_AMOUNT, Math.max(0, fromDisplayNumber(amountDisplay)));
    if (!Number.isFinite(amountNum) || amountNum <= 0) return setErr("Enter a valid positive amount");
    if (amountNum > MAX_AMOUNT) return setErr(`Maximum allowed is LKR ${MAX_AMOUNT.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    // category/account
    if (!categoryId) return setErr("Pick a category");
    if (!accountId) return setErr("Pick an account");

    // date range (this month)
    if (date < minDateStr || date > maxDateStr) return setErr("Please pick a date within this month");

    const payload = {
      title: title.trim(),
      amount: amountNum,
      amountCents: centsFrom(amountNum),
      categoryId,
      date,
      description: description || "",
      accountId,
    };

    try { setSaving(true); await onSave(payload); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">{isEdit ? "Edit Expense" : "Add Expense"}</h3>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.replace(/[^A-Za-z\s]/g, ""))}
                onBeforeInput={onTitleBeforeInput}
                onPaste={onTitlePaste}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Groceries"
                inputMode="text"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Amount (LKR)</label>
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                value={amountDisplay}
                onChange={onAmountChange}
                onBeforeInput={onAmountBeforeInput}
                onKeyDown={onAmountKeyDown}
                onPaste={onAmountPaste}
                onBlur={onAmountBlur}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="0.00"
                aria-describedby="amountHelp"
              />
              <div id="amountHelp" className="mt-1 text-xs text-slate-500">
                Max 9,999,999.99 • 2 decimals • auto-formatted with commas
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Date (this month only) */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Date</label>
              <input
                type="date"
                value={date}
                onChange={onDateChange}
                min={minDateStr}
                max={maxDateStr}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          {/* Account */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Account</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} {a.type ? `• ${a.type}` : ""} {a.institution ? `• ${a.institution}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Description (optional)</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
              placeholder="Notes…"
            />
          </div>

          {err && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-70"
            >
              {saving ? "Saving…" : isEdit ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



/* =========================
   Category Manager Modal
   ========================= */
function CategoryManagerModal({ categories, expenses, onClose }) {
  const [list, setList] = useState(categories || []);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  // tiny inline bubble
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
  const [bubble, setBubble] = useState({ key: null, msg: "" });
  const bubbleTimerRef = React.useRef(null);
  const showBubble = (key, msg, ms = 1600) => {
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    setBubble({ key, msg });
    bubbleTimerRef.current = setTimeout(() => setBubble({ key: null, msg: "" }), ms);
  };

  React.useEffect(() => setList(categories || []), [categories]);

  const inUseCount = React.useCallback(
    (catId) =>
      expenses.filter(
        (e) =>
          String(e.categoryId) === String(catId) ||
          String(e.category?._id) === String(catId)
      ).length,
    [expenses]
  );

  // ===== letters-only guards (Unicode letters + spaces) =====
  const lettersOnlyFullRe = /^[\p{L}\s]*$/u;   // for full string validation
  const lettersOnlyCharRe = /^[\p{L}\s]$/u;    // for single char keypress

  const onNewNameKeyDown = (e) => {
    // allow control/navigation keys
    const ctrlKeys = [
      "Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "Home", "End", "Tab", "Enter"
    ];
    if (ctrlKeys.includes(e.key)) return;

    // if it's a single printable char, ensure it's a letter or space
    if (e.key.length === 1 && !lettersOnlyCharRe.test(e.key)) {
      e.preventDefault();
      showBubble("newName", "Letters and spaces only.");
    }
  };

  const onNewNameChange = (e) => {
    const v = e.target.value;
    if (lettersOnlyFullRe.test(v)) {
      setNewName(v);
    } else {
      // block update and hint
      showBubble("newName", "Letters and spaces only.");
    }
  };

  const onNewNamePaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text");
    if (!lettersOnlyFullRe.test(text)) {
      e.preventDefault();
      showBubble("newName", "Letters and spaces only.");
    }
  };

  const isDuplicate = (name) =>
    list.some((c) => (c.name || "").toLowerCase() === name.toLowerCase());

  const add = async () => {
    const name = (newName || "").trim();
    if (!name) {
      showBubble("newName", "Name is required.");
      return;
    }
    if (!lettersOnlyFullRe.test(name)) {
      showBubble("newName", "Letters and spaces only.");
      return;
    }
    if (isDuplicate(name)) {
      showBubble("newName", "Category already exists.");
      return;
    }

    setBusy(true);
    try {
      await categoriesAPI.create(name);
      const res = await categoriesAPI.list();
      setList(res || []);
      setNewName("");
    } catch (e) {
      // keeping network/server failures as alerts so you notice action failure
      alert(e.message || "Failed to create category");
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id, next) => {
    const name = (next || "").trim();
    if (!name) return;
    if (!lettersOnlyFullRe.test(name)) {
      // we can’t show a bubble here because the input lives inside CatRow;
      // just block silently — or swap to alert if you prefer.
      alert("Letters and spaces only.");
      return;
    }
    if (list.some((c) => c._id !== id && (c.name || "").toLowerCase() === name.toLowerCase())) {
      alert("Category already exists.");
      return;
    }
    setBusy(true);
    try {
      await categoriesAPI.update(id, { name });
      const res = await categoriesAPI.list();
      setList(res || []);
    } catch (e) {
      alert(e.message || "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    const used = inUseCount(id);
    if (
      !window.confirm(
        used
          ? `This category is used by ${used} expense(s). Delete and reassign to "Other"?`
          : "Delete category?"
      )
    )
      return;
    setBusy(true);
    try {
      await categoriesAPI.remove(id, "Other");
      const res = await categoriesAPI.list();
      setList(res || []);
    } catch (e) {
      alert(e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  // quick validity to disable the Add button
  const addDisabled =
    busy ||
    !(newName || "").trim() ||
    !lettersOnlyFullRe.test((newName || "").trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose(true)} />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">Manage Categories</h3>

        <div className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <input
              value={newName}
              onChange={onNewNameChange}
              onKeyDown={onNewNameKeyDown}
              onPaste={onNewNamePaste}
              placeholder="New category"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
            <Bubble show={bubble.key === "newName"} message={bubble.msg} />
          </div>
          <button
            onClick={add}
            disabled={addDisabled}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-70"
          >
            Add
          </button>
        </div>

        <div className="mt-4 divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {list.map((c) => (
            <CatRow
              key={c._id}
              cat={c}
              used={inUseCount(c._id)}
              onRename={(name) => rename(c._id, name)}
              onDelete={() => remove(c._id)}
            />
          ))}
          {!list.length && (
            <div className="p-4 text-sm text-slate-500">No categories yet.</div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => onClose(true)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CatRow({ cat, used, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cat.name);
  return (
    <div className="p-3 flex items-center gap-3">
      {editing ? (
        <>
          <input
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            onClick={() => { setEditing(false); onRename(value); }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white text-sm"
          >
            Save
          </button>
          <button
            onClick={() => { setEditing(false); setValue(cat.name); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <div className="flex-1">
            <div className="font-medium">{cat.name}</div>
            <div className="text-xs text-slate-500">{used} in use</div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            <Edit2 size={14} /> Rename
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
          >
            <Trash2 size={14} /> Delete
          </button>
        </>
      )}
    </div>
  );
}
