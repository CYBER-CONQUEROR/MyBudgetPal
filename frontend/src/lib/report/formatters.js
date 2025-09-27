import dayjs from "dayjs";

export function centsToLKR(amountCents) {
  const v = (amountCents || 0) / 100;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(iso) {
  if (!iso) return "";
  return dayjs(iso).format("YYYY-MM-DD");
}

/**
 * Project a row to only selected columns and map labels
 */
export function projectRow(row, columns) {
  const out = {};
  for (const c of columns) {
    switch (c.key) {
      case "date": out[c.label] = formatDate(row.paidAt || row.dueDate || row.date); break;
      case "name": out[c.label] = row.name || row.title || ""; break;
      case "accountName": out[c.label] = row.accountName || row.account?.name || ""; break;
      case "category": out[c.label] = row.categoryName || row.category || ""; break;
      case "amountCents": out[c.label] = centsToLKR(row.amountCents); break;
      case "status": out[c.label] = row.status || ""; break;
      case "note": out[c.label] = row.note || ""; break;
      default: out[c.label] = row[c.key] ?? "";
    }
  }
  return out;
}
