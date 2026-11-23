"use client";

import { useFormStatus } from "react-dom";

/** Submit button for plain server-action forms: disabled while pending so a double click can't submit twice. */
export function SubmitButton({ children, pendingText, className = "btn sm" }: { children: React.ReactNode; pendingText: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending}>{pending ? pendingText : children}</button>;
}
