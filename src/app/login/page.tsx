import { redirect } from "next/navigation";
import { getLocale, t } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  const dict = t(await getLocale());
  return <LoginForm dict={dict} />;
}
