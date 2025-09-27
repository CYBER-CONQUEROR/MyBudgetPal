import api from "../api/api";

/* ----------------------------- BASIC HELPERS ----------------------------- */
export const centsToAmount = (c) => Number(c || 0) / 100;
const list = (d) => (Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);

/* --------------------------------- READ --------------------------------- */
export const getPlan = async (period) => {
  try {
    const { data } = await api.get(`budget/plans/${period}`);
    return data || null;
  } catch (e) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
};

export const getIncomes       = async () => list((await api.get(`incomes`)).data);
export const getExpenses      = async () => list((await api.get(`expenses`)).data);
export const getCommitments   = async () => list((await api.get(`commitments`)).data);
export const getEvents        = async () => list((await api.get(`events`)).data);
export const getSavingsGoals  = async () => list((await api.get(`savings-goals`)).data);
export const getCategories    = async () => list((await api.get(`categories`)).data);
export const getAccounts      = async () => list((await api.get(`accounts`)).data);

export const accountAmount = (a) => {
  if (a?.balanceCents != null) return Number(a.balanceCents) / 100;
  if (a?.amountCents  != null) return Number(a.amountCents)  / 100;
  for (const v of [a?.balance, a?.amount, a?.available, a?.currentBalance]) {
    const n = Number(v); if (!Number.isNaN(n)) return n;
  }
  return 0;
};

/* --------------------------------- WRITE -------------------------------- */
export const patchPlan      = (period, body) => api.patch(`budget/plans/${period}`, body);
export const putDtdSub      = (period, categoryId, amount, name) =>
  api.put(`budget/plans/${period}/dtd/${String(categoryId)}`, { amount, name });
export const deletePlanApi  = (period) => api.delete(`budget/plans/${period}`);
export const createPlanApi  = (payload) => api.post(`budget/plans`, payload);
export const replacePlanApi = (period, payload) => api.put(`budget/plans/${period}`, payload);

/* If you still need the raw server origin for <img src> etc.: */
export const API_BASE =
  (process.env.REACT_APP_API_URL || "http://localhost:4000/api").replace(/\/api$/, "");
