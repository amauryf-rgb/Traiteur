import { redirect } from "next/navigation";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect("/admin/login");

  return <ResetPasswordForm token={token} />;
}
