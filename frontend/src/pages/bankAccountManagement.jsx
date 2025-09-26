import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  PencilLine,
  Archive,
  Search,
  Building2,
  ChevronDown,
  Trash2,
  ArrowRightLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CreditCard,
  Wallet,
  Eye,
} from "lucide-react";

/**
 * AccountsPage
 * - Server mount: app.use("/api/accounts", accountRoutes)
 * - UI can create/edit: bank or card only (NO cash create)
 * - Create form includes Opening Balance (LKR) -> openingBalanceCents
 * - Shows current balance on cards & details modal
 * - Transfer (any→any), Deposit (Cash→Bank), Withdraw (Bank→Cash)
 * - Archive / Unarchive / Delete wired
 * - Cash wallet: view-only (no Edit/Archive/Delete)
 *
 * Props:
 *   API?: origin like "http://localhost:4000" (default)
 *   headers?: object (e.g. { "x-user-id": "...", Authorization: "Bearer ..." })
 */
export default function AccountsPage({
  API = "http://localhost:4000",
  headers = { "x-user-id": "000000000000000000000001" }, // demo default
}) {
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

  const url = (suffix = "") => `${API}/api/accounts${suffix}`;

  // Sri Lanka institutions (editable)
  const banksLK = [
    "Bank of Ceylon (BOC)",
    "People's Bank",
    "National Savings Bank (NSB)",
    "Commercial Bank of Ceylon",
    "Hatton National Bank (HNB)",
    "Sampath Bank",
    "Seylan Bank",
    "DFCC Bank",
    "Nations Trust Bank",
    "NDB Bank (National Development Bank)",
    "Pan Asia Bank",
    "Union Bank of Colombo",
    "Cargills Bank",
    "Amãna Bank",
    "HSBC Sri Lanka",
    "Standard Chartered Sri Lanka",
    "Citibank Sri Lanka",
    "State Bank of India - Sri Lanka",
    "Indian Bank - Sri Lanka",
    "Indian Overseas Bank - Sri Lanka",
    "Habib Bank Ltd (HBL)",
    "MCB Bank",
    "Public Bank Berhad - Sri Lanka",
    "Other",
  ];

  // Fetch helper
  const request = async (fullUrl, opts = {}) => {
    const res = await fetch(fullUrl, {
      ...opts,
      headers: { "Content-Type": "application/json", ...headers },
    });
    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text || null;
    }
    if (!res.ok) {
      const msg =
        (payload && (payload.detail || payload.message)) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return payload ?? {};
  };

  // Load
  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const qs = `?includeArchived=${showArchived ? "true" : "false"}`;
      const data = await request(url(`${qs}`));
      setAccounts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API, showArchived]);

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
  const onCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const onEdit = (acc) => {
    setEditing(acc);
    setModalOpen(true);
  };
  const onAskArchive = (acc) => {
    setToArchive(acc);
    setConfirmOpen(true);
  };
  const onAskDelete = (acc) => {
    setToDelete(acc);
    setConfirmDeleteOpen(true);
  };

  const onView = async (acc) => {
    try {
      const data = await request(url(`/${acc._id}`));
      setDetails(data);
    } catch (e) {
      alert(e.message || "Failed to load details");
    }
  };

  const handleSave = async (payload, id) => {
    try {
      if (id) {
        await request(url(`/${id}`), {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await request(url(), {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      alert(e.message || "Save failed");
    }
  };

  const handleArchive = async (id) => {
    try {
      await request(url(`/${id}/archive`), { method: "POST" });
      setConfirmOpen(false);
      setToArchive(null);
      await load();
    } catch (e) {
      alert(e.message || "Archive failed");
    }
  };

  const handleUnarchive = async (id) => {
    try {
      await request(url(`/${id}/unarchive`), { method: "POST" });
      await load();
    } catch (e) {
      alert(e.message || "Unarchive failed");
    }
  };

  const handleDelete = async (id) => {
    try {
      await request(url(`/${id}`), { method: "DELETE" });
      setConfirmDeleteOpen(false);
      setToDelete(null);
      await load();
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  };

  // Money movement
  const handleTransfer = async (fromId, toId, amountCents) => {
    try {
      await request(url(`/transfer`), {
        method: "POST",
        body: JSON.stringify({
          fromAccountId: fromId,
          toAccountId: toId,
          amountCents,
        }),
      });
      await load();
    } catch (e) {
      alert(e.message || "Transfer failed");
    }
  };

  const handleDeposit = async (bankId, amountCents) => {
    try {
      await request(url(`/${bankId}/deposit`), {
        method: "POST",
        body: JSON.stringify({ amountCents }),
      });
      await load();
    } catch (e) {
      alert(e.message || "Deposit failed (ensure Cash wallet exists)");
    }
  };

  const handleWithdraw = async (bankId, amountCents) => {
    try {
      await request(url(`/${bankId}/withdraw`), {
        method: "POST",
        body: JSON.stringify({ amountCents }),
      });
      await load();
    } catch (e) {
      alert(e.message || "Withdraw failed (ensure Cash wallet exists)");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
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
            <button
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 text-sm font-semibold shadow hover:opacity-95 active:scale-[.99]"
            >
              <Plus size={18} /> Add Account
            </button>
            <button
              onClick={() => setAction({ type: "transfer" })}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white px-4 py-2 text-sm font-semibold shadow hover:opacity-95 active:scale-[.99]"
            >
              <ArrowRightLeft size={18} /> Transfer
            </button>
            <button
              onClick={() => setAction({ type: "deposit" })}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2 text-sm font-semibold shadow hover:opacity-95 active:scale-[.99]"
            >
              <ArrowDownCircle size={18} /> Deposit
            </button>
            <button
              onClick={() => setAction({ type: "withdraw" })}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white px-4 py-2 text-sm font-semibold shadow hover:opacity-95 active:scale-[.99]"
            >
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
                className="appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option>All Types</option>
                <option value="bank">Bank</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>

            <div className="relative">
              <select
                value={instFilter}
                onChange={(e) => setInstFilter(e.target.value)}
                className="appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option>All Institutions</option>
                {Array.from(new Set([...banksLK, ...institutionsInData])).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>

            <label className="flex items-center gap-2 select-none">
              <span className="text-sm text-slate-600">Show archived</span>
              <button
                type="button"
                onClick={() => setShowArchived((s) => !s)}
                className={`h-6 w-11 rounded-full p-[2px] transition ${
                  showArchived ? "bg-blue-600" : "bg-slate-300"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transition ${
                    showArchived ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          </div>
        </div>

        {/* Content */}
        <div className="mt-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}{" "}
              <button onClick={load} className="ml-2 underline">
                Retry
              </button>
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
                  onArchive={() => onAskArchive(a)}
                  onUnarchive={() => handleUnarchive(a._id)}
                  onDelete={() => onAskDelete(a)}
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
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
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
          onCancel={() => {
            setConfirmOpen(false);
            setToArchive(null);
          }}
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
          onCancel={() => {
            setConfirmDeleteOpen(false);
            setToDelete(null);
          }}
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

/* ---------- helpers ---------- */
const fmtLKR = (cents) => {
  const rupees = Number(cents || 0) / 100;
  return `LKR ${rupees.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

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

/* ---------- cards & states ---------- */
function AccountCard({ account, onView, onEdit, onArchive, onUnarchive, onDelete }) {
  const { name, institution, numberMasked, currency = "LKR", type, archived, balanceCents, creditLimitCents } =
    account || {};
  const isCash = type === "cash";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 hover:shadow-md hover:-translate-y-[2px] transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 text-blue-700 p-2 border border-blue-100">
            <Building2 size={18} />
          </div>
          <div>
            <div className="text-base font-semibold leading-tight">{name || "Unnamed"}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <TypeChip type={type} />
              {institution && <Tag>{institution}</Tag>}
              <Tag>{currency}</Tag>
              {numberMasked ? (
                <span className="tracking-widest">{numberMasked}</span>
              ) : (
                <span className="italic text-slate-400">No mask</span>
              )}
            </div>
          </div>
        </div>
        <StatusPill archived={archived} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">Current Balance</div>
          <div className="text-lg font-semibold">{fmtLKR(balanceCents)}</div>
          {type === "card" && creditLimitCents != null && (
            <div className="mt-1 text-xs text-slate-600">
              Credit Limit: <span className="font-medium">{fmtLKR(creditLimitCents)}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onView}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            <Eye size={16} /> View
          </button>

          {!isCash && (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <PencilLine size={16} /> Edit
            </button>
          )}

          {!isCash ? (
            !archived ? (
              <button
                onClick={onArchive}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
              >
                <Archive size={16} /> Archive
              </button>
            ) : (
              <>
                <button
                  onClick={onUnarchive}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50"
                >
                  <Archive size={16} /> Unarchive
                </button>
                <button
                  onClick={onDelete}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                >
                  <Trash2 size={16} /> Delete
                </button>
              </>
            )
          ) : null}
        </div>
      </div>
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

// Create / Edit (create shows Opening Balance)
function AccountFormModal({ banks, initial, onClose, onSave }) {
  const isEdit = !!initial;
  const [type, setType] = useState(initial?.type || "bank");
  const [name, setName] = useState(initial?.name || "");
  const [institution, setInstitution] = useState(initial?.institution || "");
  const [numberMasked, setNumberMasked] = useState(initial?.numberMasked || "");
  const [creditLimit, setCreditLimit] = useState(
    initial?.creditLimitCents != null ? (initial.creditLimitCents / 100).toFixed(2) : ""
  );
  const [openingBalance, setOpeningBalance] = useState("0.00");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");

    let cl = undefined;
    if (type === "card") {
      const raw = (creditLimit || "").toString().trim();
      if (!raw && !isEdit) {
        setErr("Credit limit is required for card accounts");
        return;
      }
      if (raw) {
        const cents = Math.round(Number(raw) * 100);
        if (!Number.isFinite(cents) || cents < 0) {
          setErr("Credit limit must be a non-negative number");
          return;
        }
        cl = cents;
      }
    }

    const payload = {
      type,
      name: name.trim(),
      institution: institution || undefined,
      numberMasked: numberMasked || undefined,
      currency: "LKR",
      ...(type === "card" ? { creditLimitCents: cl } : { creditLimitCents: undefined }),
      ...(!isEdit
        ? (() => {
            const ob = Math.round(Number((openingBalance || "0").toString()) * 100);
            if (!Number.isFinite(ob) || ob < 0) {
              setErr("Opening balance must be a non-negative number");
              return {};
            }
            return { openingBalanceCents: ob };
          })()
        : {}),
    };

    if (!payload.name) {
      setErr("Name is required");
      return;
    }

    try {
      setSaving(true);
      await onSave(payload, initial?._id);
    } catch (e) {
      setErr(e.message || "Save failed");
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
                disabled={isEdit} // type is immutable server-side
                className="mt-1 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:bg-slate-50"
              >
                <option value="bank">Bank</option>
                <option value="card">Card</option>
                {/* No 'cash' option here */}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Name<span className="text-rose-600"> *</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === "card" ? "Visa Main" : "HNB Salary"}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
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
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Masked Number</label>
              <input
                value={numberMasked}
                onChange={(e) => setNumberMasked(e.target.value)}
                placeholder="e.g., ****1234"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
              <p className="mt-1 text-xs text-slate-500">Only last digits. Never store full numbers.</p>
            </div>
          </div>

          {type === "card" && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Credit Limit (LKR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
            </div>
          )}

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Opening Balance (LKR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
              <p className="mt-1 text-xs text-slate-500">
                Server stores cents; current balance initializes to this value.
              </p>
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
              disabled={saving}
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

// Transfer / Deposit / Withdraw
function MoneyActionModal({ type, accounts, onClose, onConfirm }) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState("");

  const active = accounts.filter((a) => !a.archived);
  const banks = active.filter((a) => a.type === "bank");
  const titleMap = {
    transfer: "Transfer between accounts",
    deposit: "Deposit (Cash → Bank)",
    withdraw: "Withdraw (Bank → Cash)",
  };

  const submit = (e) => {
    e.preventDefault();
    const cents = Math.round(Number((amount || "0").toString()) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setErr("Enter a valid amount");

    if (type === "transfer") {
      if (!fromId || !toId || fromId === toId) return setErr("Pick two different accounts");
      setErr("");
      onConfirm(fromId, toId, cents);
      onClose();
      return;
    }
    if (type === "deposit") {
      if (!toId) return setErr("Pick a bank account to deposit into");
      setErr("");
      onConfirm(toId, cents);
      onClose();
      return;
    }
    if (type === "withdraw") {
      if (!toId) return setErr("Pick the bank account to withdraw from");
      setErr("");
      onConfirm(toId, cents);
      onClose();
      return;
    }
  };

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
                  {active.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">To account</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  <option value="">Select</option>
                  {active.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
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
              <p className="text-xs text-slate-500 mt-1">
                Moves money from your Cash wallet into this bank.
              </p>
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
              <p className="text-xs text-slate-500 mt-1">
                Moves money from this bank into your Cash wallet.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm mb-1">Amount (LKR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-slate-200 p-2 focus:outline-none focus:ring-4 focus:ring-blue-200"
            />
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
