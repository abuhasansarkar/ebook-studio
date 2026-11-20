import { Suspense } from "react";
import { VerifyEmailForm } from "./verify-form";

export const metadata = { title: "Verify your email" };

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
