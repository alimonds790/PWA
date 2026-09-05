"use client";

import { useActionState } from "react";
import type { Dict } from "@/lib/i18n";
import { requestOtp, verifyLogin, type LoginState } from "./actions";

const initial: LoginState = { step: "phone" };

export function LoginForm({ dict }: { dict: Dict }) {
  const [state, phoneAction, phonePending] = useActionState(requestOtp, initial);
  const [vState, verifyAction, verifyPending] = useActionState(verifyLogin, initial);

  const step = vState.step === "code" || state.step === "code" ? "code" : "phone";
  const phone = vState.phone ?? state.phone;
  const error = vState.error ?? state.error;
  const echo = state.echo;

  return (
    <div className="card mx-auto max-w-sm">
      <h1 className="mb-1 text-xl font-bold">{dict.login}</h1>
      <p className="mb-4 text-sm text-stone-500">{dict.tagline}</p>

      {step === "phone" ? (
        <form action={phoneAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="phone">{dict.phone}</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              dir="ltr"
              inputMode="tel"
              placeholder={dict.phonePlaceholder}
              className="input text-center"
              required
            />
          </div>
          {error === "invalidPhone" && (
            <p className="text-sm text-red-600">{dict.invalidPhone}</p>
          )}
          <button className="btn-primary w-full" disabled={phonePending}>
            {dict.sendCode}
          </button>
        </form>
      ) : (
        <form action={verifyAction} className="space-y-3">
          <input type="hidden" name="phone" value={phone} />
          <p className="text-sm text-stone-600" dir="ltr">{phone}</p>
          {echo && (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
              {dict.demoOtp} <b dir="ltr">{echo}</b>
            </p>
          )}
          <div>
            <label className="label" htmlFor="code">{dict.code}</label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              dir="ltr"
              className="input text-center tracking-widest"
              required
              autoFocus
            />
          </div>
          {error === "invalidCode" && (
            <p className="text-sm text-red-600">{dict.invalidCode}</p>
          )}
          <button className="btn-primary w-full" disabled={verifyPending}>
            {dict.verify}
          </button>
          <p className="text-xs text-stone-400">{dict.consentLine}</p>
        </form>
      )}
    </div>
  );
}
