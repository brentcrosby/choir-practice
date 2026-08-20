import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Choir Practice",
  description: "Interactive choir sheet-music practice player",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
