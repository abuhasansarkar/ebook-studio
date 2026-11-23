import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Logo className="mb-8" />
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-8">{children}</div>
    </div>
  );
}
