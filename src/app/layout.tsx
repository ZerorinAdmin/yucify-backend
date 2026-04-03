import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { PostHogProvider } from "./providers";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";

export const metadata: Metadata = {
  title: "Yucify: Diagnose and fix your Meta ads",
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
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
          (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','1593095791958427');
          fbq('track','PageView');
        `}</Script>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=1593095791958427&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
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
