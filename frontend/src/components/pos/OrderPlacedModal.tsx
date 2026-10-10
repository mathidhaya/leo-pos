import { Link } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import { formatOrderNo } from "../../utils/format";
import { formatRupeesText } from "../../utils/money";
import Button from "../ui/Button";
import Modal from "../ui/Modal";

interface Props {
  orderNo: number;
  total: string;
  onClose: () => void;
}

export default function OrderPlacedModal({ orderNo, total, onClose }: Props) {
  return (
    <Modal title="Order placed" onClose={onClose}>
      <div className="space-y-5 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-leo-100 text-leo-700">
          <CircleCheck className="h-9 w-9" />
        </span>
        <div>
          <p className="text-3xl font-bold text-gray-900">{formatOrderNo(orderNo)}</p>
          <p className="mt-1 text-lg font-semibold text-leo-700">{formatRupeesText(total)}</p>
          <p className="mt-2 text-sm text-gray-600">Saved as Pending and Unpaid. Stock has been updated.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/orders"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-gray-300 bg-white px-5 text-base font-semibold text-gray-800 hover:bg-gray-50"
          >
            View orders
          </Link>
          <Button onClick={onClose} autoFocus>
            New order
          </Button>
        </div>
      </div>
    </Modal>
  );
}
