import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Andy D Enterprise",
  description: "Andy D Enterprise — Canada to Ghana Remittance Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
