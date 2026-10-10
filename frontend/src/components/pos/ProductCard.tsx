import { Plus } from "lucide-react";
import type { PosProduct } from "../../types/pos";
import { formatRupeesText } from "../../utils/money";

interface Props {
  product: PosProduct;
  inCart: number;
  onAdd: () => void;
}

export default function ProductCard({ product, inCart, onAdd }: Props) {
  const { status, quantity } = product.stock;
  const out = status === "out";
  const label = out ? "Out of stock" : status === "low" ? `Only ${quantity} left` : "In stock";
  const labelStyle = out
    ? "bg-red-100 text-red-700"
    : status === "low"
      ? "bg-amber-100 text-amber-800"
      : "bg-leo-100 text-leo-700";

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={out}
      aria-label={`Add ${product.name}, ${formatRupeesText(product.sellingPrice)}`}
      className="relative flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leo-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {inCart > 0 && (
        <span className="absolute right-2 top-2 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-leo-600 px-2 text-sm font-bold text-white shadow">
          {inCart}
        </span>
      )}

      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex aspect-[4/3] w-full items-center justify-center bg-leo-100 text-4xl font-bold text-leo-700">
          {product.name.charAt(0).toUpperCase()}
        </span>
      )}

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 min-h-10 text-sm font-semibold text-gray-900">{product.name}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-leo-700">{formatRupeesText(product.sellingPrice)}</span>
          <span className="text-xs text-gray-500">GST {Number(product.gstPercent)}%</span>
        </div>
        <span className={`mt-1 inline-block self-start rounded-full px-2 py-0.5 text-xs font-medium ${labelStyle}`}>
          {label}
        </span>
        <span className="mt-2 flex h-10 items-center justify-center gap-1 rounded-xl bg-leo-600 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" />
          {out ? "Unavailable" : "Add"}
        </span>
      </div>
    </button>
  );
}
