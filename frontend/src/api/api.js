import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:4000/api",
  withCredentials: true, // send/receive the HttpOnly JWT cookie
});

// If the cookie is missing/expired, bounce to login once
let didKick = false;
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    if (status === 401 && !didKick) {
      didKick = true;
      // optional: keep where user was
      const where = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${where}`;
    }
    return Promise.reject(err);
  }
);

export default api;
