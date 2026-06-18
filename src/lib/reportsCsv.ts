function csvEscape(s: string | number | null | undefined): string {
  const v = s == null ? "" : String(s);
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replaceAll('"', '""')}"`;
  }
  return v;
}

export function downloadReportCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
