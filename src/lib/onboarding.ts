import { unstable_noStore as noStore } from "next/cache";
import { getRequestUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserOnboarding } from "@/types";

const MIN_ONBOARDING_STEP = 1;
const MAX_ONBOARDING_STEP = 12;

function normalizeCurrentStep(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return MIN_ONBOARDING_STEP;
  }

  const integerStep = Math.trunc(value);

  if (integerStep < MIN_ONBOARDING_STEP) {
    return MIN_ONBOARDING_STEP;
  }

  if (integerStep > MAX_ONBOARDING_STEP) {
    return MAX_ONBOARDING_STEP;
  }

  return integerStep;
}

function normalizeOnboardingRow(row: Partial<UserOnboarding> | null | undefined): UserOnboarding | null {
  if (!row?.user_id || !row.created_at || !row.updated_at) {
    return null;
  }

  return {
    user_id: row.user_id,
    status:
      row.status === "completed" || row.status === "skipped"
        ? row.status
        : "pending",
    current_step: normalizeCurrentStep(row.current_step),
    completed_at: row.completed_at ?? null,
    skipped_at: row.skipped_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getAuthenticatedUserId() {
  const { user, error: authError } = await getRequestUser();
  const supabase = await createClient();

  if (authError) {
    console.error("onboarding auth error:", authError);
    return { supabase, userId: null as string | null };
  }

  return { supabase, userId: user?.id ?? null };
}

export async function getUserOnboarding(): Promise<UserOnboarding | null> {
  noStore();

  const { supabase, userId } = await getAuthenticatedUserId();

  if (!userId) {
    return null;
  }

  const { data: existingOnboarding, error: selectError } = await supabase
    .from("user_onboarding")
    .select("user_id, status, current_step, completed_at, skipped_at, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    console.error("getUserOnboarding select error:", selectError.message);
    return null;
  }

  const normalizedExisting = normalizeOnboardingRow(existingOnboarding as Partial<UserOnboarding> | null);

  if (normalizedExisting) {
    return normalizedExisting;
  }

  const { data: createdOnboarding, error: createError } = await supabase
    .from("user_onboarding")
    .insert({
      user_id: userId,
      status: "pending",
      current_step: MIN_ONBOARDING_STEP,
    })
    .select("user_id, status, current_step, completed_at, skipped_at, created_at, updated_at")
    .single();

  if (createError) {
    const { data: fallbackOnboarding, error: fallbackError } = await supabase
      .from("user_onboarding")
      .select("user_id, status, current_step, completed_at, skipped_at, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (fallbackError) {
      console.error("getUserOnboarding create fallback error:", fallbackError.message);
      return null;
    }

    return normalizeOnboardingRow(fallbackOnboarding as Partial<UserOnboarding> | null);
  }

  return normalizeOnboardingRow(createdOnboarding as Partial<UserOnboarding> | null);
}

export async function completeOnboarding(): Promise<UserOnboarding | null> {
  noStore();

  const onboarding = await getUserOnboarding();

  if (!onboarding) {
    return null;
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_onboarding")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
    })
    .eq("user_id", onboarding.user_id)
    .select("user_id, status, current_step, completed_at, skipped_at, created_at, updated_at")
    .single();

  if (error) {
    console.error("completeOnboarding update error:", error.message);
    return onboarding;
  }

  return normalizeOnboardingRow(data as Partial<UserOnboarding> | null);
}

export async function skipOnboarding(): Promise<UserOnboarding | null> {
  noStore();

  const onboarding = await getUserOnboarding();

  if (!onboarding) {
    return null;
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_onboarding")
    .update({
      status: "skipped",
      skipped_at: now,
      updated_at: now,
    })
    .eq("user_id", onboarding.user_id)
    .select("user_id, status, current_step, completed_at, skipped_at, created_at, updated_at")
    .single();

  if (error) {
    console.error("skipOnboarding update error:", error.message);
    return onboarding;
  }

  return normalizeOnboardingRow(data as Partial<UserOnboarding> | null);
}

export async function updateOnboardingStep(step: number): Promise<UserOnboarding | null> {
  noStore();

  const onboarding = await getUserOnboarding();

  if (!onboarding) {
    return null;
  }

  if (!Number.isInteger(step) || step < MIN_ONBOARDING_STEP || step > MAX_ONBOARDING_STEP) {
    return onboarding;
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("user_onboarding")
    .update({
      current_step: step,
      updated_at: now,
    })
    .eq("user_id", onboarding.user_id)
    .select("user_id, status, current_step, completed_at, skipped_at, created_at, updated_at")
    .single();

  if (error) {
    console.error("updateOnboardingStep update error:", error.message);
    return onboarding;
  }

  return normalizeOnboardingRow(data as Partial<UserOnboarding> | null);
}
