import { useState, type ReactNode } from "react";
import { getErrorMessage } from "../../utils/errors";
import Alert from "./Alert";
import Button from "./Button";
import Modal from "./Modal";

interface Props {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

// "Are you sure?" box. The parent closes it when onConfirm finishes without an error.
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onCancel} busy={busy}>
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        <div className="text-sm text-gray-700">{message}</div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
