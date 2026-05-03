import { NextResponse } from "next/server";
import { APP_NAME } from "@/lib/constants";
import type { HealthResponse } from "@/types";

export function GET() {
  const payload: HealthResponse = {
    status: "ok",
    app: APP_NAME,
  };

  return NextResponse.json(payload);
}
