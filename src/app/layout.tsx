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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Doto:wght@500;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased bg-background text-foreground min-h-screen">
        {children}
      </body>
    </html>
  );
}
