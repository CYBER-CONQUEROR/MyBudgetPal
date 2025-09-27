import { useEffect, useMemo, useState } from "react";

const DEFAULT_COLUMNS = [
  { key: "date", label: "Date", enabled: true },
  { key: "name", label: "Name", enabled: true },
  { key: "accountName", label: "Account", enabled: true },
  { key: "category", label: "Category", enabled: true },
  { key: "amountCents", label: "Amount", enabled: true },
  { key: "status", label: "Status", enabled: true },
  { key: "note", label: "Notes", enabled: false },
];

const DEFAULT_CONFIG = {
  columns: DEFAULT_COLUMNS,
  grouping: { by: "none", subtotal: true },
  metrics: { sum: true, count: true, avg: false },
  layout: { pageSize: "A4", orientation: "portrait", density: "dense", zebra: true },
  includeChart: false,
  title: "",
  subtitle: "",
  watermark: "",
  theme: "light",
};

const PRESETS_KEY = "mbp_report_presets_v1";

export function useReportBuilderState(initialTitle = "Commitments Report") {
  const [config, setConfig] = useState(() => ({
    ...DEFAULT_CONFIG,
    title: initialTitle,
  }));
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]"); } catch { return []; }
  });

  const enabledColumns = useMemo(
    () => config.columns.filter(c => c.enabled).map(c => c.key),
    [config.columns]
  );

  function savePreset(name) {
    const next = [...presets, { name, config }];
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  }

  function loadPreset(name) {
    const p = presets.find(x => x.name === name);
    if (p) setConfig(p.config);
  }

  function removePreset(name) {
    const next = presets.filter(x => x.name !== name);
    setPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  }

  return {
    config,
    setConfig,
    presets,
    savePreset,
    loadPreset,
    removePreset,
    enabledColumns,
  };
}
