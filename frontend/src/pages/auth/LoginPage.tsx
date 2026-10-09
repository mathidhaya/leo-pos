import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TextField from "../../components/ui/TextField";
import { useAuth } from "../../hooks/useAuth";
import AuthLayout from "../../layouts/AuthLayout";
import { getErrorMessage } from "../../utils/errors";
import { loginFormSchema, type LoginForm } from "../../utils/validation";

export default function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const notice = (location.state as { message?: string } | null)?.message;
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { identifier: "", password: "" },
  });

  // On success the route guard moves the user to the dashboard automatically.
  const submit = handleSubmit(async ({ identifier, password }) => {
    setFormError(null);
    try {
      await login(identifier, password);
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to your Leo Cafe account."
      footer={
        <>
          New to Leo Cafe?{" "}
          <Link to="/register" className="font-semibold text-leo-700 hover:underline">
            Register your cafe
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {notice && <Alert variant="success">{notice}</Alert>}
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField
          label="Mobile number or email"
          placeholder="9876543210 or you@example.com"
          autoComplete="username"
          autoFocus
          error={errors.identifier?.message}
          {...register("identifier")}
        />

        <div>
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <div className="mt-2 text-right">
            <Link to="/forgot-password" className="text-sm font-medium text-leo-700 hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" fullWidth loading={isSubmitting}>
          {isSubmitting ? "Logging in..." : "Login"}
        </Button>
      </form>
    </AuthLayout>
  );
}
