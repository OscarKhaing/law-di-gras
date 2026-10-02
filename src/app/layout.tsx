import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const sans = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Case Desk",
  description: "A personal injury case, digested: a brief for the firm and an update for the treating providers",
};

// Fonts, theme and providers only. The firm's pages add the sidebar in (firm)/layout.tsx; the
// provider's page under /p has none.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} h-full bg-background antialiased`}>
      <body className="min-h-full text-[15px] leading-relaxed">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
