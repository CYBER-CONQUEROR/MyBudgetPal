import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Plus, PencilLine, Archive, Search, Building2, ChevronDown, Trash2,
  ArrowRightLeft, ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, Wallet, Eye,
} from "lucide-react";
import api from "../api/api.js"; // axios instance with baseURL=/api and withCredentials:true

/* ---------- helpers ---------- */
const stripUndefined = (obj) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== undefined));

const fmtLKR = (cents) => {
  const rupees = Number(cents || 0) / 100;
  return `LKR ${rupees.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [instFilter, setInstFilter] = useState("All Institutions");
  const [typeFilter, setTypeFilter] = useState("All Types");
  const [showArchived, setShowArchived] = useState(false);

  // Modals and selections
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toArchive, setToArchive] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [action, setAction] = useState(null); // { type: 'transfer'|'deposit'|'withdraw' }
  const [details, setDetails] = useState(null);

  // Sri Lanka institutions (editable)
  const banksLK = [
    "Bank of Ceylon (BOC)", "People's Bank", "National Savings Bank (NSB)",
    "Commercial Bank of Ceylon", "Hatton National Bank (HNB)", "Sampath Bank",
    "Seylan Bank", "DFCC Bank", "Nations Trust Bank", "NDB Bank (National Development Bank)",
    "Pan Asia Bank", "Union Bank of Colombo", "Cargills Bank", "Amãna Bank",
    "HSBC Sri Lanka", "Standard Chartered Sri Lanka", "Citibank Sri Lanka",
    "State Bank of India - Sri Lanka", "Indian Bank - Sri Lanka", "Indian Overseas Bank - Sri Lanka",
    "Habib Bank Ltd (HBL)", "MCB Bank", "Public Bank Berhad - Sri Lanka", "Other",
  ];

  // Load
  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const { data } = await api.get("accounts", {
        params: { includeArchived: showArchived ? "true" : "false" },
      });
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setAccounts(list);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  // Filters
  const institutionsInData = useMemo(() => {
    const s = new Set();
    accounts.forEach((a) => a?.institution && s.add(a.institution));
    return Array.from(s);
  }, [accounts]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (accounts || []).filter((a) => {
      if (!showArchived && a.archived) return false;
      if (typeFilter !== "All Types" && a.type !== typeFilter) return false;
      if (instFilter !== "All Institutions" && a.institution !== instFilter) return false;
      if (!term) return true;
      return (
        (a.name || "").toLowerCase().includes(term) ||
        (a.institution || "").toLowerCase().includes(term) ||
        (a.numberMasked || "").toLowerCase().includes(term)
      );
    });
  }, [accounts, q, typeFilter, instFilter, showArchived]);

  // Actions
  const onCreate = () => { setEditing(null); setModalOpen(true); };
  const onEdit = (acc) => { setEditing(acc); setModalOpen(true); };

  const onView = async (acc) => {
    try {
      const { data } = await api.get(`accounts/${acc._id}`);
      setDetails(data?.data ?? data);
    } catch (e) {
      alert(e?.response?.data?.message || e.message || "Failed to load details");
    }
  };

  const handleSave = async (payload, id) => {
    try {
      const body = stripUndefined(payload);
      if (id) {
        await api.patch(`accounts/${id}`, body);
      } else {
        await api.post("accounts", body);
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || e.message || "Save failed");
    }
  };

  const handleArchive = async (id) => {
    try {
      await api.post(`accounts/${id}/archive`);
      setConfirmOpen(false);
      setToArchive(null);
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || e.message || "Archive failed");
    }
  };

  const handleUnarchive = async (id) => {
    try {
      await api.post(`accounts/${id}/unarchive`);
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || e.message || "Unarchive failed");
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`accounts/${id}`);
      setConfirmDeleteOpen(false);
      setToDelete(null);
      await load();
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404 || status === 405 || status === 422) {
        try {
          await api.post(`accounts/${id}/delete`);
          setConfirmDeleteOpen(false);
          setToDelete(null);
          await load();
          return;
        } catch (e2) {
          alert(e2?.response?.data?.message || e2.message || "Delete failed");
          return;
        }
      }
      alert(e?.response?.data?.message || e.message || "Delete failed");
    }
  };

  // Money movement
  const handleTransfer = async (fromId, toId, amountCents) => {
    try {
      await api.post("accounts/transfer", stripUndefined({ fromAccountId: fromId, toAccountId: toId, amountCents }));
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || e.message || "Transfer failed");
    }
  };

  const handleDeposit = async (bankId, amountCents) => {
    try {
      await api.post(`accounts/${bankId}/deposit`, stripUndefined({ amountCents }));
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || e.message || "Deposit failed (ensure Cash wallet exists)");
    }
  };

  const handleWithdraw = async (bankId, amountCents) => {
    try {
      await api.post(`accounts/${bankId}/withdraw`, stripUndefined({ amountCents }));
      await load();
    } catch (e) {
      alert(e?.response?.data?.message || e.message || "Withdraw failed (ensure Cash wallet exists)");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-700 via-indigo-600 to-purple-600">
              Accounts
            </h1>
            <p className="text-slate-600 mt-1">
              Create bank or card accounts. View balances. Move money safely.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onCreate} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 text-sm font-semibold shadow hover:opacity-95 active:scale-[.99]">
              <Plus size={18} /> Add Account
            </button>
            <button onClick={() => setAction({ type: "transfer" })} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white px-4 py-2 text-sm font-semibold shadow hover:opacity-95 active:scale-[.99]">
              <ArrowRightLeft size={18} /> Transfer
            </button>
            <button onClick={() => setAction({ type: "deposit" })} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 text-sm font-semibold shadow hover:opacity-95 active:scale-[.99]">
              <ArrowDownCircle size={18} /> Deposit
            </button>
            <button onClick={() => setAction({ type: "withdraw" })} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white px-4 py-2 text-sm font-semibold shadow hover:opacity-95 active:scale-[.99]">
              <ArrowUpCircle size={18} /> Withdraw
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-6 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, institution, or mask"
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="appearance-none rounded-xl border border-slate-200 bg-white px-5 py-2 pr-8 focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option>All Types</option>
                <option value="bank">Bank</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>

            <div className="relative">
              <select
                value={instFilter}
                onChange={(e) => setInstFilter(e.target.value)}
                className="appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option>All Institutions</option>
                {Array.from(new Set([...banksLK, ...institutionsInData])).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>

            <label className="flex items-center gap-2 select-none">
              <span className="text-sm text-slate-600">Show archived</span>
              <button
                type="button"
                onClick={() => setShowArchived((s) => !s)}
                className={`h-6 w-11 rounded-full p-[2px] transition ${showArchived ? "bg-blue-600" : "bg-slate-300"}`}
              >
                <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${showArchived ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </label>
          </div>
        </div>

        {/* Content */}
        <div className="mt-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error} <button onClick={load} className="ml-2 underline">Retry</button>
            </div>
          )}

          {loading ? (
            <SkeletonGrid />
          ) : filtered.length === 0 ? (
            <EmptyState onCreate={onCreate} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((a) => (
                <AccountCard
                  key={a._id}
                  account={a}
                  onView={() => onView(a)}
                  onEdit={() => onEdit(a)}
                  onArchive={() => { setToArchive(a); setConfirmOpen(true); }}
                  onUnarchive={() => handleUnarchive(a._id)}
                  onDelete={() => { setToDelete(a); setConfirmDeleteOpen(true); }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <AccountFormModal
          banks={banksLK}
          initial={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {/* Archive confirm */}
      {confirmOpen && (
        <ConfirmDialog
          title="Archive account?"
          message="Archiving hides this account. You can unarchive any time."
          confirmLabel="Archive"
          variant="danger"
          onCancel={() => { setConfirmOpen(false); setToArchive(null); }}
          onConfirm={() => handleArchive(toArchive._id)}
        />
      )}

      {/* Delete confirm */}
      {confirmDeleteOpen && (
        <ConfirmDialog
          title="Delete permanently?"
          message="This will permanently delete the account. You can’t undo this action."
          confirmLabel="Delete"
          variant="danger"
          onCancel={() => { setConfirmDeleteOpen(false); setToDelete(null); }}
          onConfirm={() => handleDelete(toDelete._id)}
        />
      )}

      {/* Money Action Modal */}
      {action && (
        <MoneyActionModal
          type={action.type}
          accounts={accounts}
          onClose={() => setAction(null)}
          onConfirm={(...args) => {
            if (action.type === "transfer") return handleTransfer(...args);
            if (action.type === "deposit") return handleDeposit(...args);
            if (action.type === "withdraw") return handleWithdraw(...args);
          }}
        />
      )}

      {/* Details Modal */}
      {details && <AccountDetailsModal account={details} onClose={() => setDetails(null)} />}
    </div>
  );
}

/* ---------- UI bits ---------- */
function Tag({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
      {children}
    </span>
  );
}

function TypeChip({ type }) {
  const map = {
    bank: { icon: <Banknote size={14} />, cls: "bg-blue-50 text-blue-700 border-blue-200" },
    cash: { icon: <Wallet size={14} />, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    card: { icon: <CreditCard size={14} />, cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  };
  const meta = map[type] || map.bank;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border ${meta.cls}`}>
      {meta.icon}
      {type}
    </span>
  );
}

function StatusPill({ archived }) {
  if (archived) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-xs font-bold">
        Archived
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-xs font-bold">
      Active
    </span>
  );
}

/* ---------- cards ---------- */
function AccountCard({ account, onView, onEdit, onArchive, onUnarchive, onDelete }) {
  const {
    name,
    institution,
    numberMasked,
    currency = "LKR",
    type,
    archived,
    balanceCents,
    creditLimitCents,
  } = account || {};

  const isCash = type === "cash";
  const balanceZero = Number(balanceCents || 0) === 0;

  const deleteReason = !archived
    ? "Archive the account first"
    : isCash
      ? "Cash wallet cannot be deleted"
      : !balanceZero
        ? "Balance must be 0 to delete"
        : "";

  const canDelete = archived && !isCash && balanceZero;

  // subtle color accents by type
  const typeAccent = {
    bank: "from-blue-600/10 to-blue-500/5 ring-blue-200/60",
    card: "from-fuchsia-600/10 to-fuchsia-500/5 ring-fuchsia-200/60",
    cash: "from-emerald-600/10 to-emerald-500/5 ring-emerald-200/60",
  }[type] || "from-slate-600/10 to-slate-500/5 ring-slate-200/60";

  return (
    <div
      className={`
        group relative rounded-2xl border border-slate-200 bg-white/90 backdrop-blur
        shadow-[0_1px_2px_rgba(0,0,0,.05)] hover:shadow-[0_10px_30px_rgba(2,6,23,.08)]
        transition-all duration-300 hover:-translate-y-[3px] overflow-hidden
      `}
    >
      {/* Accent top border */}
      <div className={`h-1 w-full bg-gradient-to-r ${typeAccent}`} />

      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Icon tile with soft gradient ring */}
            <div
              className={`
                relative grid h-10 w-10 place-items-center rounded-xl
                bg-gradient-to-br ${typeAccent}
                ring-1 ${typeAccent.includes("ring-") ? typeAccent.split(" ").pop() : "ring-slate-200/60"}
              `}
            >
              <div className="rounded-lg bg-white/80 p-2 shadow ring-1 ring-white/60">
                <Building2 className="h-5 w-5 text-slate-700" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-semibold text-slate-900">
                  {name || "Unnamed"}
                </h3>
                <StatusPill archived={archived} />
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-slate-600">
                <TypeChip type={type} />
                {institution && <Tag>{institution}</Tag>}
                <Tag>{currency}</Tag>
                {numberMasked ? (
                  <span className="ml-0.5 rounded-md bg-slate-50 px-1.5 py-0.5 font-medium tracking-widest text-slate-700 ring-1 ring-slate-200">
                    {numberMasked}
                  </span>
                ) : (
                  <span className="italic text-slate-400">No mask</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Balance block */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Current Balance
              </div>
              <div className="mt-1 text-2xl font-bold leading-tight text-slate-900">
                {fmtLKR(balanceCents)}
              </div>
              {type === "card" && creditLimitCents != null && (
                <div className="mt-1 text-xs text-slate-600">
                  Credit limit{" "}
                  <span className="font-medium">{fmtLKR(creditLimitCents)}</span>
                </div>
              )}
            </div>

            {/* Light badge on the right */}
            <div className="hidden sm:block">
              <div className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 shadow-sm">
                {archived ? "Read-only" : "Active"}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onView}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[.99]"
          >
            <Eye className="h-4 w-4" /> View
          </button>

          {!isCash && (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[.99]"
            >
              <PencilLine className="h-4 w-4" /> Edit
            </button>
          )}

          {!isCash ? (
            !archived ? (
              <button
                onClick={onArchive}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-100 active:scale-[.99]"
              >
                <Archive className="h-4 w-4" /> Archive
              </button>
            ) : (
              <>
                <button
                  onClick={onUnarchive}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 shadow-sm transition hover:bg-emerald-100 active:scale-[.99]"
                >
                  <Archive className="h-4 w-4" /> Unarchive
                </button>

                <button
                  onClick={canDelete ? onDelete : undefined}
                  disabled={!canDelete}
                  title={deleteReason}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm transition active:scale-[.99] ${canDelete
                      ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      : "cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </>
            )
          ) : null}
        </div>
      </div>

      {/* Subtle hover highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-indigo-500/[.04] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
        <Building2 />
      </div>
      <h3 className="text-lg font-semibold">No accounts yet</h3>
      <p className="mt-1 text-slate-600">Create a bank or card account to get started.</p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white hover:opacity-95"
      >
        <Plus size={18} /> Create account
      </button>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-slate-200" />
              <div>
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-56 rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-5 w-16 rounded-full bg-slate-200" />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <div className="h-8 w-20 rounded-lg bg-slate-100" />
            <div className="h-8 w-24 rounded-lg bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Modals ---------- */

// Utility: sanitize a money string (no commas) with support for typing a trailing dot.
const sanitizeMoney = (raw, { keepTrailingDot = false } = {}) => {
  if (raw == null) return "";
  let v = String(raw).replace(/[^\d.]/g, "");
  if (v === "") return "";
  // keep first dot only
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
  // if starts with ".", prefix 0
  if (v.startsWith(".")) v = "0" + v;
  let [i = "", d = ""] = v.split(".");
  // strip leading zeros but keep single 0
  i = i.replace(/^0+(?=\d)/, "");
  // clamp integer and decimals
  if (i.length > 8) i = i.slice(0, 8);
  if (d.length > 2) d = d.slice(0, 2);

  // preserve trailing dot while typing (e.g., "12.")
  const endsWithDot = v.endsWith(".");
  if (endsWithDot && keepTrailingDot) return (i || "0") + ".";

  return d.length ? `${i || "0"}.${d}` : (v.includes(".") ? (i || "0") + "." : (i || "0"));
};

// Create / Edit (create shows Opening Balance)
function AccountFormModal({ banks, initial, onClose, onSave }) {
  const isEdit = !!initial;
  const [type, setType] = useState(initial?.type || "bank");
  const [name, setName] = useState(initial?.name || "");
  const [institution, setInstitution] = useState(initial?.institution || "");
  const [numberMasked, setNumberMasked] = useState(initial?.numberMasked || "");
  const [creditLimit, setCreditLimit] = useState(
    initial?.creditLimitCents != null ? (initial.creditLimitCents / 100).toString() : ""
  );

  const [openingBalance, setOpeningBalance] = useState("");
  const openingRef = useRef(null);

  const [nameErr, setNameErr] = useState("");
  const [maskedErr, setMaskedErr] = useState("");
  const [openingErr, setOpeningErr] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const NAME_ALLOWED = /^[A-Za-z ]+$/;
  const MASKED_ALLOWED = /^[\d*]+$/;
  const MAX_AMOUNT = 99999999.99;

  const toCents = (s) => {
    if (s === "" || s == null || s === ".") return 0;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  };

  // Name (letters + spaces only)
  const handleNameBeforeInput = (e) => { if (e.data == null) return; if (!/^[A-Za-z ]+$/.test(e.data)) e.preventDefault(); };
  const handleNameKeyDown = (e) => {
    const ok = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Tab"];
    if (ok.includes(e.key)) return;
    if (!/^[A-Za-z ]$/.test(e.key)) e.preventDefault();
  };
  const handleNamePaste = (e) => {
    const text = (e.clipboardData.getData("text") || "").replace(/[^A-Za-z ]+/g, "");
    e.preventDefault();
    const t = e.target, s = t.selectionStart ?? 0, en = t.selectionEnd ?? 0;
    const next = (name.slice(0, s) + text + name.slice(en)).replace(/\s{2,}/g, " ");
    setName(next);
    setNameErr(next.trim() ? "" : "Name is required");
  };
  const onNameChange = (v) => { setName(v); setNameErr(v.trim() ? "" : "Name is required"); };

  // Masked number (digits and * only, max 23 chars)
  const onMaskedChange = (v) => {
    if (v === "") { setNumberMasked(""); setMaskedErr(""); return; }
    const raw = v.replace(/\s/g, "");
    if (!MASKED_ALLOWED.test(raw)) {
      const fixed = raw.replace(/[^0-9*]/g, "");
      setNumberMasked(fixed.slice(0, 23));
      setMaskedErr("Only digits and * are allowed");
      return;
    }
    if (raw.length >= 24) {
      setNumberMasked(raw.slice(0, 23));
      setMaskedErr("Maximum length is 23 characters");
      return;
    }
    setNumberMasked(raw);
    setMaskedErr("");
  };

  // Opening balance (no commas; allow "0.", "12.", "12.3", "12.34")
  const onOpeningChange = (e) => {
    const hadTrailingDot = /\.$/.test(e.target.value);
    const next = sanitizeMoney(e.target.value, { keepTrailingDot: hadTrailingDot });
    setOpeningErr("");
    setOpeningBalance(next);
  };

  const onOpeningBlur = () => {
    const cents = toCents(openingBalance);
    if (cents == null) return;
    setOpeningBalance((cents / 100).toFixed(2));
  };

  // Credit limit (same behavior)
  const onCreditLimitChange = (v) => {
    const hadTrailingDot = /\.$/.test(v);
    setCreditLimit(sanitizeMoney(v, { keepTrailingDot: hadTrailingDot }));
  };

  // Submit
  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!name.trim()) { setNameErr("Name is required"); return; }
    if (!NAME_ALLOWED.test(name)) { setNameErr("Only letters and spaces are allowed"); return; }

    if (numberMasked) {
      if (!MASKED_ALLOWED.test(numberMasked)) { setMaskedErr("Only digits and * are allowed"); return; }
      if (numberMasked.length > 23) { setMaskedErr("Maximum length is 23 characters"); return; }
    }

    let cl;
    if (type === "card") {
      const raw = (creditLimit || "").trim();
      if (!raw && !isEdit) { setErr("Credit limit is required for card accounts"); return; }
      if (raw) {
        const cents = Math.round(Number(raw) * 100);
        if (!Number.isFinite(cents) || cents < 0) { setErr("Credit limit must be a non-negative number"); return; }
        cl = cents;
      }
    }

    let openingBalanceCents;
    if (!isEdit) {
      if ((openingBalance || "").startsWith(".")) { setOpeningErr("Amount cannot start with a decimal point"); return; }
      const cents = toCents(openingBalance);
      if (cents == null) { setOpeningErr("Invalid amount"); return; }
      if (cents / 100 > MAX_AMOUNT) { setOpeningErr("Maximum is 99,999,999.99"); return; }
      openingBalanceCents = cents;
    }

    // build payload (do NOT send type/currency on edit to avoid 422)
    const payload = isEdit
      ? {
          name: name.trim(),
          institution: institution || undefined,
          numberMasked: numberMasked || undefined,
          ...(type === "card" ? { creditLimitCents: cl } : undefined),
        }
      : {
          type,
          name: name.trim(),
          institution: institution || undefined,
          numberMasked: numberMasked || undefined,
          currency: "LKR",
          ...(type === "card" ? { creditLimitCents: cl } : undefined),
          openingBalanceCents,
        };

    try {
      setSaving(true);
      await onSave(stripUndefined(payload), initial?._id);
    } catch (e2) {
      setErr(e2?.response?.data?.message || e2?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">{isEdit ? "Edit Account" : "Add Account"}</h3>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={isEdit}
                className="mt-1 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:bg-slate-50"
              >
                <option value="bank">Bank</option>
                <option value="card">Card</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Name<span className="text-rose-600"> *</span>
              </label>
              <input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onBeforeInput={handleNameBeforeInput}
                onKeyDown={handleNameKeyDown}
                onPaste={handleNamePaste}
                placeholder={type === "card" ? "Visa Main" : "HNB Salary"}
                inputMode="text"
                className={`mt-1 w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200 ${nameErr ? "border-rose-300" : "border-slate-200"
                  }`}
              />
              {nameErr && <p className="mt-1 text-xs text-rose-600">{nameErr}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Institution</label>
              <select
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="mt-1 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option value="">Select (optional)</option>
                {banks.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Masked Number</label>
              <input
                value={numberMasked}
                onChange={(e) => onMaskedChange(e.target.value)}
                placeholder="e.g., ****1234"
                inputMode="numeric"
                className={`mt-1 w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200 ${maskedErr ? "border-rose-300" : "border-slate-200"
                  }`}
              />
              <p className="mt-1 text-xs text-slate-500">Only last digits. Never store full numbers.</p>
              {maskedErr && <p className="mt-1 text-xs text-rose-600">{maskedErr}</p>}
            </div>
          </div>

          {type === "card" && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Credit Limit (LKR)</label>
              <input
                type="text"
                inputMode="decimal"
                value={creditLimit}
                onChange={(e) => onCreditLimitChange(e.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
            </div>
          )}

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Opening Balance (LKR)</label>
              <input
                ref={openingRef}
                type="text"
                inputMode="decimal"
                value={openingBalance}
                onChange={onOpeningChange}
                onBlur={onOpeningBlur}
                placeholder="0.00"
                className={`mt-1 w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200 ${openingErr ? "border-rose-300" : "border-slate-200"
                  }`}
              />
              <p className="mt-1 text-xs text-slate-500">
                Up to 2 decimals · Max 99,999,999.99 · can’t start with “.”
              </p>
              {openingErr && <p className="mt-1 text-xs text-rose-600">{openingErr}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Currency</label>
              <input
                value="LKR"
                disabled
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"
              />
            </div>
          </div>

          {err && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {err}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !!nameErr || !!maskedErr || !!openingErr}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-white hover:opacity-95 disabled:opacity-70"
            >
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", variant = "primary", onCancel, onConfirm }) {
  const style =
    variant === "danger"
      ? "bg-gradient-to-r from-rose-600 to-red-600 hover:opacity-95"
      : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-slate-700">{message}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button onClick={onConfirm} className={`rounded-xl px-4 py-2 text-white ${style}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Money actions ---------- */
function MoneyActionModal({ type, accounts, onClose, onConfirm }) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState(""); // plain string, supports "12.", "0.5", etc.
  const [err, setErr] = useState("");

  const active = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const banks = useMemo(() => active.filter((a) => a.type === "bank"), [active]);
  const cashAcc = useMemo(() => active.find((a) => a.type === "cash"), [active]);
  const nonCash = useMemo(() => active.filter((a) => a.type !== "cash"), [active]);

  const titleMap = {
    transfer: "Transfer between accounts",
    deposit: "Deposit (Cash → Bank)",
    withdraw: "Withdraw (Bank → Cash)",
  };

  // balances
  const balCentsOf = (a) => {
    if (!a) return 0;
    const c = a.currentBalanceCents ?? a.balanceCents ?? 0;
    return Number.isFinite(c) ? c : 0;
  };
  const money = (cents) =>
    `LKR ${((cents ?? 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const byId = useMemo(() => Object.fromEntries(active.map(a => [a._id, a])), [active]);
  const fromAcc = byId[fromId];
  const toAcc = byId[toId];

  const MAX_AMOUNT = 99999999.99;
  const toCents = (str) => {
    if (!str || str === ".") return null;
    const n = Number(str);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  };

  const onAmountChange = (e) => {
    const hadTrailingDot = /\.$/.test(e.target.value);
    const next = sanitizeMoney(e.target.value, { keepTrailingDot: hadTrailingDot });
    setErr("");
    setAmount(next);
  };

  // available logic
  const availableCents = useMemo(() => {
    if (type === "transfer") return balCentsOf(fromAcc);
    if (type === "deposit") return balCentsOf(cashAcc);
    if (type === "withdraw") return balCentsOf(toAcc);
    return 0;
  }, [type, fromAcc, toAcc, cashAcc]);

  const availableLabel = type === "deposit" ? "Cash available" : type === "withdraw" ? "Bank available" : "From account available";

  const submit = (e) => {
    e.preventDefault();
    setErr("");

    const cents = toCents(amount);
    if (!Number.isFinite(cents) || cents <= 0) { setErr("Enter a valid amount"); return; }
    if (cents / 100 > MAX_AMOUNT) { setErr("Amount exceeds limit"); return; }
    if (cents > availableCents) { setErr("Amount exceeds available balance"); return; }

    if (type === "transfer") {
      if (!fromId || !toId || fromId === toId) { setErr("Pick two different non-cash accounts"); return; }
      if (fromAcc?.type === "cash" || toAcc?.type === "cash") {
        setErr("Use Deposit/Withdraw to move money to/from Cash wallet"); return;
      }
      onConfirm(fromId, toId, cents);
      onClose();
      return;
    }
    if (type === "deposit") {
      if (!cashAcc) { setErr("Cash wallet not found"); return; }
      if (!toId) { setErr("Pick a bank account to deposit into"); return; }
      onConfirm(toId, cents);
      onClose();
      return;
    }
    if (type === "withdraw") {
      if (!toId) { setErr("Pick the bank account to withdraw from"); return; }
      onConfirm(toId, cents);
      onClose();
      return;
    }
  };

  const confirmDisabled = (() => {
    const cents = toCents(amount) ?? 0;
    if (cents <= 0) return true;
    if (cents > availableCents) return true;
    if (type === "transfer") {
      if (!fromId || !toId || fromId === toId) return true;
      if (fromAcc?.type === "cash" || toAcc?.type === "cash") return true;
    }
    if (type === "deposit") { if (!toId || !cashAcc) return true; }
    if (type === "withdraw") { if (!toId) return true; }
    return false;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">{titleMap[type] || "Action"}</h3>

        <form onSubmit={submit} className="mt-4 space-y-4">
          {type === "transfer" && (
            <>
              <div>
                <label className="block text-sm mb-1">From account</label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  <option value="">Select</option>
                  {nonCash.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {fromAcc && (
                  <p className="text-xs text-slate-500 mt-1">
                    {availableLabel}: <span className="font-medium">{money(balCentsOf(fromAcc))}</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm mb-1">To account</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  <option value="">Select</option>
                  {nonCash.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500 -mt-1">Use <b>Deposit/Withdraw</b> to move money to/from Cash wallet.</p>
            </>
          )}

          {type === "deposit" && (
            <div>
              <label className="block text-sm mb-1">Bank account</label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option value="">Select</option>
                {banks.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-slate-500">Moves money from your Cash wallet into this bank.</p>
                <p className="text-xs text-slate-600">
                  Cash available: <span className="font-medium">{money(balCentsOf(cashAcc))}</span>
                </p>
              </div>
            </div>
          )}

          {type === "withdraw" && (
            <div>
              <label className="block text-sm mb-1">Bank account</label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option value="">Select</option>
                {banks.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
              {toAcc && (
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500">Moves money from this bank into your Cash wallet.</p>
                  <p className="text-xs text-slate-600">
                    Bank available: <span className="font-medium">{money(balCentsOf(toAcc))}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm mb-1">Amount (LKR)</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={onAmountChange}
              placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 p-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
            />
            {availableCents > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                Max allowed: <span className="font-medium">{money(availableCents)}</span>
              </p>
            )}
          </div>

          {err && <div className="text-sm text-rose-600">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={confirmDisabled}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 hover:opacity-95"
            >
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Read-only details view
function AccountDetailsModal({ account, onClose }) {
  const fmt = (v) => (v ? new Date(v).toLocaleString() : "—");
  const rows = [
    ["Name", account.name || "—"],
    ["Type", account.type || "—"],
    ["Institution", account.institution || "—"],
    ["Masked Number", account.numberMasked || "—"],
    ["Currency", account.currency || "LKR"],
    ["Current Balance", fmtLKR(account.balanceCents)],
  ];
  if (account.type === "card" && account.creditLimitCents != null) {
    rows.push(["Credit Limit", fmtLKR(account.creditLimitCents)]);
  }
  rows.push(["Created", fmt(account.createdAt)]);
  rows.push(["Updated", fmt(account.updatedAt)]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">Account Details</h3>
        <div className="mt-4 divide-y divide-slate-100">
          {rows.map(([label, value]) => (
            <div key={label} className="py-2 flex items-center justify-between">
              <span className="text-sm text-slate-500">{label}</span>
              <span className="text-sm font-medium text-slate-800">{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
