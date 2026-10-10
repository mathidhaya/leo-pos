const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// 15050 paise -> "₹150.50"
export function formatRupees(paise: number): string {
  return rupees.format(paise / 100);
}

// "150.50" (as sent by the server) -> "₹150.50"
export function formatRupeesText(value: string): string {
  const n = Number(value);
  return rupees.format(Number.isFinite(n) ? n : 0);
}
