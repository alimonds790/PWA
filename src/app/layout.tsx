import type { Metadata, Viewport } from "next";
import { getLocale, t } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { toggleLocale, logout } from "./actions";
import { SwRegister } from "./sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Group Ledger | دفتر الجماعة",
  description: "A permanent record of group payments — proof, not money movement.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Group Ledger", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const dict = t(locale);
  const session = await getSession();

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body className="min-h-screen">
        <header className="bg-teal-800 text-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <a href={session ? "/dashboard" : "/"} className="text-lg font-bold">
              {dict.appName}
            </a>
            <div className="flex items-center gap-2">
              <form action={toggleLocale}>
                <button className="rounded-md bg-teal-700 px-3 py-1.5 text-sm hover:bg-teal-600">
                  {dict.langToggle}
                </button>
              </form>
              {session && (
                <form action={logout}>
                  <button className="rounded-md bg-teal-700 px-3 py-1.5 text-sm hover:bg-teal-600">
                    {dict.logout}
                  </button>
                </form>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-stone-500">
          {dict.recordNotArbiter}
        </footer>
        <SwRegister />
      </body>
    </html>
  );
}
