import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
import { GeistSans } from "geist/font/sans";
export const metadata: Metadata = {
  title: "Tournivo — Every Competition. Perfectly Organized.",
  description:
    "Your command center for sports and esports tournaments. Organize participants, fixtures, rulebooks and results in one place.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={GeistSans.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
