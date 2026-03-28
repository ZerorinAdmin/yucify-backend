import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingRedirectForOnboardingPath } from "@/lib/onboarding/server";

export async function enforceOnboardingPath(pathname: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const redirectPath = await getOnboardingRedirectForOnboardingPath(
    supabase,
    user.id,
    pathname
  );

  if (redirectPath && redirectPath !== pathname) {
    redirect(redirectPath);
  }
}
