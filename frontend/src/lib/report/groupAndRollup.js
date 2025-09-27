import dayjs from "dayjs";

function groupKey(row, by) {
  if (by === "account") return row.accountName || row.account?.name || "Unknown Account";
  if (by === "category") return row.categoryName || row.category || "Uncategorized";
  if (by === "month") {
    const d = row.paidAt || row.dueDate || row.date;
    return d ? dayjs(d).format("YYYY-MM") : "Unknown Month";
  }
  return "_all";
}

export function groupRows(rows, by) {
  if (by === "none") return [{ key: "_all", rows }];
  const map = new Map();
  for (const r of rows) {
    const k = groupKey(r, by);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return Array.from(map.entries()).map(([key, rs]) => ({ key, rows: rs }));
}

export function rollup(rows) {
  const count = rows.length;
  const sumCents = rows.reduce((acc, r) => acc + (r.amountCents || 0), 0);
  const avgCents = count ? Math.round(sumCents / count) : 0;
  return { count, sumCents, avgCents };
}
