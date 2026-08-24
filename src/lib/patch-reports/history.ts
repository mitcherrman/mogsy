import type { HistoricalNormalizedValue } from "./api";

function decimalPercent(value: string): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const decimalPlaces = fraction.length - 2;
  let result: string;
  if (decimalPlaces <= 0) result = `${digits}${"0".repeat(-decimalPlaces)}`;
  else if (digits.length <= decimalPlaces) {
    result = `0.${"0".repeat(decimalPlaces - digits.length)}${digits}`;
  } else {
    result = `${digits.slice(0, -decimalPlaces)}.${digits.slice(-decimalPlaces)}`;
  }
  if (result.includes(".")) result = result.replace(/0+$/, "").replace(/\.$/, "");
  return `${negative ? "-" : ""}${result}%`;
}

export function formatHistoricalValue(value?: HistoricalNormalizedValue | null): string | null {
  if (!value?.values?.length) return null;
  const values = value.unit === "ratio"
    ? value.values.map(decimalPercent)
    : value.values;
  return values.length > 1 ? `[${values.join(" / ")}]` : values[0];
}
