import { Library } from "lucide-react";

export default function LibraryPage() {
    return (
        <div className="dash-page" style={{ height: '80%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--fg-muted)' }}>
            <Library size={48} style={{ opacity: 0.2, marginBottom: '24px' }} />
            <h1 className="dash-title" style={{ color: 'var(--fg-main)' }}>My Library</h1>
            <p className="dash-subtitle" style={{ maxWidth: '400px', margin: '0 auto' }}>
                Your past whiteboard sessions, saved AI summaries, and bookmarks will appear here. Coming soon!
            </p>
        </div>
    );
}
