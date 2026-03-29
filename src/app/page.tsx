import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requiresOnboardingRedirect } from "@/lib/onboarding/server";
import { LandingPage } from "@/components/landing/LandingPage";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const needsOnboarding = await requiresOnboardingRedirect(supabase, user.id);
    if (needsOnboarding) {
      redirect("/onboarding/intro");
    }
    redirect("/dashboard");
  }

  return <LandingPage />;
}
