import { z } from "zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createStaff, updateStaff, type StaffPayload } from "../../api/staff";
import type { StaffMember, StaffSecret } from "../../types/staff";
import { getErrorMessage } from "../../utils/errors";
import { toYmd } from "../../utils/format";
import { JOINING_MIN, latestJoining, staffFormSchema } from "../../utils/staffValidation";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import SelectField from "../ui/SelectField";
import TextField from "../ui/TextField";

// What each role can do, shown under the role box so the choice is clear
const ROLE_ACCESS: Record<string, string> = {
  MANAGER:
    "Dashboard, Orders, Products, Categories, Inventory, Customers and Reports. Can see profit and cost prices, and can cancel and refund paid orders.",
  CASHIER:
    "Dashboard, New Order, Orders, Customers, Payments and Invoices. Cannot see profit or cost prices, change the menu, or refund.",
};

interface Props {
  staff: StaffMember | null; // null = adding a new one
  onClose: () => void;
  // When a new member is added, the temporary password comes back here. For an edit it is null.
  onSaved: (created: StaffSecret | null) => void;
}

export default function StaffFormModal({ staff, onClose, onSaved }: Props) {
  const [formError, setFormError] = useState<string | null>(null);

  
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof staffFormSchema>,
    any,
    z.output<typeof staffFormSchema>
  >({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      name: staff?.name ?? "",
      phone: staff?.phone ?? "",
      email: staff?.email ?? "",
      role: staff && staff.role !== "OWNER" ? staff.role : "",
      joiningDate: staff?.joiningDate ?? toYmd(new Date()),
    },
  });


  const role = watch("role");

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const payload: StaffPayload = {
      name: values.name,
      phone: values.phone,
      email: values.email,
      role: values.role as "MANAGER" | "CASHIER",
      joiningDate: values.joiningDate,
    };

    try {
      if (staff) {
        await updateStaff(staff.id, payload);
        onSaved(null);
      } else {
        onSaved(await createStaff(payload));
      }
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <Modal title={staff ? "Edit staff member" : "Add staff member"} onClose={onClose} busy={isSubmitting}>
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField label="Full name" autoComplete="off" autoFocus error={errors.name?.message} {...register("name")} />

        <TextField
          label="Mobile number"
          inputMode="tel"
          autoComplete="off"
          hint="10 digits. They can log in with this number."
          error={errors.phone?.message}
          {...register("phone")}
        />

        <TextField
          label="Email (optional)"
          type="email"
          autoComplete="off"
          hint="They can also log in with this email."
          error={errors.email?.message}
          {...register("email")}
        />

        <SelectField
          label="Role"
          hint={ROLE_ACCESS[role]}
          error={errors.role?.message}
          {...register("role")}
        >
          <option value="">Choose a role</option>
          <option value="MANAGER">Manager</option>
          <option value="CASHIER">Cashier</option>
        </SelectField>

        <TextField
          label="Joining date"
          type="date"
          min={JOINING_MIN}
          max={latestJoining()}
          error={errors.joiningDate?.message}
          {...register("joiningDate")}
        />

        {!staff && (
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
            A temporary password is created for you. It is shown <strong>once</strong>, right after you save.
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Saving..." : staff ? "Save changes" : "Add staff member"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
