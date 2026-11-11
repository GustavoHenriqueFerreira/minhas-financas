import "server-only";

import { createClient } from "./supabase/server";

export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function requireApiUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user ? null : { supabase, user };
}
