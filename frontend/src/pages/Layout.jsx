// src/Layout.jsx
import * as React from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  Menu as MenuIcon,
  Home as HomeIcon,
  AccountBalance as AccountBalanceIcon,
  Event as EventIcon,
  ShoppingCart as ShoppingCartIcon,
  Savings as SavingsIcon,
  NotificationsNone as NotificationsIcon,
  AccountBalanceWallet as WalletIcon,
} from "@mui/icons-material";
import CloseIcon from "@mui/icons-material/Close";
import BarChartIcon from "@mui/icons-material/BarChart";


const links = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/income", label: "Income Management", icon: WalletIcon },
  { to: "/budget", label: "Budget Management", icon: BarChartIcon  },
  { to: "/accounts", label: "Bank Accounts", icon: WalletIcon },
  { to: "/commitments", label: "Commitments", icon: AccountBalanceIcon },
  { to: "/events", label: "Events", icon: EventIcon },
  { to: "/daily", label: "Daily Expenses", icon: ShoppingCartIcon },
  { to: "/savings", label: "Savings", icon: SavingsIcon },
  { to: "/notifications", label: "Notifications", icon: NotificationsIcon },

];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const location = useLocation();

  const NavItem = ({ to, label, icon: Icon }) => {
    const active = location.pathname === to;
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
        <button className="w-full rounded-md bg-rose-50 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100">
          Log Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-[#f6f8fb]">
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
            <nav className="flex-1 px-3 py-4 space-y-1">
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

      {/* main */}
      <div className="flex flex-1 flex-col">
        {/* header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
          {/* left: hamburger mobile + avatar + welcome */}
          <div className="flex items-center gap-3">
            <button
              className="md:hidden rounded-lg p-2 hover:bg-slate-100"
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon fontSize="small" />
            </button>
            <div className="flex items-center gap-3">
              <img
                src="https://i.pravatar.cc/40?img=5"
                alt="user"
                className="h-9 w-9 rounded-full"
              />
              <div className="leading-tight">
                <p className="text-xs text-slate-500">Welcome back,</p>
                <p className="text-sm font-semibold text-slate-900">Olivia</p>
              </div>
            </div>
          </div>
          {/* right: notif */}
          <div className="flex items-center gap-4">
            <button className="relative rounded-lg p-2 hover:bg-slate-100">
              <NotificationsIcon fontSize="small" className="text-slate-700" />
              <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                3
              </span>
            </button>
          </div>
        </header>

        {/* content */}
        <main className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
