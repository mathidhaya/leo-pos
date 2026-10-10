import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck } from "lucide-react";
import { formatOrderNo } from "../../utils/format";
import { formatRupeesText } from "../../utils/money";
import PaymentModal from "../payments/PaymentModal";
import Button from "../ui/Button";
import Modal from "../ui/Modal";

interface Props {
  orderId: string;
  orderNo: number;
  total: string;
  onClose: () => void;
}

export default function OrderPlacedModal({ orderId, orderNo, total, onClose }: Props) {
  const [paying, setPaying] = useState(false);

  // Cancelling the payment returns here, the order stays saved as Unpaid. Finishing it closes everything.
  if (paying) {
    return (
      <PaymentModal
        order={{ id: orderId, orderNo, total }}
        onClose={() => setPaying(false)}
        onDone={onClose}
      />
    );
  }

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
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          <Link
            to="/orders"
            className="inline-flex h-12 items-center justify-center rounded-xl border border-gray-300 bg-white px-5 text-base font-semibold text-gray-800 hover:bg-gray-50"
          >
            View orders
          </Link>
          <Button variant="secondary" onClick={onClose}>
            Pay later
          </Button>
          <Button onClick={() => setPaying(true)} autoFocus>
            Take payment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
