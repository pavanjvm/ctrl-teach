import type { Metadata } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import GlobalClickyAssistant from "@/components/GlobalClickyAssistant";
import { LearnerProvider } from "@/lib/learner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ctrl+Teach — Training-as-a-Service, AI-led",
  description:
    "Turn any learning objective into a live AI-led course. Ctrl+Teach creates, curates, and delivers self-paced technical training with an AI instructor that speaks, draws, guides practice, and adapts to each learner.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          <LearnerProvider>
            {children}
            <GlobalClickyAssistant />
          </LearnerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
