import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const SIGNUP_BONUS_AMOUNT = 1;
const BOOK_UPLOAD_COST = 1;

const INSUFFICIENT_CREDITS_ERROR = "You need 1 credit to upload a new book.";
const CREDIT_CONSUMPTION_ERROR = "Could not consume your credit. Please try again.";

type ConsumeBookCreditResult =
  | {
      success: true;
      balance: number;
    }
  | {
      success: false;
      error: string;
    };

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

function normalizeBalance(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  return value;
}

async function ensureSignupBonusTransaction(supabase: ServerSupabaseClient, userId: string) {
  const { data: existingTransactions, error: existingError } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "signup_bonus")
    .limit(1);

  if (existingError) {
    console.error("ensureSignupBonusTransaction query error:", existingError.message);
    return;
  }

  if (existingTransactions && existingTransactions.length > 0) {
    return;
  }

  const { error: insertError } = await supabase.from("credit_transactions").insert({
    user_id: userId,
    type: "signup_bonus",
    amount: SIGNUP_BONUS_AMOUNT,
    reason: "Signup bonus",
    book_id: null,
  });

  if (insertError) {
    console.error("ensureSignupBonusTransaction insert error:", insertError.message);
  }
}

export async function getUserCredits(): Promise<number | null> {
  noStore();

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("getUserCredits auth error:", authError.message);
    return null;
  }

  if (!user) {
    return null;
  }

  const { data: creditsRow, error: creditsError } = await supabase
    .from("user_credits")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creditsError) {
    console.error("getUserCredits query error:", creditsError.message);
    return null;
  }

  if (creditsRow) {
    return normalizeBalance(creditsRow.balance);
  }

  const { data: insertedCreditsRow, error: insertError } = await supabase
    .from("user_credits")
    .insert({
      user_id: user.id,
      balance: SIGNUP_BONUS_AMOUNT,
    })
    .select("balance")
    .maybeSingle();

  if (insertError) {
    const { data: existingCreditsRow, error: existingError } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError || !existingCreditsRow) {
      console.error("getUserCredits insert error:", insertError.message);
      return null;
    }

    await ensureSignupBonusTransaction(supabase, user.id);
    return normalizeBalance(existingCreditsRow.balance);
  }

  await ensureSignupBonusTransaction(supabase, user.id);
  return normalizeBalance(insertedCreditsRow?.balance ?? SIGNUP_BONUS_AMOUNT);
}

export async function ensureUserCredits(): Promise<number | null> {
  return getUserCredits();
}

export async function hasEnoughCredits(requiredCredits: number): Promise<boolean> {
  if (requiredCredits <= 0) {
    return true;
  }

  const balance = await getUserCredits();

  if (balance === null) {
    return false;
  }

  return balance >= requiredCredits;
}

export async function consumeBookCredit(bookId: string): Promise<ConsumeBookCreditResult> {
  noStore();

  if (!bookId) {
    return {
      success: false,
      error: CREDIT_CONSUMPTION_ERROR,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("consumeBookCredit auth error:", authError.message);
    return {
      success: false,
      error: CREDIT_CONSUMPTION_ERROR,
    };
  }

  if (!user) {
    return {
      success: false,
      error: "You must be signed in to upload a book.",
    };
  }

  const currentBalance = await ensureUserCredits();

  if (currentBalance === null) {
    return {
      success: false,
      error: CREDIT_CONSUMPTION_ERROR,
    };
  }

  if (currentBalance < BOOK_UPLOAD_COST) {
    return {
      success: false,
      error: INSUFFICIENT_CREDITS_ERROR,
    };
  }

  const nextBalance = currentBalance - BOOK_UPLOAD_COST;

  const { data: updatedCreditsRow, error: updateError } = await supabase
    .from("user_credits")
    .update({ balance: nextBalance })
    .eq("user_id", user.id)
    .eq("balance", currentBalance)
    .select("balance")
    .maybeSingle();

  if (updateError || !updatedCreditsRow) {
    const latestBalance = await getUserCredits();

    if (latestBalance !== null && latestBalance < BOOK_UPLOAD_COST) {
      return {
        success: false,
        error: INSUFFICIENT_CREDITS_ERROR,
      };
    }

    if (updateError) {
      console.error("consumeBookCredit update error:", updateError.message);
    }

    return {
      success: false,
      error: CREDIT_CONSUMPTION_ERROR,
    };
  }

  const { error: transactionError } = await supabase.from("credit_transactions").insert({
    user_id: user.id,
    type: "book_unlock",
    amount: -BOOK_UPLOAD_COST,
    reason: "Book upload",
    book_id: bookId,
  });

  if (transactionError) {
    console.error("consumeBookCredit transaction error:", transactionError.message);

    const { error: rollbackError } = await supabase
      .from("user_credits")
      .update({ balance: currentBalance })
      .eq("user_id", user.id)
      .eq("balance", nextBalance);

    if (rollbackError) {
      console.error("consumeBookCredit rollback error:", rollbackError.message);
    }

    return {
      success: false,
      error: CREDIT_CONSUMPTION_ERROR,
    };
  }

  return {
    success: true,
    balance: normalizeBalance(updatedCreditsRow.balance),
  };
}
