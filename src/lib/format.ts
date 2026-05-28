const phpFmt = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

export function php(n: number | null | undefined): string {
  return phpFmt.format(Number(n ?? 0));
}

export function km(n: number | null | undefined, digits = 1): string {
  return `${Number(n ?? 0).toFixed(digits)} km`;
}

export function liters(n: number | null | undefined, digits = 2): string {
  return `${Number(n ?? 0).toFixed(digits)} L`;
}
