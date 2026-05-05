"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function toQueryString(pathname: string, key: string, value: string) {
  return `${pathname}?${new URLSearchParams({ [key]: value }).toString()}`;
}

export async function loginAction(formData: FormData) {
  const email = getField(formData, "email");
  const password = getField(formData, "password");

  if (!email || !password) {
    redirect(toQueryString("/login", "error", "Email and password are required."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(toQueryString("/login", "error", "Invalid email or password."));
  }

  redirect("/dashboard");
}
