import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { signInAction } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <div className="wrap app-main"><AuthForm mode="login" action={signInAction} next={next} /></div>;
}
