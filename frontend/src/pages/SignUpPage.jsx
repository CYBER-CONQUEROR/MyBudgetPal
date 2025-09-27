import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import axios from "axios";
import "../css/SignUp.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

const SignUp = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "fullName" && /[^a-zA-Z\s]/.test(value)) return; // only letters & spaces
    if (name === "phone" && /[^0-9+]/.test(value)) return; // allow numbers and +
    setFormData((s) => ({ ...s, [name]: value }));
  };

  const handleAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
      setServerError("Only PNG, JPEG, or WEBP images are allowed.");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setServerError("Avatar must be under 2MB.");
      return;
    }
    setServerError("");
    setAvatarFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.fullName) newErrors.fullName = "Full name is required";
    else if (formData.fullName.length > 100)
      newErrors.fullName = "Full name cannot exceed 100 characters";

    if (!formData.email) newErrors.email = "Email is required";
    else if (
      !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.email)
    )
      newErrors.email = "Invalid email format";
    else if (formData.email.length > 30)
      newErrors.email = "Email cannot exceed 30 characters";

    if (!formData.phone) newErrors.phone = "Phone number is required";
    else if (!/^(?:0\d{9}|\+94\d{9})$/.test(formData.phone))
      newErrors.phone = "Use 0712345678 or +94712345678";

    if (!formData.password) newErrors.password = "Password is required";
    else if (formData.password.length < 8 || formData.password.length > 12)
      newErrors.password = "Password must be 8-12 characters";

    if (!formData.confirmPassword)
      newErrors.confirmPassword = "Confirm your password";
    else if (formData.password !== formData.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    try {
      setLoading(true);

      // Build multipart/form-data
      const fd = new FormData();
      fd.append("fullName", formData.fullName);
      fd.append("email", formData.email);
      fd.append("phone", formData.phone);
      fd.append("password", formData.password);
      fd.append("confirmPassword", formData.confirmPassword);
      if (avatarFile) fd.append("avatar", avatarFile); // optional

      const res = await axios.post(`${API}/auth/register`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.ok) {
        alert("Signup successful!");
        navigate("/login");
      } else {
        setServerError(res.data?.message || "Registration failed");
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Registration failed. Try again.";
      setServerError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page">
      <main className="signup-main">
        <div className="signup-container">
          <form className="signup-form" onSubmit={handleSubmit}>
            <h2>Sign Up</h2>
            <p className="subtitle">Create your account to get started</p>

            {/* Avatar */}
            <label>Profile Picture (optional)</label>
            <div className="avatar-row">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatar}
              />
              {preview && (
                <img
                  src={preview}
                  alt="preview"
                  className="avatar-preview"
                  onLoad={() => URL.revokeObjectURL(preview)}
                />
              )}
            </div>

            <label>Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="John Doe"
              maxLength={100}
              autoComplete="name"
            />
            {errors.fullName && <span className="error">{errors.fullName}</span>}

            <label>Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="user@example.com"
              maxLength={30}
              autoComplete="email"
            />
            {errors.email && <span className="error">{errors.email}</span>}

            <label>Phone Number</label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="0712345678 or +94712345678"
              maxLength={13} // 0712345678(10) or +94712345678(12)
              autoComplete="tel"
            />
            {errors.phone && <span className="error">{errors.phone}</span>}

            <label>Password</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                minLength={8}
                maxLength={12}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="show-password-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            <span className="password-info">Password must be 8-12 characters.</span>
            {errors.password && <span className="error">{errors.password}</span>}

            <label>Confirm Password</label>
            <div className="password-wrapper">
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                minLength={8}
                maxLength={12}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="show-password-btn"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {errors.confirmPassword && (
              <span className="error">{errors.confirmPassword}</span>
            )}

            {serverError && <div className="server-error">{serverError}</div>}

            <button type="submit" className="signup-button" disabled={loading}>
              {loading ? "Creating..." : "Create Account"}
            </button>

            <p className="login-link">
              Already have an account? <Link to="/login">Log in</Link>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
};

export default SignUp;
