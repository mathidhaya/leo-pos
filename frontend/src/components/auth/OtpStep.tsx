import { useState, type FormEvent } from "react";
import { sendOtp, verifyOtp } from "../../api/auth";
import { useCountdown } from "../../hooks/useCountdown";
import type { OtpPurpose } from "../../types/auth";
import { getErrorMessage } from "../../utils/errors";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import OtpInput from "../ui/OtpInput";

interface Props {
  identifier: string;
  purpose: OtpPurpose;
  onVerified: (verificationId: string) => void;
  onBack: () => void;
}

// Step 2 of Register and Forgot Password: enter the 4-digit OTP.
export default function OtpStep({ identifier, purpose, onVerified, onBack }: Props) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const { remaining, start } = useCountdown(30);

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (verifying) return;
    setNotice(null);

    if (!/^\d{4}$/.test(otp)) {
      setError("Enter the 4-digit OTP.");
      return;
    }

    setError(null);
    setVerifying(true);
    try {
      const verificationId = await verifyOtp(identifier, purpose, otp);
      onVerified(verificationId);
    } catch (err) {
      setError(getErrorMessage(err));
      setOtp("");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (resending || remaining > 0) return;
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      await sendOtp(identifier, purpose);
      setNotice("A new OTP has been sent.");
      setOtp("");
      start(30);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={handleVerify} noValidate className="space-y-5">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <OtpInput value={otp} onChange={setOtp} disabled={verifying} hasError={Boolean(error)} />

      {import.meta.env.DEV && (
        <p className="text-center text-xs text-gray-500">
          Development mode: the OTP is printed in the backend terminal.
        </p>
      )}

      <Button type="submit" fullWidth loading={verifying}>
        {verifying ? "Verifying..." : "Verify OTP"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="font-medium text-gray-600 hover:text-gray-900">
          Change {identifier.includes("@") ? "email" : "number"}
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={remaining > 0 || resending}
          className="font-medium text-leo-700 hover:text-leo-600 disabled:cursor-not-allowed disabled:text-gray-500"
        >
          {remaining > 0 ? `Resend OTP in ${remaining}s` : resending ? "Sending..." : "Resend OTP"}
        </button>
      </div>
    </form>
  );
}
