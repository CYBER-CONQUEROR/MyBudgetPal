import axios from "axios";
export const API = "http://localhost:4000";
const defaultHeaders = { "x-user-id": "u_demo_1" };

export const getPlan = async (period) => {
  try { const r = await axios.get(`${API}/api/budget/plans/${period}`, { headers: defaultHeaders }); return r.data||null; }
  catch(e){ if (e?.response?.status===404) return null; throw e; }
};
export const getIncomes = async () => {
  const r = await axios.get(`${API}/api/incomes`, { headers: defaultHeaders });
  return Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.data)? r.data.data : []);
};
export const getExpenses = async () => {
  const r = await axios.get(`${API}/api/expenses`, { headers: defaultHeaders });
  return Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data)? r.data : []);
};
export const getTransactions = async () => {
  const r = await axios.get(`${API}/api/commitments`, { headers: defaultHeaders });
  return Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data)? r.data : []);
};
export const getCategories = async () => {
  const r = await axios.get(`${API}/api/categories`, { headers: defaultHeaders });
  return Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data)? r.data : []);
};
export const getAccounts = async () => {
  const r = await axios.get(`${API}/api/accounts`, { headers: defaultHeaders });
  const list = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data)? r.data : []);
  return list;
};
export const accountAmount = (a) => {
  if (a?.balanceCents!=null) return Number(a.balanceCents)/100;
  if (a?.amountCents!=null) return Number(a.amountCents)/100;
  for (const v of [a?.balance,a?.amount,a?.available,a?.currentBalance]) {
    const n = Number(v); if (!Number.isNaN(n)) return n;
  } return 0;
};

export const patchPlan = (period, body) =>
  axios.patch(`${API}/api/budget/plans/${period}`, body, { headers: defaultHeaders });
export const putDtdSub = (period, categoryId, amount) =>
  axios.put(`${API}/api/budget/plans/${period}/dtd/${String(categoryId)}`, { amount }, { headers: defaultHeaders });
export const deletePlanApi = (period) =>
  axios.delete(`${API}/api/budget/plans/${period}`, { headers: defaultHeaders });
export const createPlanApi = (payload) =>
  axios.post(`${API}/api/budget/plans`, payload, { headers: defaultHeaders });
export const replacePlanApi = (period, payload) =>
  axios.put(`${API}/api/budget/plans/${period}`, payload, { headers: defaultHeaders });

export async function getEventExpenses() {
  try {
    const r = await axios.get(`${API}/api/events`, { headers: defaultHeaders });
    const list = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
    return list;
  } catch {
    // fall back to empty if route not implemented yet
    return [];
  }
}

// Savings "actual" source (e.g., transfers into savings)
export async function getSavingsMovements() {
  try {
    const r = await axios.get(`${API}/api/savings-goals`, { headers: defaultHeaders });
    const list = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
    return list;
  } catch {
    return [];
  }
}
