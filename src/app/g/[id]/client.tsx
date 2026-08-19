"use client";

import { useState } from "react";

// Absolute URLs are resolved client-side from location.origin so the app
// stays host-agnostic. "{link}" in template is replaced with origin+path.

export function CopyLink({
  path,
  label,
  copiedLabel,
}: {
  path: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(`${location.origin}${path}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

export function WaButton({
  phone,
  template,
  path,
  label,
  className = "btn-whatsapp text-xs",
}: {
  phone: string | null;
  template: string; // may contain {link}
  path?: string;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const text = template.replace(
          "{link}",
          path ? `${location.origin}${path}` : "",
        );
        const digits = (phone ?? "").replace(/\D/g, "");
        const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
        window.open(`${base}?text=${encodeURIComponent(text)}`, "_blank");
      }}
    >
      {label}
    </button>
  );
}
