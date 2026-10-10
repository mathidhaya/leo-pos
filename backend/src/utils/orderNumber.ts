// 123 -> "#000123"
export function formatOrderNo(orderNo: number): string {
  return `#${String(orderNo).padStart(6, "0")}`;
}
