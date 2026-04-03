"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function LandingPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const signInWithGoogle = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="min-h-[100dvh] bg-white">
      {/* ─── Navbar ─── */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-10 lg:px-16">
        <Image
          src="/yucify-logo.png"
          alt="Yucify"
          width={130}
          height={40}
          className="h-9 w-auto object-contain"
          priority
        />
        <Button
          className="h-10 rounded-lg bg-[hsl(250,60%,55%)] px-6 text-sm font-medium text-white hover:bg-[hsl(250,60%,48%)]"
          onClick={() => setDialogOpen(true)}
        >
          Login
        </Button>
      </header>

      {/* ─── Hero ─── */}
      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-12 pb-8 text-center sm:pt-20">
        <h1 className="text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-[44px] sm:leading-[1.15]">
          You&apos;re losing money on your Meta&nbsp;ads
          <br />
          We show you where
        </h1>

        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Yucify analyzes your ads and tells you exactly what&apos;s
          stopping clicks, conversions, and scale in seconds.
        </p>

        <Button
          size="lg"
          className="mt-8 h-12 rounded-lg bg-[hsl(250,60%,55%)] px-10 text-base font-medium text-white hover:bg-[hsl(250,60%,48%)]"
          onClick={() => setDialogOpen(true)}
        >
          Analyze my ads
        </Button>

        <p className="mt-4 text-sm text-muted-foreground">
          100+ founders, and marketers trusts us.
        </p>
      </section>

      {/* ─── Hero Image ─── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
        <Image
          src="/app-hero.png"
          alt="Yucify dashboard — diagnosis, affected ads, funnel breakdown"
          width={1200}
          height={720}
          className="w-full"
          priority
        />
      </section>

      {/* ─── Auth Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-8">
          <DialogHeader className="items-center text-center">
            <Image
              src="/yucify-logo.png"
              alt="Yucify"
              width={120}
              height={36}
              className="mx-auto mb-2 h-8 w-auto object-contain"
            />
            <DialogTitle className="text-xl font-semibold">
              Welcome to Yucify
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Sign in to analyze your Meta ads performance
            </DialogDescription>
          </DialogHeader>

          <Button
            variant="outline"
            size="lg"
            className="mt-4 h-12 w-full gap-3 rounded-lg border-border text-base font-medium"
            onClick={signInWithGoogle}
            disabled={loading}
          >
            <GoogleIcon className="h-5 w-5 shrink-0" />
            {loading ? "Redirecting..." : "Continue with Google"}
          </Button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
