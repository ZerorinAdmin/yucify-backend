import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  try {
    await supabase.auth.getUser();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isStaleRefreshToken =
      message.includes("refresh_token_not_found") ||
      message.includes("Invalid Refresh Token");

    if (isStaleRefreshToken) {
      // DB reset can invalidate refresh tokens while browser still has old cookies.
      // Clearing auth cookies allows a clean unauthenticated state.
      const authCookieNames = request.cookies
        .getAll()
        .map((c) => c.name)
        .filter(
          (name) =>
            name.startsWith("sb-") &&
            name.includes("-auth-token") &&
            !name.includes("code-verifier")
        );

      for (const cookieName of authCookieNames) {
        response.cookies.delete(cookieName);
      }
    } else {
      throw error;
    }
  }

  return response;
}
