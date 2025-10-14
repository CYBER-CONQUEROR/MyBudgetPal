// src/Layout.jsx
import * as React from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  Menu as MenuIcon,
  Home as HomeIcon,
  AccountBalance as AccountBalanceIcon,
  Event as EventIcon,
  ShoppingCart as ShoppingCartIcon,
  Savings as SavingsIcon,
  AccountBalanceWallet as WalletIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import CloseIcon from "@mui/icons-material/Close";
import BarChartIcon from "@mui/icons-material/BarChart";
import api from "../api/api.js";

// Import the logo
import logo from "../images/logo.jpg";

/* ======== Lighter, professional navy theme ======== */
const SIDEBAR_GRADIENT = "from-[#112a53] via-[#163563] to-[#1c4176]"; // lighter navy
const SIDEBAR_BORDER = "border-white/10";
const RING_FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7aa2ff]";

const TXT_MUTED = "text-slate-200";
const TXT_SOFT = "text-slate-100";
const HOVER_SOFT = "hover:bg-white/10";

/* Link styles (lighter/pro): active = white surface + navy left bar (desktop expanded) */
const ACTIVE_SURFACE =
  "bg-white/90 text-[#163563] shadow-sm border border-slate-200";
const ACTIVE_BAR_COLOR = "bg-[#3b6edc]"; // soft navy/indigo

const DEFAULT_AVATAR = "https://i.pravatar.cc/80?img=13";

const links = [
  { to: "/dash", label: "Home", icon: HomeIcon },
  { to: "/income", label: "Income Management", icon: WalletIcon },
  { to: "/budget", label: "Budget Management", icon: BarChartIcon },
  { to: "/accounts", label: "Bank Accounts", icon: WalletIcon },
  { to: "/commitments", label: "Commitments", icon: AccountBalanceIcon },
  { to: "/events", label: "Events", icon: EventIcon },
  { to: "/daily", label: "Daily Expenses", icon: ShoppingCartIcon },
  { to: "/savings", label: "Savings", icon: SavingsIcon },
  { to: "/profile", label: "Profile", icon: PersonIcon },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const navigate = useNavigate();

  const [user, setUser] = React.useState(null);
  const [avatarUrl, setAvatarUrl] = React.useState(DEFAULT_AVATAR);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("mbp_user");
      const u = raw ? JSON.parse(raw) : null;
      setUser(u);
      if (u?._id) {
        const url = `${api.defaults.baseURL.replace(/\/$/, "")}/users/${u._id}/avatar`;
        setAvatarUrl(`${url}?t=${Date.now()}`);
      } else {
        setAvatarUrl(DEFAULT_AVATAR);
      }
    } catch {
      setUser(null);
      setAvatarUrl(DEFAULT_AVATAR);
    }
  }, []);

  const logout = async () => {
    const ok = window.confirm("Log out of MY BUDGET PAL?");
    if (!ok) return;
    try {
      await api.post("auth/logout");
    } catch (_) {}
    localStorage.removeItem("mbp_user");
    navigate("/login");
  };

  /* ---------- Nav Item (no underline + white default icon) ---------- */
  const NavItem = ({ to, label, icon: Icon, onNavigate }) => {
    return (
      <NavLink
        to={to}
        onClick={onNavigate}
        title={collapsed ? label : undefined}
        style={{ textDecoration: "none" }}
        className={({ isActive }) =>
          [
            "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
            "no-underline decoration-transparent hover:decoration-transparent focus:decoration-transparent active:decoration-transparent",
            isActive ? `active ${ACTIVE_SURFACE}` : `${TXT_MUTED} ${HOVER_SOFT}`,
          ].join(" ")
        }
      >
        {/* Icon colors adjusted here */}
        <Icon
          fontSize="small"
          className={[
            "shrink-0 transition-colors duration-200",
            "text-white/85 group-hover:text-white",
            "active:text-slate-900 group-[.active]:text-slate-900",
            collapsed ? "!mx-auto" : "",
          ].join(" ")}
        />

        <span
          className={[
            "whitespace-nowrap transition-[opacity,transform] duration-200",
            collapsed
              ? "opacity-0 -translate-x-1 pointer-events-none"
              : "opacity-100 translate-x-0",
          ].join(" ")}
        >
          {label}
        </span>

        <span
          className={[
            "absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full",
            ACTIVE_BAR_COLOR,
            "opacity-0 group-[.active]:opacity-100",
            collapsed ? "hidden" : "",
          ].join(" ")}
        />
      </NavLink>
    );
  };

  /* ---------- Mobile Drawer ---------- */
  const MobileDrawer = () => (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={() => setMobileOpen(false)}
      />
      <div
        className={[
          "absolute inset-y-0 left-0 w-72",
          "bg-gradient-to-b",
          SIDEBAR_GRADIENT,
          "shadow-2xl flex flex-col border-r",
          SIDEBAR_BORDER,
          "transition-transform duration-300 translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            {/* Logo with image */}
            <img 
              src={logo} 
              alt="MY BUDGET PAL" 
              className="h-8 w-8 rounded-xl object-cover"
            />
            <div className="flex flex-col">
              <span className="font-bold text-white text-sm">MY BUDGET PAL</span>
              <span className="text-xs text-white/70">Finance Companion</span>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className={`rounded-lg p-2 text-white/85 ${HOVER_SOFT} ${RING_FOCUS}`}
            aria-label="Close menu"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {links.map((l) => (
            <NavItem key={l.to} {...l} onNavigate={() => setMobileOpen(false)} />
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            onClick={logout}
            className={`w-full rounded-md bg-white/90 text-[#163563] py-2 text-sm font-semibold hover:bg-white transition-colors ${RING_FOCUS}`}
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );

  /* ---------- Desktop Sidebar ---------- */
  const Sidebar = () => (
    <aside
      className={[
        "relative hidden md:flex h-full flex-col bg-gradient-to-b",
        SIDEBAR_GRADIENT,
        "transition-[width] duration-300 ease-out",
        "shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.06)]",
        "border-r",
        SIDEBAR_BORDER,
        collapsed ? "w-20" : "w-72",
      ].join(" ")}
    >
      <div className="flex h-16 items-center justify-between px-3 border-b border-white/10">
        <div className="flex items-center gap-2 overflow-hidden px-1">
          {/* Logo with image */}
          <img 
            src={logo} 
            alt="MY BUDGET PAL" 
            className="h-9 w-9 rounded-2xl object-cover"
          />
          <div
            className={[
              "transition-[opacity,transform,width] duration-300 flex flex-col",
              collapsed
                ? "opacity-0 -translate-x-2 w-0"
                : "opacity-100 translate-x-0 w-auto",
            ].join(" ")}
          >
            <span className="text-base font-bold text-white">MY BUDGET PAL</span>
            <span className="text-xs text-white/70">Finance Companion</span>
          </div>
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={`rounded-lg p-2 text-white/85 ${HOVER_SOFT} ${RING_FOCUS}`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <MenuIcon fontSize="small" />
        </button>
      </div>

      <nav className="relative flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {links.map((l) => (
          <div key={l.to} className="relative">
            <NavItem {...l} />
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={logout}
          className={`w-full rounded-md bg-white/90 text-[#163563] py-2 text-sm font-semibold hover:bg-white transition-colors ${RING_FOCUS}`}
        >
          Log Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {mobileOpen && <MobileDrawer />}
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              className={`md:hidden rounded-lg p-2 text-[#163563] hover:bg-slate-100 ${RING_FOCUS}`}
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <MenuIcon fontSize="small" />
            </button>
            <div className="hidden md:flex items-center gap-2">
              <img 
                src={logo} 
                alt="MY BUDGET PAL" 
                className="h-6 w-6 rounded-lg object-cover"
              />
              <span className="text-sm font-bold text-[#163563]">
                MY BUDGET PAL
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-[11px] text-slate-500">Signed in as</div>
              <div className="text-sm font-semibold text-slate-900">
                {user?.fullName || user?.name || "User"}
              </div>
            </div>
            <button
              onClick={() => navigate("/profile")}
              className={`flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50 transition-colors ${RING_FOCUS}`}
              title="Open profile"
            >
              <img
                src={avatarUrl}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = DEFAULT_AVATAR;
                }}
                alt="avatar"
                className="h-9 w-9 rounded-full object-cover"
              />
            </button>
          </div>
        </header>

        <main className="bg-white flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}