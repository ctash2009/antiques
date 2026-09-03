import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Used in Server Components, Server Actions, and Route Handlers (code that
// runs on the server, e.g. during page rendering).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll was called from a Server Component. This can be ignored
            // if you have middleware refreshing user sessions.
          }
        },
      },
    },
  );
}
