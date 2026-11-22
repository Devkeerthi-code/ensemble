import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { signUpAction } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <div className="wrap app-main"><AuthForm mode="signup" action={signUpAction} next={next} /></div>;
}
