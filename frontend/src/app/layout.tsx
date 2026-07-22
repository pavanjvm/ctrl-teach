import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import GlobalTarsAssistant from "@/components/tars/GlobalTarsAssistant";
import TarsExtensionBridge from "@/components/tars/TarsExtensionBridge";
import { LearnerProvider } from "@/lib/learning/provider";
import { TarsProvider } from "@/lib/tars/provider";
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
        <script
          dangerouslySetInnerHTML={{
            __html: 'window.EXCALIDRAW_ASSET_PATH="/excalidraw-assets/";',
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <LearnerProvider>
            <TarsProvider>
              {children}
              <TarsExtensionBridge />
              <GlobalTarsAssistant />
            </TarsProvider>
          </LearnerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
