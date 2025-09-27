// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/api.js";

export default function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData((s) => ({ ...s, [e.target.name]: e.target.value }));
  };

  // Keep validation aligned with backend (8–12 chars)
  const validatePassword = (password) => {
    if (!password) return "Password cannot be empty.";
    if (password.length < 8 || password.length > 12)
      return "Password must be 8–12 characters.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    try {
      setLoading(true);
      const res = await api.post(`auth/login`, {
        email: formData.email,
        password: formData.password,
      });

      if (res.data?.ok && res.data?.user) {
        // Store user for later use (replace with JWT flow if you add tokens)
        localStorage.setItem("mbp_user", JSON.stringify(res.data.user));
        navigate("/dash");
      } else {
        setError(res.data?.message || "Login failed. Check your credentials.");
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Login failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center vh-100"
      style={{
        background: "linear-gradient(135deg, #ffffffff 0%, #ffffffff 100%)",
        width: "100vw",
      }}
    >
      <div
        className="card shadow-lg p-5 w-100"
        style={{
          maxWidth: "500px",
          borderRadius: "15px",
          background: "rgba(255, 255, 255, 0.95)",
        }}
      >
        <h2 className="text-center mb-4 text-primary fw-bold">Login</h2>

        {error && <p className="alert alert-danger mb-4">{error}</p>}

        <form onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className="mb-3">
            <label className="form-label fw-semibold">Email address</label>
            <input
              type="email"
              name="email"
              className="form-control"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="form-label fw-semibold">Password</label>
            <input
              type="password"
              name="password"
              className="form-control"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
            <div className="form-text">Password must be 8–12 characters.</div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary w-100 fw-bold"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-4 text-center text-muted">
          Don’t have an account?{" "}
          <Link to="/register" className="fw-bold text-decoration-none text-primary">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
