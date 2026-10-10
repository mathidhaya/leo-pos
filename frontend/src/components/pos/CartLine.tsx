import { Trash2 } from "lucide-react";
import type { PosProduct } from "../../types/pos";
import type { BillLine } from "../../utils/billing";
import { formatRupees, formatRupeesText } from "../../utils/money";
import QuantityStepper from "./QuantityStepper";

interface Props {
  product: PosProduct;
  quantity: number;
  max: number;
  line: BillLine | undefined;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}

export default function CartLine({ product, quantity, max, line, onQuantity, onRemove }: Props) {
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{product.name}</p>
          <p className="text-xs text-gray-500">
            {formatRupeesText(product.sellingPrice)} each &middot; GST {Number(product.gstPercent)}%
          </p>
        </div>
        <p className="shrink-0 font-semibold text-gray-900">{line ? formatRupees(line.totalPaise) : "-"}</p>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <QuantityStepper name={product.name} value={quantity} max={max} onChange={onQuantity} />
        <div className="flex items-center gap-3">
          {line && line.discountPaise > 0 && (
            <span className="text-xs font-medium text-leo-700">Discount -{formatRupees(line.discountPaise)}</span>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${product.name}`}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </li>
  );
}
