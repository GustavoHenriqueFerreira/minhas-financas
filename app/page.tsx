import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import FinanceApp from "./finance-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const displayName = typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
    ? user.user_metadata.full_name.trim()
    : (user.email ?? "Minha conta");
  return <FinanceApp displayName={displayName} />;
}
