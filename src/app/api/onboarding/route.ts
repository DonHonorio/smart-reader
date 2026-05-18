import { NextResponse } from "next/server";
import {
  completeOnboarding,
  getUserOnboarding,
  skipOnboarding,
  updateOnboardingStep,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

type OnboardingAction = "complete" | "skip" | "set_step";

type RequestBody = {
  action?: OnboardingAction;
  step?: number;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Authentication required.", 401);
  }

  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const action = body.action;

  if (!action) {
    return jsonError("action is required.", 400);
  }

  if (action === "complete") {
    const onboarding = await completeOnboarding();

    if (!onboarding) {
      return jsonError("Could not complete onboarding.", 500);
    }

    return NextResponse.json({
      ok: true,
      action,
      onboarding,
      message: "Onboarding completed.",
    });
  }

  if (action === "skip") {
    const onboarding = await skipOnboarding();

    if (!onboarding) {
      return jsonError("Could not skip onboarding.", 500);
    }

    return NextResponse.json({
      ok: true,
      action,
      onboarding,
      message: "Onboarding skipped.",
    });
  }

  if (action === "set_step") {
    if (!Number.isInteger(body.step)) {
      return jsonError("step must be an integer between 1 and 12.", 400);
    }

    if ((body.step ?? 0) < 1 || (body.step ?? 0) > 12) {
      return jsonError("step must be an integer between 1 and 12.", 400);
    }

    const onboarding = await updateOnboardingStep(body.step as number);

    if (!onboarding) {
      return jsonError("Could not update onboarding step.", 500);
    }

    return NextResponse.json({
      ok: true,
      action,
      onboarding,
      message: `Onboarding step updated to ${body.step}.`,
    });
  }

  const current = await getUserOnboarding();

  return NextResponse.json(
    {
      ok: false,
      error: "Unsupported onboarding action.",
      onboarding: current,
    },
    { status: 400 },
  );
}
