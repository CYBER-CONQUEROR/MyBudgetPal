// src/dashboard/fetchAndPrep.js
import api from "../api/api.js";

/* =============== tiny helpers =============== */
const pad = (n) => String(n).padStart(2, "0");
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfMonth = (ymStr) => { const [y, m] = ymStr.split("-").map(Number); return new Date(y, m - 1, 1, 0, 0, 0, 0); };
const endOfMonth = (ymStr) => { const [y, m] = ymStr.split("-").map(Number); return new Date(y, m, 0, 23, 59, 59, 999); };
const withinMonth = (dt, ymStr) => { const d = new Date(dt); return d >= startOfMonth(ymStr) && d <= endOfMonth(ymStr); };
const cents = (n) => Number(n || 0);
const sumBy = (arr, sel) => (Array.isArray(arr) ? arr : []).reduce((t, x) => t + cents(sel(x)), 0);

/* =============== unwrappers =============== */
const unwrapList = (payload) => {
    // Accept: [] or { data:[...] } or { items:[...] } or { results:[...] }
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.results)) return payload.results;
    return [];
};
const unwrapPlan = (payload) => (payload && payload.data ? payload.data : payload || null);

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

/* =============== normalizers (defensive) =============== */
const N = {
    account: (a) => ({ ...a, archived: !!a.archived, balanceCents: cents(a.balanceCents) }),
    income: (i) => ({ ...i, date: i.date || i.createdAt, amountCents: cents(i.amountCents ?? i.amount) }),
    expense: (e) => ({
        ...e,
        date: e.date || e.createdAt,
        amountCents: cents(e.amountCents ?? e.amount),
        categoryName: e.categoryName || e.category?.name || e.category || "Uncategorized",
    }),
    commitment: (c) => ({
        ...c,
        title: c.name || c.title,
        amountCents: cents(c.amountCents ?? c.amount),
        dueDate: c.dueDate || c.date || c.createdAt,
    }),
    event: (ev) => ({
        ...ev,
        title: ev.title || ev.name,
        date: ev.date || ev?.dates?.due || ev.createdAt,
        amountCents: cents(ev.targetCents ?? ev.amountCents ?? ev.amount),
    }),
    plan: (p = null) => {
        if (!p) return { totalCents: 0, dtdCents: 0 };

        const toC = (r) => Math.round(Number(r || 0) * 100); // rupees → cents

        // top-level buckets are RUPEES in your payload
        const savingsC = toC(p?.savings?.amount);
        const commitsC = toC(p?.commitments?.amount);
        const eventsC = toC(p?.events?.amount);

        // DTD: prefer subBudgets sum, else fallback to dtd.amount
        const dtdCatsC = Array.isArray(p?.dtd?.subBudgets)
            ? toC(p.dtd.subBudgets.reduce((t, c) => t + Number(c?.amount || 0), 0))
            : 0;
        const dtdTopC = toC(p?.dtd?.amount);
        const dtdCents = dtdCatsC || dtdTopC; // prefer split, fallback to total

        return {
            totalCents: savingsC + commitsC + eventsC + dtdCents,
            dtdCents, // <- we’ll use THIS for the budget line
        };
    },
};

/* =============== API calls (raw) =============== */
async function fetchAll(periodYM) {
    const [accountsRes, incomesRes, expensesRes, commitmentsRes, eventsRes, planRes] = await Promise.all([
        api.get("accounts", { params: { includeArchived: "false" } }),
        api.get("incomes"),
        api.get("expenses", { params: { limit: 2000 } }), // allow pagination growth
        api.get("commitments"),
        api.get("events"),
        api.get(`budget/plans/${periodYM}`).catch(() => null),
    ]);

    // unwrap safely (note: expenses is object {success, data, meta})
    const accounts = unwrapList(accountsRes?.data);
    const incomes = unwrapList(incomesRes?.data);
    const expenses = unwrapList(expensesRes?.data); // ✅ <-- THIS FIXES YOUR CASE
    const commitments = unwrapList(commitmentsRes?.data);
    const events = unwrapList(eventsRes?.data);
    const plan = unwrapPlan(planRes?.data || planRes);

    console.log(plan);

    // Debug logging: types + lengths
    console.groupCollapsed("📊 Dashboard API shapes");
    console.log("Accounts:", typeOf(accounts), Array.isArray(accounts) ? accounts.length : "-");
    console.log("Incomes:", typeOf(incomes), Array.isArray(incomes) ? incomes.length : "-");
    console.log("Expenses (raw payload type):", typeOf(expensesRes?.data), "→ using unwrapList →", typeOf(expenses), Array.isArray(expenses) ? expenses.length : "-");
    console.log("Commitments:", typeOf(commitments), Array.isArray(commitments) ? commitments.length : "-");
    console.log("Events:", typeOf(events), Array.isArray(events) ? events.length : "-");
    console.log("Plan:", typeOf(plan), plan);
    console.groupEnd();

    return { accounts, incomes, expenses, commitments, events, plan };
}

/* =============== 1) Top Summary cards =============== */
function buildTopSummary({ accounts = [], incomes = [], expenses = [] }, periodYM) {
    const A = (accounts || []).map(N.account).filter((a) => !a.archived);
    const I = (incomes || []).map(N.income).filter((i) => withinMonth(i.date, periodYM));
    const E = (expenses || []).map(N.expense).filter((e) => withinMonth(e.date, periodYM));

    const totalBalanceCents = sumBy(A, (a) => a.balanceCents);
    const monthIncomeCents = sumBy(I, (i) => i.amountCents);
    const monthDtdExpenseCents = sumBy(E, (e) => e.amountCents);

    return { totalBalanceCents, monthIncomeCents, monthDtdExpenseCents };
}

/* =============== 2) Budget vs Spend (daily series) =============== */
// REPLACE your monthBudgetTotalCents calc in buildBudgetVsSpendDaily()
function buildBudgetVsSpendDaily({ expenses = [], plan }, periodYM) {
    const E = (expenses || []).map(N.expense).filter((e) => withinMonth(e.date, periodYM));

    // daily spend
    const start = startOfMonth(periodYM);
    const end = endOfMonth(periodYM);
    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(new Date(d));

    const perDay = new Map();
    for (const t of E) {
        const k = ymd(new Date(t.date));
        perDay.set(k, (perDay.get(k) || 0) + t.amountCents);
    }

    // ✅ DTD-only budget, in CENTS
    const planNorm = N.plan(plan);
    const monthBudgetTotalCents = planNorm.dtdCents || 0;

    // series
    let running = 0;
    const totalDays = days.length || 1;
    return days.map((d, i) => {
        const k = ymd(d);
        running += perDay.get(k) || 0;
        const budget = Math.round((monthBudgetTotalCents * (i + 1)) / totalDays); // linear ramp
        return { date: k, spend: running, budget };
    });
}


/* =============== 3) Upcoming Commitments & Events =============== */
function buildUpcoming({ commitments = [], events = [] }, limit = 8) {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const C = (commitments || [])
        .map(N.commitment)
        .filter((c) => new Date(c.dueDate) >= today)
        .map((c) => ({ type: "Commitment", title: c.title, date: c.dueDate, amountCents: c.amountCents }));

    const E = (events || [])
        .map(N.event)
        .filter((e) => new Date(e.date) >= today)
        .map((e) => ({ type: "Event", title: e.title, date: e.date, amountCents: e.amountCents }));

    return [...C, ...E].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, limit);
}

/* =============== 4) Spend by Category (month) =============== */
function buildSpendByCategory({ expenses = [] }, periodYM) {
    const E = (expenses || []).map(N.expense).filter((e) => withinMonth(e.date, periodYM));
    const map = new Map();
    for (const e of E) {
        const key = e.categoryName || "Uncategorized";
        map.set(key, (map.get(key) || 0) + e.amountCents);
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(map.entries())
        .map(([name, valueCents]) => ({ name, valueCents, percent: valueCents / total }))
        .sort((a, b) => b.valueCents - a.valueCents);
}

/* =============== shapes =============== */
const shapeCards = ({ totalBalanceCents, monthIncomeCents, monthDtdExpenseCents }) => ([
    { key: "balance", label: "Total Balance", valueCents: totalBalanceCents },
    { key: "income", label: "This Month’s Income", valueCents: monthIncomeCents },
    { key: "dtd", label: "This Month’s DTD Expenses", valueCents: monthDtdExpenseCents },
]);
const shapeBudgetVsSpend = (rows) => rows.map((r) => ({ date: r.date, Spend: r.spend, Budget: r.budget }));
const shapeCategoryPie = (rows) => rows.map((r) => ({ name: r.name, value: r.valueCents }));
const shapeCategoryBar = (rows) => rows.map((r) => ({ category: r.name, spend: r.valueCents }));

/* =============== main entry =============== */
export async function getDashboardData(periodYM = ym(new Date())) {
    const raw = await fetchAll(periodYM);

    const cardsRaw = buildTopSummary(raw, periodYM);
    const lineRaw = buildBudgetVsSpendDaily(raw, periodYM);
    const upcoming = buildUpcoming(raw, 8);
    const catRaw = buildSpendByCategory(raw, periodYM);

    // quick sanity logs (remove later)
    console.groupCollapsed("✅ Prepared dashboard data");
    console.log("cardsRaw:", cardsRaw);
    console.log("lineRaw[0..2]:", lineRaw.slice(0, 3));
    console.log("upcoming[0..4]:", upcoming.slice(0, 5));
    console.log("catRaw:", catRaw);
    console.groupEnd();

    const planNorm = N.plan(raw.plan);
    console.groupCollapsed("🧮 Budget debug");
    console.log("DTD budget (rupees):",
        Array.isArray(raw.plan?.dtd?.subBudgets)
            ? raw.plan.dtd.subBudgets.reduce((t, c) => t + Number(c.amount || 0), 0)
            : Number(raw.plan?.dtd?.amount || 0)
    );
    console.log("DTD budget (cents):", planNorm.dtdCents);
    console.groupEnd();

    return {
        cards: cardsRaw,
        budgetVsSpendDaily: lineRaw,
        upcoming,
        spendByCategory: catRaw,
        charts: {
            cards: shapeCards(cardsRaw),
            line: shapeBudgetVsSpend(lineRaw),
            pie: shapeCategoryPie(catRaw),
            bar: shapeCategoryBar(catRaw),
        },
    };
}
