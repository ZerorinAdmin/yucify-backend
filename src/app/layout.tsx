import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yucify — Meta Ads intelligence Tool",
  description: "Ad monitoring and creative inspiration for Meta Ads",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
