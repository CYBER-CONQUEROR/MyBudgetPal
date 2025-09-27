export function makeReportFilename(prefix, filters, ts = new Date()) {
  const parts = [prefix || "Report"];
  if (filters?.accountId && filters?.accountName) parts.push(filters.accountName);
  if (filters?.from) parts.push(filters.from.slice(0,10));
  if (filters?.to) parts.push(filters.to.slice(0,10));
  parts.push(ts.toISOString().replace(/[:T]/g, '-').slice(0,15));
  return parts.filter(Boolean).join('_') + ".pdf";
}
