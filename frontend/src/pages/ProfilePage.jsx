// src/pages/ProfilePage.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CameraAlt as CameraIcon, Save as SaveIcon } from "@mui/icons-material";
import api from "../api/api.js"; // axios instance (baseURL=/api, withCredentials:true)

const DEFAULT_AVATAR = "https://i.pravatar.cc/120?img=13";

const isLetterOrSpace = (str) => /^[A-Za-z ]+$/.test(str.trim());
const sanitizeName = (str) => str.replace(/[^A-Za-z ]+/g, ""); // strip non-letters/spaces
const isValidEmail = (str) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(str.trim());

/**
 * Enforce: digits only, max 10, first must be '0'.
 * Behavior:
 * - If user types first digit not '0', we coerce to "0".
 * - Value length cannot exceed 10.
 */
const sanitizePhone = (next) => {
  const digits = (next || "").replace(/\D+/g, "");
  if (!digits) return ""; // allow empty state while editing
  const prefixed = digits[0] === "0" ? digits : "0" + digits; // ensure it starts with 0
  return prefixed.slice(0, 10); // cap to 10
};
const isValidPhone = (str) => /^0\d{9}$/.test(str); // 10 digits, starts with 0

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // inline errors
  const [nameErr, setNameErr] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [phoneErr, setPhoneErr] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mbp_user");
      const u = raw ? JSON.parse(raw) : null;
      setUser(u);
      setFullName(u?.fullName || u?.name || "");
      setEmail(u?.email || "");
      setPhone(sanitizePhone(u?.phone || "")); // normalize any existing value
      if (u?._id) {
        const url = `${api.defaults.baseURL.replace(/\/$/, "")}/users/${u._id}/avatar`;
        setAvatarUrl(`${url}?t=${Date.now()}`);
      } else {
        setAvatarUrl(DEFAULT_AVATAR);
      }
    } catch {
      setUser(null);
    }
  }, []);

  const refreshLocalUser = (partial) => {
    const raw = localStorage.getItem("mbp_user");
    const u = raw ? JSON.parse(raw) : {};
    const next = { ...u, ...partial };
    localStorage.setItem("mbp_user", JSON.stringify(next));
    setUser(next);
  };

  // ---------- Validity ----------
  const nameValid = useMemo(() => !!fullName.trim() && isLetterOrSpace(fullName), [fullName]);
  const emailValid = useMemo(() => !!email.trim() && isValidEmail(email), [email]);
  const phoneValid = useMemo(() => isValidPhone(phone), [phone]);
  const formValid = nameValid && emailValid && phoneValid;

  useEffect(() => {
    // realtime inline error messages
    if (!fullName.trim()) setNameErr("");
    else setNameErr(nameValid ? "" : "Name can contain letters and spaces only");
  }, [fullName, nameValid]);

  useEffect(() => {
    if (!email.trim()) setEmailErr("");
    else setEmailErr(emailValid ? "" : "Enter a valid email (e.g., name@example.com)");
  }, [email, emailValid]);

  useEffect(() => {
    if (!phone) setPhoneErr("");
    else setPhoneErr(phoneValid ? "" : "Phone must be 10 digits and start with 0");
  }, [phone, phoneValid]);

  // ---------- Handlers ----------
  const onNameChange = (e) => {
    const sanitized = sanitizeName(e.target.value);
    setFullName(sanitized);
  };

  const onEmailChange = (e) => {
    setEmail(e.target.value);
  };

  const onPhoneChange = (e) => {
    const next = sanitizePhone(e.target.value);
    // Special rule: when empty, first input must become exactly "0"
    if (!phone && next === "") {
      // user tried typing a non-digit or deleted; keep empty
      setPhone("");
      return;
    }
    if (!phone && next !== "" && next[0] !== "0") {
      setPhone("0");
      return;
    }
    setPhone(next);
  };

  // Block non-numeric keys except controls
  const onPhoneKeyDown = (e) => {
    const allowed = [
      "Backspace","Delete","ArrowLeft","ArrowRight","Home","End","Tab"
    ];
    if (allowed.includes(e.key)) return;

    // Allow digits
    if (/^\d$/.test(e.key)) {
      // enforce first char '0' when empty
      if (!phone && e.key !== "0") {
        e.preventDefault();
        // set to "0" instead of the pressed key
        setPhone("0");
      } else if (phone.length >= 10) {
        e.preventDefault(); // stop at 10
      }
      return;
    }

    // Block everything else
    e.preventDefault();
  };

  const updateProfile = async (e) => {
    e.preventDefault(); setErr(""); setMsg("");
    if (!formValid) {
      setErr("Please fix the highlighted fields and try again.");
      return;
    }
    try {
      setSaving(true);
      const res = await api.patch("auth/profile", { fullName: fullName.trim(), phone, email: email.trim() });
      if (res?.data?.ok || res?.data?.success) {
        setMsg("Profile updated");
        refreshLocalUser({ fullName: fullName.trim(), phone, email: email.trim() });
      } else {
        throw new Error(res?.data?.message || res?.data?.error || "Update failed");
      }
    } catch (e) {
      setErr(e.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault(); setErr(""); setMsg("");
    if (!currentPassword || !newPassword) return setErr("Enter current and new password");
    if (newPassword !== confirm) return setErr("Passwords do not match");
    if (newPassword.length < 8 || newPassword.length > 12) return setErr("Password must be 8–12 characters");
    try {
      setSaving(true);
      const res = await api.post("auth/change-password", { currentPassword, newPassword });
      if (res?.data?.ok || res?.data?.success) {
        setMsg("Password changed");
        setCurrentPassword(""); setNewPassword(""); setConfirm("");
      } else {
        throw new Error(res?.data?.message || res?.data?.error || "Failed to change password");
      }
    } catch (e) {
      setErr(e.message || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user?._id) return;
    setErr(""); setMsg("");
    try {
      const form = new FormData();
      form.append("avatar", file);
      await api.put(`users/${user._id}/avatar`, form, { headers: { "Content-Type": "multipart/form-data" } });
      const url = `${api.defaults.baseURL.replace(/\/$/, "")}/users/${user._id}/avatar`;
      setAvatarUrl(`${url}?t=${Date.now()}`);
      setMsg("Avatar updated");
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || "Failed to update avatar");
    }
  };

  const logout = async () => {
    const ok = window.confirm("Log out of My Budget Pal?");
    if (!ok) return;
    try { await api.post("auth/logout"); } catch {}
    localStorage.removeItem("mbp_user");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <div className="mx-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600">
            Profile
          </h1>
          <p className="text-slate-600 mt-1">
            Manage your account info and avatar.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={avatarUrl}
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = DEFAULT_AVATAR; }}
              alt="avatar"
              className="h-24 w-24 rounded-full object-cover border border-slate-200"
            />
            <label className="absolute bottom-0 right-0 rounded-full bg-indigo-600 p-2 text-white shadow cursor-pointer">
              <CameraIcon fontSize="small" />
              <input type="file" accept="image/*" onChange={onPickAvatar} className="hidden" />
            </label>
          </div>
        </div>

        {(msg || err) && (
          <div className={`mt-4 rounded-xl border px-3 py-2 text-sm ${err ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {err || msg}
          </div>
        )}

        {/* Profile info */}
        <form onSubmit={updateProfile} className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Full name</label>
            <input
              value={fullName}
              onChange={onNameChange}
              className={`mt-1 w-full rounded-xl border ${nameErr ? "border-rose-400" : "border-slate-300"} bg-white px-3 py-2`}
              placeholder="John Doe"
            />
            {nameErr && <p className="mt-1 text-xs text-rose-600">{nameErr}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={onEmailChange}
              className={`mt-1 w-full rounded-xl border ${emailErr ? "border-rose-400" : "border-slate-300"} bg-white px-3 py-2`}
              placeholder="you@example.com"
              inputMode="email"
              autoComplete="email"
            />
            {emailErr && <p className="mt-1 text-xs text-rose-600">{emailErr}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Phone</label>
            <input
              value={phone}
              onChange={onPhoneChange}
              onKeyDown={onPhoneKeyDown}
              className={`mt-1 w-full rounded-xl border ${phoneErr ? "border-rose-400" : "border-slate-300"} bg-white px-3 py-2`}
              placeholder="0712345678"
              type="tel"
              inputMode="numeric"
              pattern="^0\d{9}$"
              maxLength={10}
            />
            <p className={`text-xs mt-1 ${phoneErr ? "text-rose-600" : "text-slate-500"}`}>
              Must be exactly 10 digits and start with 0.
            </p>
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving || !formValid}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-70"
              title={!formValid ? "Fix validation errors to save" : "Save profile"}
            >
              <SaveIcon fontSize="small" /> {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        </form>

        {/* Password */}
        <form onSubmit={changePassword} className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Current password</label>
            <input type="password" value={currentPassword} onChange={(e)=>setCurrentPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">New password</label>
            <input type="password" value={newPassword} onChange={(e)=>setNewPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2" />
            <p className="text-xs text-slate-500 mt-1">8–12 characters</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Confirm</label>
            <input type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2" />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-70">
              Change Password
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 flex justify-between mx-8">
        <button onClick={()=>navigate(-1)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50">
          Back
        </button>
        <button
          onClick={logout}
          className="rounded-xl bg-rose-600 px-4 py-2 text-white hover:bg-rose-700"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
