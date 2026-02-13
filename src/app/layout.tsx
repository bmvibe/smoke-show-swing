import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Striped Golf | AI Swing Analysis",
  description: "Upload a video of your swing and we'll help you make the fixes to start striping that drive. Instant AI-powered analysis and personalized training plan.",
  metadataBase: new URL('https://striped.golf'),
  openGraph: {
    title: "Striped Golf | AI Swing Analysis",
    description: "Upload a video of your swing and we'll help you make the fixes to start striping that drive.",
    url: 'https://striped.golf',
    siteName: 'Striped Golf',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Striped Golf — AI Swing Analysis',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Striped Golf | AI Swing Analysis",
    description: "Upload a video of your swing and we'll help you make the fixes to start striping that drive.",
    images: ['/og-image.png'],
  },
  manifest: '/manifest.json',
  icons: {
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="theme-color" content="#0F1115" />
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
