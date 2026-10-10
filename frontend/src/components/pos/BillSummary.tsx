import type { Bill } from "../../utils/billing";
import { formatRupees } from "../../utils/money";

interface Props {
  bill: Bill | null;
  showDelivery: boolean;
}

export default function BillSummary({ bill, showDelivery }: Props) {
  const value = (paise: number | undefined) => formatRupees(paise ?? 0);

  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-gray-600">Subtotal</dt>
        <dd className="font-medium text-gray-900">{value(bill?.subtotalPaise)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-gray-600">Discount</dt>
        <dd className="font-medium text-leo-700">
          {bill && bill.discountPaise > 0 ? `-${formatRupees(bill.discountPaise)}` : value(0)}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-gray-600">GST</dt>
        <dd className="font-medium text-gray-900">{value(bill?.taxPaise)}</dd>
      </div>
      {showDelivery && (
        <div className="flex justify-between">
          <dt className="text-gray-600">Delivery charge</dt>
          <dd className="font-medium text-gray-900">{value(bill?.deliveryChargePaise)}</dd>
        </div>
      )}
      <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
        <dt className="text-base font-semibold text-gray-900">Grand Total</dt>
        <dd className="text-2xl font-bold text-leo-700">{value(bill?.grandTotalPaise)}</dd>
      </div>
    </dl>
  );
}
