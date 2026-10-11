import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Modal from "../ui/Modal";

interface Props {
  name: string;
  login: string; // the mobile number or email they log in with
  password: string;
  kind: "created" | "reset";
  onClose: () => void;
}

// Shows a temporary password exactly once. It lives only in this window's memory:
// it is never saved, and closing the window loses it for good.
export default function PasswordRevealModal({ name, login, password, kind, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function handleCopy() {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(`Login: ${login}\nPassword: ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    // "busy" stops Escape and a click outside from closing this by accident
    <Modal title={kind === "created" ? "Staff member added" : "Password reset"} onClose={onClose} busy>
      <div className="space-y-5">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-leo-100 text-leo-700">
            <KeyRound className="h-7 w-7" />
          </span>
          <p className="mt-3 text-sm text-gray-600">
            {kind === "created" ? "Give these login details to" : "New login details for"} <strong className="text-gray-900">{name}</strong>
          </p>
        </div>

        <dl className="space-y-3 rounded-xl bg-gray-50 px-4 py-4">
          <div>
            <dt className="text-xs text-gray-500">Login (mobile number or email)</dt>
            <dd className="break-all font-semibold text-gray-900">{login}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Temporary password</dt>
            <dd className="select-all break-all font-mono text-2xl font-bold tracking-wider text-leo-700">{password}</dd>
          </div>
        </dl>

        <Alert variant="info">
          This password is shown <strong>only once</strong>. Copy it now. If it is lost, use <strong>Reset password</strong>{" "}
          to make a new one.
        </Alert>

        {copyFailed && (
          <p role="alert" className="text-sm text-red-600">
            The browser did not allow copying. Select the password above and copy it yourself.
          </p>
        )}

        <p className="text-xs text-gray-500">
          {kind === "reset" ? "They were logged out of every device, and their old password no longer works. " : ""}
          This password stays valid until you reset it again. A way for staff to choose their own password arrives with
          Settings in Phase 13.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => void handleCopy()}>
            {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            {copied ? "Copied" : "Copy login details"}
          </Button>
          <Button onClick={onClose}>I have saved it</Button>
        </div>
      </div>
    </Modal>
  );
}
