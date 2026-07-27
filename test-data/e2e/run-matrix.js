/* eslint-disable */
/**
 * Matriz de carriles: sube cada fixture a POST /api/analyze con cada carril.
 * Solo lee la app por HTTP; no modifica nada.
 *
 *   node test-data/e2e/run-matrix.js
 */
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const DIR = __dirname;
const LANES = ["aws", "azure", "gcp", "focus"];

const FILES = [
  "focus-multicloud.csv",
  "focus-aws-only.csv",
  "focus-azure-only.csv",
  "focus-gcp-only.csv",
  "aws-cur-nativo.csv",
  "azure-cost-management-nativo.csv",
  "gcp-billing-nativo.csv",
  "focus-con-compras-compromiso.csv",
  "focus-aws-only.xlsx",
  "basura-no-facturacion.csv",
];

async function upload(file, lane) {
  const buf = fs.readFileSync(path.join(DIR, file));
  const fd = new FormData();
  const type = file.endsWith(".xlsx")
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv";
  fd.append("file", new Blob([buf], { type }), file);
  if (lane) fd.append("provider", lane);
  const res = await fetch(BASE + "/api/analyze", { method: "POST", body: fd });
  let json = null;
  let text = null;
  try {
    json = await res.json();
  } catch (e) {
    text = "no-json";
  }
  return { status: res.status, json, text };
}

function summarize(file, lane, r) {
  const j = r.json || {};
  const rep = j.report;
  const dg = j.diagnosis;
  return {
    file,
    lane,
    http: r.status,
    success: j.success === true,
    mismatch: j.providerMismatch ? j.providerMismatch.kind : "",
    detected: j.providerMismatch ? (j.providerMismatch.detected || "") : (dg ? dg.detectedFormat : ""),
    detectedProviders: j.providerMismatch && j.providerMismatch.detectedProviders
      ? j.providerMismatch.detectedProviders.join("+") : "",
    usableRows: dg ? dg.usableRows : "",
    totalRows: dg ? dg.totalDataRows : "",
    days: dg ? dg.distinctDays : "",
    findings: rep ? rep.findings.length : "",
    totalCost: rep ? rep.totalCostUSD : "",
    savCons: rep ? rep.totalSavingsRange.conservative : "",
    savMod: rep ? rep.totalSavingsRange.moderate : "",
    savOpt: rep ? rep.totalSavingsRange.optimistic : "",
    error: j.error ? String(j.error).slice(0, 90) : "",
  };
}

(async () => {
  const rows = [];
  for (const file of FILES) {
    for (const lane of LANES) {
      const r = await upload(file, lane);
      const s = summarize(file, lane, r);
      rows.push(s);
      console.log(
        [s.file, s.lane, s.http, s.success, s.mismatch || "-", s.detected || "-",
         s.detectedProviders || "-", s.usableRows + "/" + s.totalRows, s.days,
         s.findings, s.totalCost, `${s.savCons}/${s.savMod}/${s.savOpt}`].join(" | ")
      );
      // guarda el informe completo del caso aceptado, para Tarea 4
      if (s.success) {
        fs.writeFileSync(
          path.join(DIR, "out", `${file.replace(/\W+/g, "_")}__${lane}.json`),
          JSON.stringify(r.json, null, 2)
        );
      }
    }
  }
  fs.writeFileSync(path.join(DIR, "out", "matrix.json"), JSON.stringify(rows, null, 2));
  console.log("\nTotal combinaciones:", rows.length);
})();
