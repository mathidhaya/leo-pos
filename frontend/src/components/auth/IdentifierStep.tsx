import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { identifierFormSchema, type IdentifierForm } from "../../utils/validation";
import { getErrorMessage } from "../../utils/errors";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import TextField from "../ui/TextField";

interface Props {
  buttonLabel: string;
  initialValue?: string;
  onSubmit: (identifier: string) => Promise<void>;
}

// Step 1 of Register and Forgot Password: enter the mobile number or email.
export default function IdentifierStep({ buttonLabel, initialValue = "", onSubmit }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<IdentifierForm>({
    resolver: zodResolver(identifierFormSchema),
    defaultValues: { identifier: initialValue },
  });

  const submit = handleSubmit(async ({ identifier }) => {
    setFormError(null);
    try {
      await onSubmit(identifier.trim());
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {formError && <Alert variant="error">{formError}</Alert>}

      <TextField
        label="Mobile number or email"
        placeholder="9876543210 or you@example.com"
        autoComplete="username"
        autoFocus
        error={errors.identifier?.message}
        {...register("identifier")}
      />

      <Button type="submit" fullWidth loading={isSubmitting}>
        {isSubmitting ? "Sending OTP..." : buttonLabel}
      </Button>
    </form>
  );
}
