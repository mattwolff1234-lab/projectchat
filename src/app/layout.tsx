import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Creator DM Agent",
  description: "AI DM agent for SideShift creators",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
