import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smoke Show Golf | AI Swing Analysis",
  description: "The coach you need to smoke your drive. Upload your golf swing and get instant AI-powered analysis and a personalized training plan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-background text-foreground min-h-screen">
        {children}
      </body>
    </html>
  );
}
