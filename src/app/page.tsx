import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SignInButtons } from "@/components/auth/SignInButtons";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-white">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Image
          src="/yucify-logo.png"
          alt="Yucify"
          width={140}
          height={42}
          className="mb-6 w-auto h-10 object-contain"
        />
        <h1 className="text-2xl font-bold text-foreground">
          Try Yucify for free
        </h1>
        <p className="mt-2 text-muted-foreground">
          Meta intelligence tool for your successful ads campaign.
        </p>
        <div className="mt-8 w-full max-w-xs">
          <SignInButtons />
        </div>
      </div>
    </main>
  );
}
