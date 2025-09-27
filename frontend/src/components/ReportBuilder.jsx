import React, { useMemo, useState } from "react";
import { useReportBuilderState } from "./useReportBuilderState";
import { buildAndDownloadPDF } from "../lib/report/buildReport";

export default function ReportBuilder({ open, onClose, filteredRows = [], currentFilters = {}, brand = {} }) {
  const { config, setConfig, presets, savePreset, loadPreset, removePreset, enabledColumns } =
    useReportBuilderState(brand.title || "Commitments Report");

  const rowCount = filteredRows.length;
  const warnLarge = rowCount > 1500;

  const canGenerate = useMemo(() => enabledColumns.length > 0 && rowCount > 0, [enabledColumns, rowCount]);

  if (!open) return null;

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={{ margin: 0 }}>Create Report</h3>
          <button onClick={onClose} style={styles.btn}>✕</button>
        </div>

        <div style={styles.grid}>
          <section>
            <h4>Columns</h4>
            {config.columns.map((c, idx) => (
              <label key={c.key} style={styles.row}>
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => {
                    const next = [...config.columns];
                    next[idx] = { ...c, enabled: e.target.checked };
                    setConfig({ ...config, columns: next });
                  }}
                />
                <span style={{ marginLeft: 8 }}>{c.label}</span>
              </label>
            ))}
          </section>

          <section>
            <h4>Grouping</h4>
            <select
              value={config.grouping.by}
              onChange={(e) => setConfig({ ...config, grouping: { ...config.grouping, by: e.target.value } })}
              style={styles.select}
            >
              <option value="none">None</option>
              <option value="account">Account</option>
              <option value="category">Category</option>
              <option value="month">Month</option>
            </select>
            <label style={styles.row}>
              <input
                type="checkbox"
                checked={config.grouping.subtotal}
                onChange={(e) => setConfig({ ...config, grouping: { ...config.grouping, subtotal: e.target.checked } })}
              />
              <span style={{ marginLeft: 8 }}>Show subtotals</span>
            </label>

            <h4 style={{ marginTop: 16 }}>Metrics</h4>
            {["sum", "count", "avg"].map(k => (
              <label key={k} style={styles.row}>
                <input
                  type="checkbox"
                  checked={config.metrics[k]}
                  onChange={(e) => setConfig({ ...config, metrics: { ...config.metrics, [k]: e.target.checked } })}
                />
                <span style={{ marginLeft: 8 }}>{k.toUpperCase()}</span>
              </label>
            ))}
          </section>

          <section>
            <h4>Layout</h4>
            <div style={styles.row}>
              <label style={{ width: 100 }}>Page</label>
              <select
                value={config.layout.pageSize}
                onChange={(e) => setConfig({ ...config, layout: { ...config.layout, pageSize: e.target.value } })}
                style={styles.select}
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </div>
            <div style={styles.row}>
              <label style={{ width: 100 }}>Orientation</label>
              <select
                value={config.layout.orientation}
                onChange={(e) => setConfig({ ...config, layout: { ...config.layout, orientation: e.target.value } })}
                style={styles.select}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>
            <div style={styles.row}>
              <label style={{ width: 100 }}>Density</label>
              <select
                value={config.layout.density}
                onChange={(e) => setConfig({ ...config, layout: { ...config.layout, density: e.target.value } })}
                style={styles.select}
              >
                <option value="dense">Dense</option>
                <option value="roomy">Roomy</option>
              </select>
            </div>
            <label style={styles.row}>
              <input
                type="checkbox"
                checked={config.layout.zebra}
                onChange={(e) => setConfig({ ...config, layout: { ...config.layout, zebra: e.target.checked } })}
              />
              <span style={{ marginLeft: 8 }}>Zebra rows</span>
            </label>
          </section>

          <section>
            <h4>Branding</h4>
            <div style={styles.row}>
              <label style={{ width: 100 }}>Title</label>
              <input
                style={styles.input}
                value={config.title}
                onChange={(e) => setConfig({ ...config, title: e.target.value })}
              />
            </div>
            <div style={styles.row}>
              <label style={{ width: 100 }}>Subtitle</label>
              <input
                style={styles.input}
                value={config.subtitle}
                onChange={(e) => setConfig({ ...config, subtitle: e.target.value })}
              />
            </div>
            <div style={styles.row}>
              <label style={{ width: 100 }}>Watermark</label>
              <input
                style={styles.input}
                value={config.watermark}
                onChange={(e) => setConfig({ ...config, watermark: e.target.value })}
              />
            </div>

            <h4 style={{ marginTop: 16 }}>Presets</h4>
            <div style={styles.row}>
              <input id="presetName" placeholder="Preset name…" style={styles.input} />
              <button
                style={{ ...styles.btn, marginLeft: 8 }}
                onClick={() => {
                  const el = document.getElementById("presetName");
                  if (!el.value.trim()) return;
                  savePreset(el.value.trim()); el.value = "";
                }}
              >Save</button>
            </div>
            {presets.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {presets.map(p => (
                  <div key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                    <span>{p.name}</span>
                    <div>
                      <button style={styles.btn} onClick={() => loadPreset(p.name)}>Load</button>
                      <button style={{ ...styles.btn, marginLeft: 6 }} onClick={() => removePreset(p.name)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {warnLarge && (
          <div style={{ marginTop: 8, color: "#b35c00" }}>
            ⚠️ This report has {rowCount.toLocaleString()} rows. Generation may take a little while in the browser.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={styles.btn}>Cancel</button>
          <button
            disabled={!canGenerate}
            onClick={() => buildAndDownloadPDF({ rows: filteredRows, config, filters: currentFilters, brand })}
            style={{ ...styles.btn, marginLeft: 8, background: canGenerate ? "#111" : "#777", color: "#fff" }}
          >
            Generate PDF
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 9999,
  },
  modal: {
    width: 820, maxHeight: "86vh", overflow: "auto", background: "#fff",
    borderRadius: 12, padding: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.35)"
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 16,
    borderTop: "1px solid #eee",
    paddingTop: 12,
  },
  row: { display: "flex", alignItems: "center", margin: "6px 0" },
  input: { flex: 1, padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 },
  select: { padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8, width: "100%" },
  btn: { padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#f6f6f6", cursor: "pointer" },
};
