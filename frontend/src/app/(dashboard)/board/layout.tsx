import type { Metadata } from "next";
import "./board.css";

export const metadata: Metadata = {
    title: "Ctrl+Teach — Whiteboard Session",
    description: "Your AI-led whiteboard tutoring session.",
};

export default function BoardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
