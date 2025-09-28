// src/pages/DailyPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { BarChart3, Plus, Settings, Edit2, Trash2, RefreshCw, Search, Filter, X, FileText, TrendingUp, Wallet, PieChart as PieChartIcon, Calendar, CreditCard, Tag } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import api from "../api/api.js";
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
const centsFrom = (rupees) => Math.round(Number(rupees || 0) * 100);
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
  logoUrl = PUBLIC_LOGO_URL,
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const margin = 40;
  const headerH = 64;
  const logoW = 44;
  const logoH = 44;
  const gap = 12;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  let textX = margin;
  const titleY = margin + 18;
  const subTitleY = titleY + 24;

  try {
    const logoData = await loadImageDataURL(logoUrl);
    if (logoData) {
      doc.addImage(logoData, "PNG", margin, margin - 4, logoW, logoH);
      textX = margin + logoW + gap;
    }
  } catch (e) {
    console.warn("Logo draw failed:", e);
    textX = margin;
  }

  doc.setFont("helvetica", "bold").setFontSize(22).text("My Budget Pal", textX, titleY);
  doc.setFont("helvetica", "normal").setFontSize(18).text("Day-to-Day Expense Report", textX, subTitleY);

  let cursorY = margin + headerH;

  const filterLines = [
    `From: ${filters.start || "…"}   To: ${filters.end || "…"}`,
    filters.categoryId ? `Category: ${cats.find(c => c._id === filters.categoryId)?.name || "—"}` : "Category: All",
    filters.accountId ? `Account: ${accounts.find(a => a._id === filters.accountId)?.name || "—"}` : "Account: All",
  ];
  doc.setFontSize(11).setTextColor(100);
  filterLines.forEach((line) => { doc.text(line, margin, cursorY); cursorY += 14; });
  doc.setTextColor(0);

  doc.setFontSize(9).setTextColor(120);
  doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
  doc.setTextColor(0);

  const grouped = {};
  rows.forEach(r => {
    const cat = r.categoryName || r.category?.name || "Uncategorized";
    (grouped[cat] ||= []).push(r);
  });

  const addPageNumber = () => {
    const str = `Page ${doc.internal.getNumberOfPages()}`;
    doc.setFontSize(9);
    doc.text(str, pageW - margin, pageH - 16, { align: "right" });
  };

  let grandTotal = 0;
  let grandCount = 0;

  for (const [catName, catRows] of Object.entries(grouped)) {
    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text(catName, margin, cursorY + 10);
    cursorY += 16;

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

    const afterTableY = doc.lastAutoTable?.finalY || cursorY;

    const catTotal = catRows.reduce((a, r) => a + (r.amountCents || 0), 0);
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text(
      `Subtotal for ${catName}: LKR ${(catTotal / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      margin,
      afterTableY + 14
    );

    cursorY = afterTableY + 30;

    if (cursorY > pageH - 100) {
      doc.addPage();
      addPageNumber();
      doc.setFontSize(9).setTextColor(120);
      doc.text("A system generated report by MyBudgetPal.com", 12, pageH / 2, { angle: 90 });
      doc.setTextColor(0);
      cursorY = margin;
    }
  }

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
  const today = new Date();
  const fixedStart = ymd(startOfMonth(today));
  const fixedEnd = ymd(endOfMonth(today));
  const period = ym(today);

  const [filters, setFilters] = useState({
    title: "",
    description: "",
    start: "",
    end: "",
    categoryId: "",
    accountId: "",
  });

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

  // Reset filters function
  const handleResetFilters = () => {
    setFilters({
      title: "",
      description: "",
      start: "",
      end: "",
      categoryId: "",
      accountId: "",
    });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent flex items-center justify-center md:justify-start gap-3">
              <div className="p-2 bg-white rounded-2xl shadow-lg">
                <BarChart3 className="text-blue-600" size={32} />
              </div>
              Day-to-Day Expenses
            </h1>
            <p className="text-slate-600 mt-2 text-lg">Track and manage your daily spending with insights</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setCatOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50 shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Settings size={18} /> Manage Categories
            </button>
            <button
              onClick={() => generateExpensesPDFGrouped({ rows: visibleExpenses, filters, cats, accounts })}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50 shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <FileText size={18} /> Generate Report
            </button>
            <button
              onClick={onNew}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 text-sm font-semibold hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
            >
              <Plus size={18} /> Add Expense
            </button>
          </div>
        </div>

        {/* Summary + usage */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          {/* Budget Overview Card */}
          <div className="xl:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Wallet className="text-blue-600" size={24} />
                Budget Overview — {period}
              </h3>
              <span className="text-sm font-medium text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
                Current Month
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Donut Chart */}
              <div className="flex flex-col items-center justify-center">
                <div className="h-64 w-64 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip 
                        formatter={(v) => fmtLKR(v)}
                        contentStyle={{ 
                          backgroundColor: 'white',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                        }}
                      />
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={70}
                        outerRadius={100}
                        startAngle={90}
                        endAngle={-270}
                        paddingAngle={2}
                      >
                        <Cell key="spent" fill="#4F46E5" />
                        <Cell key="remain" fill="#E0E7FF" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-800">
                        {totalPlanned ? Math.round((monthSpent / totalPlanned) * 100) : 0}%
                      </div>
                      <div className="text-sm text-slate-500">Used</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-4">
                {plan ? (
                  <>
                    <StatCard 
                      label="Total Budget" 
                      value={fmtLKR(totalPlanned)} 
                      icon={<Wallet className="text-green-600" />}
                    />
                    <StatCard 
                      label="Spent This Month" 
                      value={fmtLKR(monthSpent)} 
                      icon={<TrendingUp className="text-blue-600" />}
                    />
                    <StatCard 
                      label="Remaining" 
                      value={fmtLKR(remaining)} 
                      icon={<PieChartIcon className="text-indigo-600" />}
                    />
                  </>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-slate-400 mb-2">No budget configured for this month</div>
                    <button className="text-blue-600 hover:text-blue-700 font-medium">
                      Set up budget plan →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Category Usage Card - FIXED SCROLL */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <PieChartIcon className="text-blue-600" size={24} />
              Category Usage
            </h3>
            <div className="space-y-4 h-96 overflow-y-auto pr-2 custom-scrollbar">
              {(subUsages.length ? subUsages : [{ name: "No categories", planned: 0, spent: 0, pct: 0 }]).map((r, index) => (
                <div key={r.catId || r.name || index} className="rounded-2xl border border-slate-100 bg-white p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-slate-800 truncate flex-1">{r.name}</div>
                    <div className="text-sm font-medium text-slate-600 ml-2">
                      {r.pct}%
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mb-3">
                    {fmtLKR(r.spent)} / {fmtLKR(r.planned)}
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div 
                      className="h-3 rounded-full transition-all duration-500 ease-out"
                      style={{ 
                        width: `${r.pct}%`, 
                        backgroundColor: r.color || (r.pct > 90 ? '#EF4444' : r.pct > 75 ? '#F59E0B' : '#10B981')
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters Card - UPDATED WITH EXTERNAL RESET BUTTON */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl mb-8">
          {/* Reset Button - Now outside the card content area */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
            <div className="flex items-center gap-3 mb-4 lg:mb-0">
              <div className="inline-flex items-center gap-2 rounded-2xl bg-blue-100 text-blue-700 px-4 py-2 font-medium">
                <Filter size={18} /> Advanced Filters
              </div>
              {hasAnyFilter && (
                <button
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 hover:border-red-300 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <RefreshCw size={16}/> Clear All Filters
                </button>
              )}
            </div>
            <div className="text-lg font-semibold text-blue-700 bg-blue-50 px-4 py-2 rounded-2xl">
              Budget Month: <span className="text-slate-800">{period}</span>
            </div>
          </div>

          {/* Filter Inputs Grid - WITHOUT Reset Button Inside */}
          <div className="space-y-4">
            {/* Row 1: Search Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Search by Title
                </label>
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    placeholder="Enter title to search..."
                    value={filters.title}
                    onChange={(e) => setFilters(f => ({ ...f, title: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Search Description
                </label>
                <input
                  placeholder="Search in descriptions..."
                  value={filters.description}
                  onChange={(e) => setFilters(f => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Row 2: Date, Category, Account Filters */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  From Date
                </label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={filters.start}
                    onChange={(e) => setFilters(f => ({ ...f, start: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  To Date
                </label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={filters.end}
                    onChange={(e) => setFilters(f => ({ ...f, end: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Category
                </label>
                <div className="relative">
                  <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={filters.categoryId}
                    onChange={(e) => setFilters(f => ({ ...f, categoryId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none"
                  >
                    <option value="">All Categories</option>
                    {cats.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Account
                </label>
                <div className="relative">
                  <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <select
                    value={filters.accountId}
                    onChange={(e) => setFilters(f => ({ ...f, accountId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none"
                  >
                    <option value="">All Accounts</option>
                    {accounts.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.name} {a.type ? `• ${a.type}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={reloadAll}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 font-semibold hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
                >
                  <RefreshCw size={18} /> Apply
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Expenses List Card - FIXED EXPENSE CARDS */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
            <h3 className="text-2xl font-bold text-slate-800 mb-4 lg:mb-0">
              Expenses
              <span className="ml-3 text-blue-600 bg-blue-100 px-3 py-1 rounded-full text-lg">
                {visibleExpenses.length} items
              </span>
            </h3>
            {!accounts.length && (
              <div className="inline-flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl font-medium">
                ⚠️ No accounts available — create one in Accounts.
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : !visibleExpenses.length ? (
            <div className="text-center py-12">
              <div className="text-slate-400 text-lg mb-2">No expenses found</div>
              <p className="text-slate-500 mb-4">Try adjusting your filters or add a new expense</p>
              <button
                onClick={onNew}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 font-semibold hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
              >
                <Plus size={18} /> Add Your First Expense
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleExpenses.map((e) => {
                const amount = rupeesFrom(e.amountCents, e.amount);
                const catName = e.categoryName || e.category?.name || e.category || "Uncategorized";
                const account = accounts.find(a => String(a._id) === String(e.accountId));
                
                return (
                  <div key={e._id} className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-lg hover:border-blue-200 transition-all duration-300 group">
                    <div className="flex flex-col h-full">
                      {/* Header with Title and Amount */}
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="text-lg font-bold text-slate-800 truncate flex-1 mr-2 group-hover:text-blue-600 transition-colors">
                          {e.title}
                        </h4>
                        <div className="text-xl font-bold text-slate-800 whitespace-nowrap">
                          {fmtLKR(amount)}
                        </div>
                      </div>

                      {/* Meta Information */}
                      <div className="space-y-2 mb-4 flex-1">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Tag size={14} className="text-blue-500" />
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                            {catName}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Calendar size={14} className="text-green-500" />
                          <span>{new Date(e.date).toLocaleDateString()}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <CreditCard size={14} className="text-purple-500" />
                          <span className="truncate">
                            {account ? `${account.name}${account.type ? ` • ${account.type}` : ''}` : '—'}
                          </span>
                        </div>

                        {/* Description */}
                        {e.description && (
                          <div className="mt-2 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
                            {e.description}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => onEdit(e)}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                        >
                          <Edit2 size={14} /> Edit
                        </button>
                        <button
                          onClick={() => onDelete(e._id)}
                          className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 hover:border-red-300 transition-colors"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}

/* =========================
   New StatCard Component
   ========================= */
function StatCard({ label, value, icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-600 uppercase tracking-wide">{label}</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{value}</div>
        </div>
        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50">
          {icon}
        </div>
      </div>
    </div>
  );
}

/* =========================
   Expense Form Modal 
   ========================= */
function ExpenseFormModal({ categories, accounts, initial, onClose, onSave }) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title || "");
  const [amount, setAmount] = useState(
    initial?.amountCents != null
      ? (initial.amountCents / 100).toString()
      : initial?.amount != null
      ? initial.amount.toString()
      : ""
  );
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ||
      initial?.category?._id ||
      categories?.[0]?._id ||
      ""
  );
  const [date, setDate] = useState(
    initial?.date ? ymd(new Date(initial.date)) : ymd(new Date())
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

  function ymd(d) {
    return d.toISOString().split("T")[0];
  }

  // format amount input safely
  const formatAmountInput = (val) => {
    if (typeof val !== "string") {
      return "";
    }

    let clean = val.replace(/[^\d.]/g, "");
    if (clean.startsWith(".")) clean = clean.slice(1);
    const parts = clean.split(".");
    if (parts.length > 2) clean = parts[0] + "." + parts.slice(1).join("");
    if (parts[1]) clean = parts[0] + "." + parts[1].slice(0, 2);

    const [intPart, decPart] = clean.split(".");
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
  };

  const handleAmountChange = (e) => {
    const formatted = formatAmountInput(e.target.value);
    setAmount(formatted);
  };

  const handleTitleChange = (e) => {
    const val = e.target.value.replace(/[^a-zA-Z\s]/g, "");
    setTitle(val);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!title.trim()) return setErr("Title is required");

    // amount conversion
    let amt = 0;
    try {
      const cleanAmount = amount.replace(/,/g, "");
      amt = Number(cleanAmount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return setErr("Enter a valid amount");
      }
    } catch (error) {
      return setErr("Enter a valid amount");
    }

    if (!categoryId) return setErr("Pick a category");
    if (!accountId) return setErr("Pick an account");

    // --- Date Validation ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pickedDate = new Date(date);
    pickedDate.setHours(0, 0, 0, 0);

    const minDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    minDate.setHours(0, 0, 0, 0);

    if (pickedDate.getTime() > today.getTime()) {
      return setErr("Future dates are not allowed");
    }
    if (pickedDate.getTime() < minDate.getTime()) {
      return setErr("Only last 30 days allowed");
    }

    const payload = {
      title: title.trim(),
      amount: amt,
      amountCents: Math.round(amt * 100),
      categoryId,
      date,
      description: description || "",
      accountId,
    };

    try {
      setSaving(true);
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-3xl border border-white bg-white/95 backdrop-blur-sm p-6 shadow-2xl">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent">
            {isEdit ? "Edit Expense" : "Add Expense"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Compact Form Grid */}
          <div className="grid grid-cols-1 gap-3">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Title *
              </label>
              <input
                value={title}
                onChange={handleTitleChange}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="Groceries, Transportation..."
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Amount (LKR) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={handleAmountChange}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="20,000.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Category */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Category *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              >
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                value={date}
                min={ymd(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))}
                max={ymd(new Date())}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Account */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Account *
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            >
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} {a.type ? `• ${a.type}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Description (optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
              placeholder="Additional notes..."
            />
          </div>

          {/* Error Message */}
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">
              {err}
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none"
            >
              {saving ? "Saving..." : isEdit ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* =========================
   Category Manager Modal (COMPACT)
   ========================= */
function CategoryManagerModal({ categories, expenses, onClose }) {
  const [list, setList] = useState(categories || []);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  React.useEffect(() => setList(categories || []), [categories]);

  const inUseCount = React.useCallback(
    (catId) => expenses.filter((e) => String(e.categoryId) === String(catId) || String(e.category?._id) === String(catId)).length,
    [expenses]
  );

  const add = async () => {
    const name = (newName || "").trim();
    if (!name) return;
    if (list.some(c => (c.name || "").toLowerCase() === name.toLowerCase())) {
      alert("Category already exists.");
      return;
    }
    setBusy(true);
    try {
      await categoriesAPI.create(name);
      const res = await categoriesAPI.list();
      setList(res || []);
      setNewName("");
    } catch (e) {
      alert(e.message || "Failed to create category");
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id, next) => {
    const name = (next || "").trim();
    if (!name) return;
    if (list.some(c => c._id !== id && (c.name || "").toLowerCase() === name.toLowerCase())) {
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
    if (!window.confirm(used ? `This category is used by ${used} expense(s). Delete and reassign to "Other"?` : "Delete category?")) return;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onClose(true)} />
      <div className="relative w-full max-w-md rounded-3xl border border-white bg-white/95 backdrop-blur-sm p-6 shadow-2xl max-h-[80vh] overflow-hidden">
        {/* Compact Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent">
            Manage Categories
          </h3>
          <button
            onClick={() => onClose(true)}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Add Category */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Add New Category</label>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              onKeyPress={(e) => e.key === 'Enter' && add()}
            />
            <button
              onClick={add}
              disabled={busy}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none"
            >
              Add
            </button>
          </div>
        </div>

        {/* Categories List */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-slate-200">
            <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-slate-700">
              <div className="col-span-6">Name</div>
              <div className="col-span-3 text-center">Used</div>
              <div className="col-span-3 text-center">Actions</div>
            </div>
          </div>
          
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {list.map((c) => (
              <CompactCatRow
                key={c._id}
                cat={c}
                used={inUseCount(c._id)}
                onRename={(name) => rename(c._id, name)}
                onDelete={() => remove(c._id)}
              />
            ))}
            {!list.length && (
              <div className="px-4 py-6 text-center text-slate-500 text-sm">
                No categories yet
              </div>
            )}
          </div>
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-4">
          <button
            onClick={() => onClose(true)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CompactCatRow({ cat, used, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cat.name);
  
  const handleSave = () => {
    if (value.trim() && value !== cat.name) {
      onRename(value);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setValue(cat.name);
    setEditing(false);
  };

  return (
    <div className="px-4 py-3 hover:bg-slate-50 transition-colors">
      <div className="grid grid-cols-12 gap-2 items-center">
        <div className="col-span-6">
          {editing ? (
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
          ) : (
            <div className="font-medium text-slate-800 text-sm truncate">{cat.name}</div>
          )}
        </div>
        
        <div className="col-span-3 text-center">
          <span className="inline-flex items-center justify-center bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs">
            {used}
          </span>
        </div>
        
        <div className="col-span-3 flex justify-center gap-1">
          {editing ? (
            <>
              <button
                onClick={handleSave}
                className="inline-flex items-center rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 transition-colors"
              >
                ✓
              </button>
              <button
                onClick={handleCancel}
                className="inline-flex items-center rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={onDelete}
                className="inline-flex items-center rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 transition-colors"
              >
                Del
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}