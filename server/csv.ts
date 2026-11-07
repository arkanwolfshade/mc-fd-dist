export type CsvValue = string | number | boolean | null;

// A leading = + - @ tab or carriage return makes spreadsheets treat text as a
// formula. Free text comes from the "Other" field, so it must not be trusted.
const FORMULA_START = /^[=+\-@\t\r]/;

function field(value: CsvValue): string {
  if (value === null) return "";
  if (typeof value !== "string") return String(value);

  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [header, ...rows].map((row) => `${row.map(field).join(",")}\r\n`).join("");
}
