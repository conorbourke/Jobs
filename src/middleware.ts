import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/config";

const APP_PREFIXES = [
  "/dashboard",
  "/tracker",
  "/suggested",
  "/forms",
  "/templates",
  "/settings",
  "/admin",
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = SUPABASE_URL;
  const supabaseAnonKey = SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isAppPath = APP_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

  // If Supabase isn't configured (e.g. NEXT_PUBLIC_* not set at build time),
  // never hard-500: let public pages render, and send app routes to login.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isAppPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "not_configured");
      return NextResponse.redirect(url);
    }
    return response;
  }

  let user: User | null = null;
  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    // Refresh the session (required for SSR auth) and gate the app shell.
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch {
    // Auth backend unreachable/misconfigured — don't take the whole site down.
    if (isAppPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "auth_unavailable");
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (!user && isAppPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|ico|css|js)$).*)"],
};
