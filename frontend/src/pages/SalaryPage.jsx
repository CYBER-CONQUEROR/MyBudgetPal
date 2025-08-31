import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Button, Card, CardContent, Divider, Stack, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  IconButton, Tooltip
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import axios from "axios";

const API = "http://localhost:4000";               // backend port
const defaultHeaders = { "x-user-id": "u_demo_1" };// optional fake user header

// --- utils
const fmtMoney = (n) => Number(n || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function IncomePageMinimal() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ date: todayISO(), source: "", amount: "" });

  // load from backend
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API}/api/incomes`, { headers: defaultHeaders });
        console.log("✅ GET incomes:", res.data);

        // 👇 ensure we always set an array
        const data = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.incomes)
          ? res.data.incomes
          : [];
        setRows(data);
      } catch (e) {
        console.error("❌ GET incomes failed:", e.response?.data || e.message);
        setError(e.message || "Failed to load incomes");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // robust total calc
  const total = useMemo(() => {
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((s, r) => s + Number(r?.amount || 0), 0);
  }, [rows]);

  const handleAdd = () => {
    setEditing(null);
    setForm({ date: todayISO(), source: "", amount: "" });
    setOpen(true);
  };

  const handleEdit = (row) => {
    setEditing(row);
    setForm({ date: row.date, source: row.source, amount: row.amount });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    const rowId = id; // already normalized
    const prev = rows;
    setRows((p) => (Array.isArray(p) ? p.filter((r) => (r.id || r._id) !== rowId) : []));
    try {
      await axios.delete(`${API}/api/incomes/${rowId}`, { headers: defaultHeaders });
      console.log("🗑️ deleted", rowId);
    } catch (e) {
      console.error("❌ delete failed:", e.response?.data || e.message);
      setRows(prev); // rollback
    }
  };

  const save = async () => {
    const payload = {
      date: form.date,
      source: form.source,
      amount: Number(form.amount),
    };
    if (!payload.date || !payload.source || isNaN(payload.amount)) {
      console.warn("Invalid form submission:", payload);
      return;
    }

    try {
      if (editing) {
        // UPDATE
        const id = editing.id || editing._id; // tolerate either shape
        const res = await axios.put(`${API}/api/incomes/${id}`, payload, { headers: defaultHeaders });
        const updated = res.data;
        setRows((prev) =>
          (Array.isArray(prev) ? prev : []).map((r) =>
            (r.id || r._id) === (updated.id || updated._id) ? updated : r
          )
        );
        console.log("✏️ Updated on backend:", updated);
      } else {
        // CREATE
        const res = await axios.post(`${API}/api/incomes`, payload, { headers: defaultHeaders });
        const created = res.data;
        setRows((prev) => [...(Array.isArray(prev) ? prev : []), created]);
        console.log("✅ Created on backend:", created);
      }
    } catch (err) {
      console.error("❌ Save failed:", err.response?.data || err.message);
    }

    setOpen(false);
    setEditing(null);
    setForm({ date: todayISO(), source: "", amount: "" });
  };

  // Simple loading / error states
  if (loading) return <Typography sx={{ p: 2 }}>Loading incomes…</Typography>;
  if (error) return <Typography color="error" sx={{ p: 2 }}>{error}</Typography>;

  return (
    <Box sx={{ p: { xs: 0, md: 0 } }}>
      {/* Page header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>Income</Typography>
        <Button onClick={handleAdd} variant="contained" startIcon={<AddIcon />} sx={{ textTransform: "none", borderRadius: 2 }}>
          Add New Income
        </Button>
      </Stack>

      {/* Total card */}
      <Card variant="outlined" sx={{ mb: 3, borderRadius: 3, borderColor: "#E5E7EB", background: "white" }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ color: "#6B7280", mb: 1 }}>Total Income</Typography>
          <Typography variant="h3" sx={{ fontWeight: 800 }}>${fmtMoney(total)}</Typography>
        </CardContent>
      </Card>

      {/* Table card */}
      <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "#E5E7EB", background: "white" }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Income Entries</Typography>
          </Box>
          <Divider />
          <TableContainer component={Paper} elevation={0}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: "#F9FAFB" }}>
                  <TableCell sx={{ fontWeight: 700, color: "#6B7280" }}>DATE</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "#6B7280" }}>SOURCE</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "#6B7280" }}>AMOUNT</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: "#6B7280" }}>ACTIONS</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(Array.isArray(rows) ? rows : []).map((r) => {
                  const id = r.id || r._id; // be flexible
                  return (
                    <TableRow key={id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell><Typography component="span" sx={{ fontWeight: 700 }}>{r.source}</Typography></TableCell>
                      <TableCell>${fmtMoney(r.amount)}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Edit">
                            <IconButton size="small" color="primary" onClick={() => handleEdit(r)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleDelete(id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 700 }}>TOTAL</TableCell>
                  <TableCell sx={{ fontWeight: 800 }}>${fmtMoney(total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={open} onClose={() => { setOpen(false); setEditing(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit Income" : "Add New Income"}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.25 }}>
            <Grid item xs={12} sm={6}>
              <TextField label="Date" type="date" fullWidth value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField label="Source" fullWidth placeholder="Salary / Freelance / Bonus" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Amount" type="number" fullWidth value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
          <Button variant="contained" onClick={save} sx={{ textTransform: "none" }}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
