import type { TopProduct } from "../../types/dashboard";
import { formatMoney } from "../../utils/format";

export default function TopProducts({ products }: { products: TopProduct[] }) {
  if (products.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No sales in this period yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {products.map((product, index) => (
        <li key={product.id} className="flex items-center gap-3">
          <span className="w-5 text-sm font-semibold text-gray-400">{index + 1}</span>
          {product.imageUrl ? (
            <img src={product.imageUrl} alt="" className="h-11 w-11 rounded-xl object-cover" />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-leo-100 font-bold text-leo-700">
              {product.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{product.name}</p>
            <p className="text-xs text-gray-500">{product.quantity} sold</p>
          </div>
          <p className="text-sm font-semibold text-gray-900">{formatMoney(product.revenue)}</p>
        </li>
      ))}
    </ol>
  );
}
