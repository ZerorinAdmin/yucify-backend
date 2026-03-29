import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { PostHogProvider } from "./providers";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";

export const metadata: Metadata = {
  title: "Yucify — Meta Ads intelligence Tool",
  description: "Ad monitoring and creative inspiration for Meta Ads",
  icons: {
    icon: "/yucify-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Script id="crisp-init" strategy="beforeInteractive">{`
          window.$crisp=[];window.CRISP_WEBSITE_ID="a6d21380-1870-499b-9012-e406e1bbf60b";
        `}</Script>
        <Script
          id="crisp-script"
          src="https://client.crisp.chat/l.js"
          strategy="afterInteractive"
        />
        <ChunkLoadRecovery />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
