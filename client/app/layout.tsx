import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Midex Client",
  description: "Midex client application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

