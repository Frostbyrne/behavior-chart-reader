import type { Metadata, Viewport } from "next";
import { Inter, Lexend } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Behavior Chart Reader",
  description: "Photograph daily behavior charts, check the reading, and send it to your Google Sheet.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1f2a44",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${lexend.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
