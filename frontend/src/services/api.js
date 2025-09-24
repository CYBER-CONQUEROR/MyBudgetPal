import axios from "axios";

export const API = "http://localhost:4000";
export const defaultHeaders = { "x-user-id": "u_demo_1" };

// GET
export const getPlan = async (period) => {
  try {
    const r = await axios.get(`${API}/api/budget/plans/${period}`, { headers: defaultHeaders });
    return r.data || null;
  } catch (e) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
};

export const getIncomes = async () => {
  const r = await axios.get(`${API}/api/incomes`, { headers: defaultHeaders });
  return Array.isArray(r.data) ? r.data : [];
};

export const getExpenses = async () => {
  const r = await axios.get(`${API}/api/expenses`, { headers: defaultHeaders });
  return Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
};

export const getTransactions = async () => {
  const r = await axios.get(`${API}/api/transactions`, { headers: defaultHeaders });
  return Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
};

export const getCategories = async () => {
  const r = await axios.get(`${API}/api/categories`, { headers: defaultHeaders });
  return Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []);
}


// PATCH / PUT / DELETE
export const patchPlan = (period, body) =>
  axios.patch(`${API}/api/budget/plans/${period}`, body, { headers: defaultHeaders });

export const putDtdSub = (period, categoryId, amount) =>
  axios.put(`${API}/api/budget/plans/${period}/dtd/${String(categoryId)}`, { amount }, { headers: defaultHeaders });

export const deletePlanApi = (period) =>
  axios.delete(`${API}/api/budget/plans/${period}`, { headers: defaultHeaders });


