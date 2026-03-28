"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export function OnboardingShell({
  children,
  className,
  showLogo = true,
}: {
  children: React.ReactNode;
  className?: string;
  showLogo?: boolean;
}) {
  return (
    <main className="min-h-[100dvh] bg-[#f5f5f7] px-4 py-10 sm:px-6">
      <div
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-col items-center rounded-3xl px-6 py-10 text-center sm:px-10",
          className
        )}
      >
        {showLogo && (
          <Image
            src="/yucify-logo.png"
            alt="Yucify"
            width={148}
            height={44}
            className="mb-8 h-10 w-auto object-contain"
            priority
          />
        )}
        {children}
      </div>
    </main>
  );
}
