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

export async function registerAction(formData: FormData) {
  const email = getField(formData, "email");
  const password = getField(formData, "password");

  if (!email || !password) {
    redirect(toQueryString("/register", "error", "Email and password are required."));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    redirect(toQueryString("/register", "error", error.message));
  }

  if (data.session) {
    redirect("/dashboard");
  }

  redirect(
    toQueryString(
      "/login",
      "message",
      "Account created. Check your email to confirm your registration.",
    ),
  );
}
