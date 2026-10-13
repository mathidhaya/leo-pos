import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePassword, updateProfile } from "../../api/account";
import { useFlash } from "../../hooks/useFlash";
import type { Account } from "../../types/settings";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime, formatYmd } from "../../utils/format";
import { normalizePhone } from "../../utils/phone";
import { ROLE_LABEL } from "../../utils/roles";
import {
  passwordFormSchema,
  profileFormSchema,
  type PasswordFormValues,
  type ProfileFormValues,
} from "../../utils/settingsValidation";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import TextField from "../ui/TextField";
import FormActions from "./FormActions";
import SettingsCard from "./SettingsCard";

const toForm = (account: Account): ProfileFormValues => ({
  name: account.name,
  phone: account.phone ?? "",
  email: account.email ?? "",
  currentPassword: "",
});

interface Props {
  account: Account;
  onSaved: () => void;
}

function ProfileCard({ account, onSaved }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({ resolver: zodResolver(profileFormSchema), defaultValues: toForm(account) });

  useEffect(() => {
    reset(toForm(account));
  }, [account, reset]);

  const phone = watch("phone");
  const email = watch("email");

  // Changing the mobile number or email changes how you log in, so the password is asked again
  const loginChanged =
    account.canChangeLogin &&
    ((normalizePhone(phone) ?? "") !== (account.phone ?? "") || email.trim().toLowerCase() !== (account.email ?? ""));

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    if (loginChanged && values.currentPassword.trim() === "") {
      setError("currentPassword", { message: "Enter your current password to change your login details." });
      return;
    }
    try {
      await updateProfile({
        name: values.name,
        phone: values.phone,
        email: values.email,
        currentPassword: loginChanged ? values.currentPassword : undefined,
      });
      setFlash("Your details were saved.");
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {flash && <Alert variant="success">{flash}</Alert>}
      {formError && <Alert variant="error">{formError}</Alert>}

      <SettingsCard title="Profile">
        <div className="space-y-5">
          <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-gray-50 px-4 py-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-500">Role</dt>
              <dd className="font-medium text-gray-900">{ROLE_LABEL[account.role]}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Joined</dt>
              <dd className="font-medium text-gray-900">{formatYmd(account.joiningDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Last login</dt>
              <dd className="font-medium text-gray-900">
                {account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "This is your first login"}
              </dd>
            </div>
          </dl>

          <TextField label="Your name" autoComplete="name" error={errors.name?.message} {...register("name")} />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Mobile number"
              inputMode="tel"
              autoComplete="off"
              readOnly={!account.canChangeLogin}
              error={errors.phone?.message}
              {...register("phone")}
            />
            <TextField
              label="Email"
              type="email"
              autoComplete="off"
              readOnly={!account.canChangeLogin}
              error={errors.email?.message}
              {...register("email")}
            />
          </div>

          {!account.canChangeLogin && (
            <p className="text-sm text-gray-500">
              Your mobile number and email are your login. Only the owner can change them, so please ask them.
            </p>
          )}

          {loginChanged && (
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              hint="Needed to change your mobile number or email."
              error={errors.currentPassword?.message}
              {...register("currentPassword")}
            />
          )}
        </div>
      </SettingsCard>

      <FormActions dirty={isDirty} saving={isSubmitting} onDiscard={() => reset(toForm(account))} />
    </form>
  );
}

function PasswordCard() {
  const [formError, setFormError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash(8000);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const ended = await changePassword(values);
      reset();
      setFlash(
        ended > 0
          ? `Password changed. ${ended} other device${ended === 1 ? " was" : "s were"} logged out.`
          : "Password changed."
      );
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <SettingsCard
        title="Change password"
        description="Choose a password only you know. You stay logged in here, and other devices are logged out."
      >
        <div className="space-y-5">
          {flash && <Alert variant="success">{flash}</Alert>}
          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={errors.currentPassword?.message}
            {...register("currentPassword")}
          />
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
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

          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? "Saving..." : "Change password"}
            </Button>
          </div>
        </div>
      </SettingsCard>
    </form>
  );
}

export default function AccountTab({ account, onSaved }: Props) {
  return (
    <div className="space-y-6">
      <ProfileCard account={account} onSaved={onSaved} />
      <PasswordCard />
    </div>
  );
}
