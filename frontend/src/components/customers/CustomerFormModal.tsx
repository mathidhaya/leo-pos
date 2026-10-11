import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createCustomer, updateCustomer } from "../../api/customers";
import type { Customer } from "../../types/customers";
import { customerFormSchema, type CustomerFormValues } from "../../utils/customerValidation";
import { getErrorMessage } from "../../utils/errors";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import TextAreaField from "../ui/TextAreaField";
import TextField from "../ui/TextField";

interface Props {
  customer: Customer | null; // null = adding a new one
  onClose: () => void;
  onSaved: () => void;
}

export default function CustomerFormModal({ customer, onClose, onSaved }: Props) {
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: customer?.name ?? "",
      phone: customer?.phone ?? "",
      email: customer?.email ?? "",
      address: customer?.address ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (customer) await updateCustomer(customer.id, values);
      else await createCustomer(values);
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <Modal title={customer ? "Edit customer" : "Add customer"} onClose={onClose} busy={isSubmitting}>
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField label="Customer name" autoComplete="off" autoFocus error={errors.name?.message} {...register("name")} />
        <TextField
          label="Mobile number"
          inputMode="tel"
          autoComplete="off"
          hint="10 digits. This is how the customer is recognised at the counter."
          error={errors.phone?.message}
          {...register("phone")}
        />
        <TextField
          label="Email (optional)"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register("email")}
        />
        <TextAreaField label="Address (optional)" error={errors.address?.message} {...register("address")} />

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save customer"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
