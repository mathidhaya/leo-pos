import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck } from "lucide-react";
import { sendOtp } from "../../api/auth";
import IdentifierStep from "../../components/auth/IdentifierStep";
import OtpStep from "../../components/auth/OtpStep";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TextField from "../../components/ui/TextField";
import { useAuth } from "../../hooks/useAuth";
import AuthLayout from "../../layouts/AuthLayout";
import { getErrorCode, getErrorMessage } from "../../utils/errors";
import { registerDetailsSchema, type RegisterDetailsForm } from "../../utils/validation";

type Step = "identifier" | "otp" | "details";

const COPY: Record<Step, { title: string; subtitle: (identifier: string) => string; label: string }> = {
  identifier: {
    title: "Create your cafe account",
    subtitle: () => "Enter your mobile number or email. We will send you an OTP.",
    label: "Step 1 of 3",
  },
  otp: {
    title: "Verify your OTP",
    subtitle: (identifier) => `Enter the 4-digit code sent to ${identifier}.`,
    label: "Step 2 of 3",
  },
  details: {
    title: "Set up your cafe",
    subtitle: () => "Almost done. Tell us about your cafe and choose a password.",
    label: "Step 3 of 3",
  },
};

interface DetailsFormProps {
  identifier: string;
  verificationId: string;
  onVerificationLost: () => void;
}

function DetailsForm({ identifier, verificationId, onVerificationLost }: DetailsFormProps) {
  const { register: registerShop } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterDetailsForm>({
    resolver: zodResolver(registerDetailsSchema),
    defaultValues: { ownerName: "", shopName: "", password: "", confirmPassword: "" },
  });

  // On success the route guard moves the user to the dashboard automatically.
  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerShop({ identifier, verificationId, ...values });
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
      <div className="flex items-center gap-2 rounded-lg bg-leo-50 px-3 py-2 text-sm text-leo-700">
        <CircleCheck className="h-4 w-4 shrink-0" />
        <span className="font-medium">Verified</span>
        <span className="truncate text-leo-700/80">{identifier}</span>
      </div>

      {formError && <Alert variant="error">{formError}</Alert>}

      <TextField
        label="Owner name"
        autoComplete="name"
        autoFocus
        error={errors.ownerName?.message}
        {...register("ownerName")}
      />
      <TextField
        label="Cafe / shop name"
        autoComplete="organization"
        error={errors.shopName?.message}
        {...register("shopName")}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, with a letter and a number."
        error={errors.password?.message}
        {...register("password")}
      />
      <TextField
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <Button type="submit" fullWidth loading={isSubmitting}>
        {isSubmitting ? "Creating your account..." : "Create account"}
      </Button>
    </form>
  );
}

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function handleIdentifier(value: string) {
    await sendOtp(value, "REGISTER");
    setNotice(null);
    setIdentifier(value);
    setStep("otp");
  }

  function handleVerified(id: string) {
    setVerificationId(id);
    setStep("details");
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
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-leo-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gray-400">{copy.label}</p>

      {step === "identifier" && (
        <div className="space-y-5">
          {notice && <Alert variant="info">{notice}</Alert>}
          <IdentifierStep buttonLabel="Get OTP" initialValue={identifier} onSubmit={handleIdentifier} />
        </div>
      )}

      {step === "otp" && (
        <OtpStep
          identifier={identifier}
          purpose="REGISTER"
          onVerified={handleVerified}
          onBack={() => setStep("identifier")}
        />
      )}

      {step === "details" && (
        <DetailsForm
          identifier={identifier}
          verificationId={verificationId}
          onVerificationLost={handleVerificationLost}
        />
      )}
    </AuthLayout>
  );
}
