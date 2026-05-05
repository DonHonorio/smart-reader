import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PRIVATE_ROUTE_PREFIXES = ["/dashboard", "/library", "/reader", "/vocabulary", "/export"];
const AUTH_ROUTES = new Set(["/login", "/register"]);

function isPrivateRoute(pathname: string) {
  return PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function copyCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach(({ name, value }) => {
    target.cookies.set(name, value);
  });

  return target;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user } = await updateSession(request);

  if (!user && isPrivateRoute(pathname)) {
    const redirectResponse = NextResponse.redirect(new URL("/login", request.url));
    return copyCookies(response, redirectResponse);
  }

  if (user && AUTH_ROUTES.has(pathname)) {
    const redirectResponse = NextResponse.redirect(new URL("/dashboard", request.url));
    return copyCookies(response, redirectResponse);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/library/:path*",
    "/reader/:path*",
    "/vocabulary/:path*",
    "/export/:path*",
    "/login",
    "/register",
  ],
};
