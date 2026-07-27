/* eslint-disable */
/**
 * Tarea 3: demo-csv (ida y vuelta), rutas JSON, /api/agent y casos adversos.
 *   node test-data/e2e/run-flow.js
 */
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3000";
const DIR = __dirname;

function brief(tag, status, j) {
  const rep = j && j.report;
  const dg = j && j.diagnosis;
  console.log(
    `${tag} | http=${status} | success=${j && j.success} | mismatch=${
      j && j.providerMismatch ? j.providerMismatch.kind : "-"
    } | fmt=${dg ? dg.detectedFormat : "-"} | rows=${dg ? dg.usableRows + "/" + dg.totalDataRows : "-"} | days=${
      dg ? dg.distinctDays : "-"
    } | findings=${rep ? rep.findings.length : "-"} | cost=${rep ? rep.totalCostUSD : "-"} | sav=${
      rep ? rep.totalSavingsRange.conservative + "/" + rep.totalSavingsRange.moderate + "/" + rep.totalSavingsRange.optimistic : "-"
    }${j && j.error ? " | err=" + String(j.error).slice(0, 110) : ""}`
  );
}

async function postJson(tag, body) {
  const res = await fetch(BASE + "/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  brief(tag, res.status, j);
  return { status: res.status, j };
}

async function postFile(tag, file, lane, opts = {}) {
  const buf = fs.readFileSync(path.join(DIR, file));
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "text/csv" }), file);
  if (lane !== undefined && lane !== null) fd.append("provider", lane);
  const res = await fetch(BASE + "/api/analyze", { method: "POST", body: fd });
  const j = await res.json().catch(() => null);
  brief(tag, res.status, j);
  if (opts.dump && j) fs.writeFileSync(path.join(DIR, "out", opts.dump), JSON.stringify(j, null, 2));
  return { status: res.status, j };
}

(async () => {
  console.log("\n=== A. GET /api/demo-csv + ida y vuelta ===");
  for (const p of ["aws", "azure", "gcp", null]) {
    const url = BASE + "/api/demo-csv" + (p ? `?provider=${p}` : "");
    const res = await fetch(url);
    const txt = await res.text();
    const lines = txt.trim().split("\n");
    const headers = lines[0].split(",");
    console.log(
      `demo-csv provider=${p || "(ninguno)"} | http=${res.status} | ct=${res.headers.get("content-type")} | ` +
        `disp=${res.headers.get("content-disposition")} | filas=${lines.length - 1} | cols=${headers.length}`
    );
    console.log("  cabecera:", headers.join(","));
    const fname = `demo-${p || "multicloud"}.csv`;
    fs.writeFileSync(path.join(DIR, "out", fname), txt);

    // ida y vuelta por multipart en el carril correspondiente
    const buf = Buffer.from(txt, "utf-8");
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type: "text/csv" }), fname);
    fd.append("provider", p || "focus");
    const up = await fetch(BASE + "/api/analyze", { method: "POST", body: fd });
    const j = await up.json().catch(() => null);
    brief(`  roundtrip lane=${p || "focus"}`, up.status, j);
    if (j && j.success) {
      fs.writeFileSync(path.join(DIR, "out", `roundtrip-${p || "multicloud"}.json`), JSON.stringify(j, null, 2));
    }
    // y también en el carril focus (el CSV demo es FOCUS)
    if (p) {
      const fd2 = new FormData();
      fd2.append("file", new Blob([buf], { type: "text/csv" }), fname);
      fd2.append("provider", "focus");
      const up2 = await fetch(BASE + "/api/analyze", { method: "POST", body: fd2 });
      brief(`  roundtrip lane=focus`, up2.status, await up2.json().catch(() => null));
    }
  }

  console.log("\n=== B. Ruta JSON: csvContent y useDemo ===");
  for (const [file, lane] of [
    ["focus-aws-only.csv", "aws"],
    ["focus-azure-only.csv", "azure"],
    ["focus-gcp-only.csv", "gcp"],
    ["focus-multicloud.csv", "focus"],
  ]) {
    const csvContent = fs.readFileSync(path.join(DIR, file), "utf-8");
    await postJson(`csvContent ${file} lane=${lane}`, { csvContent, provider: lane });
  }
  await postJson("csvContent basura lane=aws", {
    csvContent: fs.readFileSync(path.join(DIR, "basura-no-facturacion.csv"), "utf-8"),
    provider: "aws",
  });
  for (const p of ["aws", "azure", "gcp"]) {
    await postJson(`useDemo provider=${p}`, { useDemo: true, provider: p });
  }
  await postJson("useDemo sin provider", { useDemo: true });

  console.log("\n=== C. Casos adversos ===");
  await postFile("vacio lane=aws", "adverso-vacio.csv", "aws");
  await postFile("solo-cabecera lane=aws", "adverso-solo-cabecera.csv", "aws");
  await postFile("solo-cabecera lane=focus", "adverso-solo-cabecera.csv", "focus");
  await postFile("coste-negativo lane=aws", "adverso-coste-negativo.csv", "aws", { dump: "adverso-negativo.json" });
  await postFile("fechas-desordenadas lane=aws", "adverso-fechas-desordenadas.csv", "aws", { dump: "adverso-desorden.json" });
  await postFile("un-solo-dia lane=aws", "adverso-un-solo-dia.csv", "aws", { dump: "adverso-un-dia.json" });
  await postFile("provider=oracle (invalido)", "focus-azure-only.csv", "oracle");
  await postFile("provider=oracle con CUR aws", "aws-cur-nativo.csv", "oracle");
  await postFile("sin campo provider (focus multinube)", "focus-multicloud.csv", null);
  await postFile("sin campo provider (CUR aws)", "aws-cur-nativo.csv", null);
  await postFile("sin campo provider (basura)", "basura-no-facturacion.csv", null);

  // sin archivo, y body vacio
  const fdEmpty = new FormData();
  fdEmpty.append("provider", "aws");
  const r1 = await fetch(BASE + "/api/analyze", { method: "POST", body: fdEmpty });
  brief("multipart sin campo file", r1.status, await r1.json().catch(() => null));
  await postJson("JSON vacio {}", {});

  console.log("\n=== D. POST /api/agent ===");
  for (const q of [
    "¿Cómo puedo reducir el coste de mis NAT Gateway en AWS?",
    "¿Dónde nació Lionel Messi?",
  ]) {
    const res = await fetch(BASE + "/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "e2e-test-session", message: q, useDemo: true, provider: "aws" }),
    });
    const txt = await res.text();
    console.log(`agent "${q.slice(0, 45)}..." | http=${res.status} | body=${txt.slice(0, 400).replace(/\n/g, " ")}`);
  }
})();
