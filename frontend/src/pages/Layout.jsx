// src/Layout.jsx
import * as React from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
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
import api from "../api/api.js"; // axios instance (baseURL=/api, withCredentials:true)

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
    const ok = window.confirm("Log out of My Budget Pal?");
    if (!ok) return;
    try {
      await api.post("auth/logout"); // cookie cleared server-side
    } catch (_) {}
    localStorage.removeItem("mbp_user");
    navigate("/login");
  };

  const NavItem = ({ to, label, icon: Icon }) => {
    return (
      <NavLink
        to={to}
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) =>
          [
            "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
            isActive
              ? "text-indigo-600 bg-indigo-50 border-l-4 border-indigo-600"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
          ].join(" ")
        }
      >
        <Icon fontSize="small" className="shrink-0 text-inherit" />
        <span>{label}</span>
      </NavLink>
    );
  };

  const Sidebar = () => (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      {/* brand */}
      <div className="flex h-16 items-center gap-2 px-6 border-b border-slate-200">
        <span className="inline-block h-6 w-6 rounded bg-indigo-600"></span>
        <span className="text-base font-bold text-slate-800">My Budget Pal</span>
      </div>
      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {links.map((l) => (
          <NavItem key={l.to} {...l} />
        ))}
      </nav>
      {/* logout */}
      <div className="border-t border-slate-200 p-4">
        <button
          onClick={logout}
          className="w-full rounded-md bg-rose-50 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100"
        >
          Log Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#f6f8fb]">
      {/* mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl flex flex-col">
            <div className="flex h-16 items-center justify-between px-4 border-b border-slate-200">
              <span className="font-bold text-indigo-700">My Budget Pal</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <CloseIcon fontSize="small" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {links.map((l) => (
                <NavItem key={l.to} {...l} />
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* main column */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
          {/* left: hamburger + brand */}
          <div className="flex items-center gap-3">
            <button
              className="md:hidden rounded-lg p-2 hover:bg-slate-100"
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon fontSize="small" />
            </button>
            <div className="hidden md:flex items-center gap-2">
              <span className="inline-block h-5 w-5 rounded bg-indigo-600" />
              <span className="text-sm font-bold text-slate-900">My Budget Pal</span>
            </div>
          </div>
          {/* right: name + avatar */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-xs text-slate-500">Signed in as</div>
              <div className="text-sm font-semibold text-slate-900">
                {user?.fullName || user?.name || "User"}
              </div>
            </div>
            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
              title="Open profile"
            >
              <img
                src={avatarUrl}
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = DEFAULT_AVATAR; }}
                alt="avatar"
                className="h-9 w-9 rounded-full object-cover"
              />
            </button>
          </div>
        </header>

        {/* content area scrolls only */}
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
