import * as store from "./store.js";

export async function list(req, res, next) {
  try {
    const items = await store.getAll(req.userId); // ← await
    console.log("➡️ GET /api/incomes", items);   // log plain array, not a Promise
    return res.json(items);                       // send once, then return
  } catch (err) {
    return next(err);
  }
}

export async function create(req, res, next) {
  try {
    const { date, source, amount } = req.body || {};
    if (!date || !source || amount === undefined) {
      return res.status(400).json({ error: "date, source, amount are required" });
    }
    const item = await store.add(req.userId, { date, source, amount: Number(amount) });
    console.log("➡️ POST /api/incomes", item);
    return res.status(201).json(item);
  } catch (err) {
    return next(err);
  }
}

export async function update(req, res, next) {
  try {
    const updated = await store.update(req.userId, req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Not found" });
    console.log("✏️ PUT /api/incomes/:id", updated);
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const ok = await store.remove(req.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    console.log("🗑️ DELETE /api/incomes/:id", req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}
