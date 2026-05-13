import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const SIGNUP_BONUS_AMOUNT = 1;
const BOOK_UPLOAD_COST = 1;

const INSUFFICIENT_CREDITS_ERROR = "You need 1 credit to upload a new book.";
const CREDIT_CONSUMPTION_ERROR = "Could not consume your credit. Please try again.";
const PURCHASE_CREDIT_ERROR = "Could not add purchased credits right now.";

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

type AddPurchasedCreditsParams = {
  userId: string;
  credits: number;
  reason: string;
  stripeSessionId: string;
};

type AddPurchasedCreditsResult =
  | {
      success: true;
      alreadyProcessed: boolean;
      balance: number;
    }
  | {
      success: false;
      error: string;
    };

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

function logSupabaseError(context: string, error: SupabaseErrorLike | null | undefined) {
  if (!error) {
    return;
  }

  console.error(context, {
    code: error.code,
    message: error.message,
    hint: error.hint,
    details: error.details,
  });
}

function isDuplicateKeyError(error: SupabaseErrorLike | null | undefined) {
  return error?.code === "23505";
}

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

export async function addPurchasedCredits({
  userId,
  credits,
  reason,
  stripeSessionId,
}: AddPurchasedCreditsParams): Promise<AddPurchasedCreditsResult> {
  noStore();

  const normalizedUserId = userId.trim();
  const normalizedReason = reason.trim();
  const normalizedStripeSessionId = stripeSessionId.trim();
  const logContext = `(userId=${normalizedUserId}, stripeSessionId=${normalizedStripeSessionId})`;

  if (!normalizedUserId || !normalizedReason || !normalizedStripeSessionId) {
    return {
      success: false,
      error: PURCHASE_CREDIT_ERROR,
    };
  }

  if (!Number.isInteger(credits) || credits <= 0) {
    return {
      success: false,
      error: PURCHASE_CREDIT_ERROR,
    };
  }

  const supabase = supabaseAdmin;

  const { data: existingTransactions, error: existingTransactionError } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("stripe_session_id", normalizedStripeSessionId)
    .limit(1);

  if (existingTransactionError) {
    logSupabaseError(
      `addPurchasedCredits duplicate check error ${logContext}:`,
      existingTransactionError,
    );

    return {
      success: false,
      error: PURCHASE_CREDIT_ERROR,
    };
  }

  if (existingTransactions && existingTransactions.length > 0) {
    const { data: currentCreditsRow, error: currentCreditsError } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", normalizedUserId)
      .maybeSingle();

    if (currentCreditsError) {
      logSupabaseError(
        `addPurchasedCredits read balance for duplicate session error ${logContext}:`,
        currentCreditsError,
      );

      return {
        success: false,
        error: PURCHASE_CREDIT_ERROR,
      };
    }

    return {
      success: true,
      alreadyProcessed: true,
      balance: normalizeBalance(currentCreditsRow?.balance),
    };
  }

  const { data: existingCreditsRow, error: existingCreditsError } = await supabase
    .from("user_credits")
    .select("balance")
    .eq("user_id", normalizedUserId)
    .maybeSingle();

  if (existingCreditsError) {
    logSupabaseError(
      `addPurchasedCredits current balance query error ${logContext}:`,
      existingCreditsError,
    );

    return {
      success: false,
      error: PURCHASE_CREDIT_ERROR,
    };
  }

  if (!existingCreditsRow) {
    const { error: insertCreditsError } = await supabase.from("user_credits").insert({
      user_id: normalizedUserId,
      balance: 0,
    });

    if (insertCreditsError) {
      const { data: fallbackCreditsRow, error: fallbackCreditsError } = await supabase
        .from("user_credits")
        .select("balance")
        .eq("user_id", normalizedUserId)
        .maybeSingle();

      if (fallbackCreditsError || !fallbackCreditsRow) {
        logSupabaseError(
          `addPurchasedCredits ensure user_credits error ${logContext}:`,
          insertCreditsError,
        );

        return {
          success: false,
          error: PURCHASE_CREDIT_ERROR,
        };
      }
    }
  }

  let previousBalance = 0;
  let updatedBalance = 0;
  let balanceUpdated = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: currentBalanceRow, error: currentBalanceError } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", normalizedUserId)
      .maybeSingle();

    if (currentBalanceError || !currentBalanceRow) {
      logSupabaseError(
        `addPurchasedCredits read balance before update error ${logContext}:`,
        currentBalanceError,
      );

      return {
        success: false,
        error: PURCHASE_CREDIT_ERROR,
      };
    }

    const currentBalance = normalizeBalance(currentBalanceRow.balance);
    const nextBalance = currentBalance + credits;

    const { data: updatedCreditsRow, error: updateCreditsError } = await supabase
      .from("user_credits")
      .update({ balance: nextBalance })
      .eq("user_id", normalizedUserId)
      .eq("balance", currentBalance)
      .select("balance")
      .maybeSingle();

    if (!updateCreditsError && updatedCreditsRow) {
      previousBalance = currentBalance;
      updatedBalance = normalizeBalance(updatedCreditsRow.balance);
      balanceUpdated = true;
      break;
    }

    if (updateCreditsError) {
      logSupabaseError(
        `addPurchasedCredits optimistic update error ${logContext}:`,
        updateCreditsError,
      );
    }
  }

  if (!balanceUpdated) {
    return {
      success: false,
      error: PURCHASE_CREDIT_ERROR,
    };
  }

  const { error: insertTransactionError } = await supabase.from("credit_transactions").insert({
    user_id: normalizedUserId,
    type: "purchase",
    amount: credits,
    reason: normalizedReason,
    book_id: null,
    stripe_session_id: normalizedStripeSessionId,
  });

  if (insertTransactionError) {
    logSupabaseError(
      `addPurchasedCredits transaction insert error ${logContext}:`,
      insertTransactionError,
    );

    const { error: rollbackError } = await supabase
      .from("user_credits")
      .update({ balance: previousBalance })
      .eq("user_id", normalizedUserId)
      .eq("balance", updatedBalance);

    if (rollbackError) {
      logSupabaseError(`addPurchasedCredits rollback error ${logContext}:`, rollbackError);
    }

    if (isDuplicateKeyError(insertTransactionError)) {
      const { data: latestCreditsRow, error: latestCreditsError } = await supabase
        .from("user_credits")
        .select("balance")
        .eq("user_id", normalizedUserId)
        .maybeSingle();

      if (latestCreditsError) {
        logSupabaseError(
          `addPurchasedCredits read latest balance for duplicate session error ${logContext}:`,
          latestCreditsError,
        );
      }

      return {
        success: true,
        alreadyProcessed: true,
        balance: normalizeBalance(latestCreditsRow?.balance ?? previousBalance),
      };
    }

    return {
      success: false,
      error: PURCHASE_CREDIT_ERROR,
    };
  }

  // Recommended DB hardening (manual SQL, not in app code):
  // CREATE UNIQUE INDEX credit_transactions_stripe_session_id_unique
  // ON credit_transactions (stripe_session_id)
  // WHERE stripe_session_id IS NOT NULL;
  return {
    success: true,
    alreadyProcessed: false,
    balance: updatedBalance,
  };
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
