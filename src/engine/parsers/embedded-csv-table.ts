import Papa from "papaparse";

export interface EmbeddedCsvTable {
  csv: string;
  headers: string[];
  metadata: Record<string, string>;
  headerRowIndex: number;
}

function normalizeCell(value: unknown): string {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

/**
 * Console billing downloads can prepend report/invoice metadata before the
 * actual CSV table (GCP Cost table and Reports do this). This keeps that
 * metadata available while presenting a conventional header-first CSV to the
 * provider parser.
 */
export function extractEmbeddedCsvTable(
  csvContent: string,
  isHeaderRow: (headers: string[]) => boolean
): EmbeddedCsvTable {
  const parsed = Papa.parse<string[]>(csvContent, {
    header: false,
    skipEmptyLines: false,
  });
  const rows = (parsed.data || []).map((row) => row.map(normalizeCell));
  const headerRowIndex = rows.findIndex((row, index) =>
    index < 40 && row.length > 1 && isHeaderRow(row)
  );

  if (headerRowIndex <= 0) {
    const firstNonEmpty = rows.find((row) => row.some(Boolean)) || [];
    return {
      csv: csvContent,
      headers: firstNonEmpty,
      metadata: {},
      headerRowIndex: Math.max(0, headerRowIndex),
    };
  }

  const metadata: Record<string, string> = {};
  for (const row of rows.slice(0, headerRowIndex)) {
    const key = normalizeCell(row[0]).toLowerCase();
    const value = normalizeCell(row.slice(1).find(Boolean));
    if (key && value) metadata[key] = value;
  }

  return {
    csv: Papa.unparse(rows.slice(headerRowIndex)),
    headers: rows[headerRowIndex],
    metadata,
    headerRowIndex,
  };
}

export function metadataDate(metadata: Record<string, string>): string | undefined {
  const preferredKeys = [
    "start date",
    "fecha de inicio",
    "invoice date",
    "fecha de factura",
    "invoice month",
    "mes de factura",
    "billing period",
    "periodo de facturación",
    "date range",
    "intervalo de fechas",
  ];
  const candidates = [
    ...preferredKeys.map((key) => metadata[key]).filter(Boolean),
    ...Object.values(metadata),
  ];

  for (const value of candidates) {
    const iso = value.match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const month = value.match(/\b(20\d{2})[-/](\d{2})\b/);
    if (month) return `${month[1]}-${month[2]}-01`;
    const compact = value.match(/\b(20\d{2})(\d{2})\b/);
    if (compact) return `${compact[1]}-${compact[2]}-01`;
  }
  return undefined;
}
