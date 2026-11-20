import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
