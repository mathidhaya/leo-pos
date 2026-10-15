import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPassword, sendOtp } from "../../api/auth";
import IdentifierStep from "../../components/auth/IdentifierStep";
import OtpStep from "../../components/auth/OtpStep";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TextField from "../../components/ui/TextField";
import AuthLayout from "../../layouts/AuthLayout";
import { getErrorCode, getErrorMessage } from "../../utils/errors";
import { newPasswordSchema, type NewPasswordForm } from "../../utils/validation";

type Step = "identifier" | "otp" | "password";

const COPY: Record<Step, { title: string; subtitle: (identifier: string) => string; label: string }> = {
  identifier: {
    title: "Forgot your password?",
    subtitle: () => "Enter your registered mobile number or email. We will send you an OTP.",
    label: "Step 1 of 3",
  },
  otp: {
    title: "Verify your OTP",
    subtitle: (identifier) => `If ${identifier} is registered, a 4-digit code was sent to it.`,
    label: "Step 2 of 3",
  },
  password: {
    title: "Create a new password",
    subtitle: () => "Choose a new password for your account.",
    label: "Step 3 of 3",
  },
};

interface NewPasswordFormProps {
  identifier: string;
  verificationId: string;
  onVerificationLost: () => void;
}

function NewPasswordFormView({ identifier, verificationId, onVerificationLost }: NewPasswordFormProps) {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordForm>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await resetPassword({ identifier, verificationId, ...values });
      navigate("/login", { replace: true, state: { message: "Password updated. Please log in." } });
    } catch (err) {
      if (getErrorCode(err) === "VERIFICATION_REQUIRED") {
        onVerificationLost();
        return;
      }
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {formError && <Alert variant="error">{formError}</Alert>}

      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        autoFocus
        hint="At least 8 characters, with a letter and a number."
        error={errors.newPassword?.message}
        {...register("newPassword")}
      />
      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <Button type="submit" fullWidth loading={isSubmitting}>
        {isSubmitting ? "Saving..." : "Reset password"}
      </Button>
    </form>
  );
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function handleIdentifier(value: string) {
    await sendOtp(value, "RESET");
    setNotice(null);
    setIdentifier(value);
    setStep("otp");
  }

  function handleVerificationLost() {
    setVerificationId("");
    setNotice("Your verification expired. Please request a new OTP.");
    setStep("identifier");
  }

  const copy = COPY[step];

  return (
    <AuthLayout
      title={copy.title}
      subtitle={copy.subtitle(identifier)}
      footer={
        <Link to="/login" className="font-semibold text-leo-700 hover:underline">
          Back to login
        </Link>
      }
    >
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-500">{copy.label}</p>

      {step === "identifier" && (
        <div className="space-y-5">
          {notice && <Alert variant="info">{notice}</Alert>}
          <IdentifierStep buttonLabel="Send OTP" initialValue={identifier} onSubmit={handleIdentifier} />
        </div>
      )}

      {step === "otp" && (
        <OtpStep
          identifier={identifier}
          purpose="RESET"
          onVerified={(id) => {
            setVerificationId(id);
            setStep("password");
          }}
          onBack={() => setStep("identifier")}
        />
      )}

      {step === "password" && (
        <NewPasswordFormView
          identifier={identifier}
          verificationId={verificationId}
          onVerificationLost={handleVerificationLost}
        />
      )}
    </AuthLayout>
  );
}
