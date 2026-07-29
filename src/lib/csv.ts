function escapeCSVValue(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/["\n,]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const lines = [
    headers.map(escapeCSVValue).join(","),
    ...rows.map((row) => row.map(escapeCSVValue).join(",")),
  ];
  return lines.join("\r\n");
}

export function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function todayForFilename(): string {
  return new Date().toISOString().slice(0, 10);
}
