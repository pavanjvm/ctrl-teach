"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { API_URL } from "@/lib/constants";
import {
  TEACHING_PROFILE_CHANGED_EVENT,
  type TeachingProfile,
  type TeachingProfileCatalog,
} from "@/lib/teachingProfiles";

import "./teaching-profiles.css";


function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}


export default function TeachingProfilesPage() {
  const { getToken } = useAuth();
  const [catalog, setCatalog] = useState<TeachingProfileCatalog | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null | undefined>(undefined);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${API_URL}/api/teaching-profiles`, {
          headers: token ? { Authorization: token } : undefined,
        });
        if (!response.ok) throw new Error("Teaching profiles could not be loaded.");
        const nextCatalog = (await response.json()) as TeachingProfileCatalog;
        if (cancelled) return;
        setCatalog(nextCatalog);
        setSelectedId(nextCatalog.selectedProfileId);
        setFocusedId(nextCatalog.selectedProfileId ?? nextCatalog.profiles[0]?.id ?? null);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Something went wrong.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [getToken]);

  const focusedProfile = useMemo(
    () => catalog?.profiles.find((profile) => profile.id === focusedId) ?? null,
    [catalog, focusedId],
  );
  const selectedProfile = useMemo(
    () => catalog?.profiles.find((profile) => profile.id === selectedId) ?? null,
    [catalog, selectedId],
  );

  const selectProfile = useCallback(async (profileId: string | null) => {
    setSavingId(profileId);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/teaching-profiles/selection`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({ profileId }),
      });
      if (!response.ok) throw new Error("The teaching profile could not be saved.");
      const payload = await response.json() as { selectedProfileId: string | null };
      setSelectedId(payload.selectedProfileId);
      window.dispatchEvent(new CustomEvent(TEACHING_PROFILE_CHANGED_EVENT, {
        detail: { profileId: payload.selectedProfileId },
      }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong.");
    } finally {
      setSavingId(undefined);
    }
  }, [getToken]);

  const togglePreview = useCallback((profile: TeachingProfile) => {
    if (playingId === profile.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(`/audio/roleplay-voices/${profile.voice}.wav`);
    audioRef.current = audio;
    audio.addEventListener("ended", () => setPlayingId(null), { once: true });
    audio.addEventListener("error", () => setPlayingId(null), { once: true });
    setPlayingId(profile.id);
    void audio.play().catch(() => setPlayingId(null));
  }, [playingId]);

  if (loading) {
    return (
      <div className="profiles-loading" role="status">
        <LoaderCircle size={22} className="profiles-spin" />
        Curating the profile library…
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="profiles-loading profiles-error" role="alert">
        <CircleAlert size={22} />
        {error || "Teaching profiles are unavailable."}
      </div>
    );
  }

  return (
    <div className="profiles-page">
      <header className="profiles-hero">
        <div className="profiles-kicker"><span>Curated library</span><i />Historical teaching approaches</div>
        <div className="profiles-hero-grid">
          <div>
            <h1>Choose how Tars teaches.</h1>
            <p>
              A Teaching Profile changes the way Tars explains, questions, encourages,
              and gives feedback—across the whiteboard, courses, and Live Classroom.
            </p>
          </div>
          <div className="profiles-active" aria-live="polite">
            <span className="profiles-active-label"><i /> Active everywhere</span>
            <strong>{selectedProfile?.name ?? "Original Tars"}</strong>
            <small>
              {selectedProfile
                ? `Inspired by ${selectedProfile.educator} · ${selectedProfile.voiceNote}`
                : "Tars's balanced, supportive default teaching style"}
            </small>
            {selectedProfile && (
              <button
                type="button"
                onClick={() => void selectProfile(null)}
                disabled={savingId !== undefined}
              >
                <RotateCcw size={13} /> Restore original
              </button>
            )}
          </div>
        </div>
      </header>

      {error && <div className="profiles-alert" role="alert"><CircleAlert size={15} />{error}</div>}

      <section className="profiles-foundation" aria-labelledby="sticky-foundation-title">
        <div className="profiles-foundation-mark"><Sparkles size={18} /></div>
        <div>
          <span>Shared teaching craft</span>
          <h2 id="sticky-foundation-title">{catalog.foundation.title}</h2>
          <p>{catalog.foundation.description}</p>
        </div>
        <div className="profiles-principles" aria-label="Made to Stick principles">
          {catalog.foundation.principles.map((principle, index) => (
            <span key={principle}><b>{String(index + 1).padStart(2, "0")}</b>{principle}</span>
          ))}
        </div>
      </section>

      <div className="profiles-library-heading">
        <div>
          <span>01 / The collection</span>
          <h2>Nine approaches. One Tars.</h2>
        </div>
        <p>Select a card to inspect its teaching behavior, strengths, voice, and research basis.</p>
      </div>

      <div className="profiles-workspace">
        <section className="profiles-grid" aria-label="Curated teaching profiles">
          {catalog.profiles.map((profile, index) => {
            const isSelected = selectedId === profile.id;
            const isFocused = focusedId === profile.id;
            return (
              <article
                className={`profile-card ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
                key={profile.id}
                style={{ "--profile-color": profile.color, "--profile-accent": profile.accent } as React.CSSProperties}
              >
                <button
                  type="button"
                  className="profile-card-main"
                  onClick={() => setFocusedId(profile.id)}
                  aria-pressed={isFocused}
                >
                  <div className="profile-card-topline">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {isSelected && <em><Check size={12} /> Active</em>}
                  </div>
                  <div className="profile-monogram" aria-hidden="true">{initials(profile.educator)}</div>
                  <div className="profile-card-copy">
                    <span>{profile.educator}</span>
                    <h3>{profile.name}</h3>
                    <p>{profile.tagline}</p>
                  </div>
                  <div className="profile-card-methods">
                    {profile.methods.slice(0, 2).map((method) => <span key={method}>{method}</span>)}
                  </div>
                </button>
              </article>
            );
          })}
        </section>

        {focusedProfile && (
          <aside
            className="profile-detail"
            style={{ "--profile-color": focusedProfile.color, "--profile-accent": focusedProfile.accent } as React.CSSProperties}
          >
            <div className="profile-detail-portrait">
              <span>{focusedProfile.years}</span>
              <strong aria-hidden="true">{initials(focusedProfile.educator)}</strong>
              <small>{focusedProfile.origin}</small>
            </div>
            <div className="profile-detail-copy">
              <span className="profile-detail-eyebrow">{focusedProfile.educator}</span>
              <h2>{focusedProfile.name}</h2>
              <p>{focusedProfile.description}</p>
              <div className="profile-principle">
                <small>Profile principle</small>
                <p>{focusedProfile.signature}</p>
              </div>

              <div className="profile-detail-section">
                <span>How Tars will teach</span>
                <ul>{focusedProfile.methods.map((method) => <li key={method}>{method}</li>)}</ul>
              </div>

              <div className="profile-detail-section">
                <span>Especially useful for</span>
                <div className="profile-best-for">
                  {focusedProfile.bestFor.map((item) => <span key={item}>{item}</span>)}
                </div>
              </div>

              <div className="profile-voice">
                <div><Headphones size={16} /><span><b>{focusedProfile.voiceNote}</b><small>Tars voice · {focusedProfile.voice}</small></span></div>
                <button type="button" onClick={() => togglePreview(focusedProfile)} aria-label={`${playingId === focusedProfile.id ? "Pause" : "Preview"} ${focusedProfile.voice} voice`}>
                  {playingId === focusedProfile.id ? <Pause size={14} /> : <Play size={14} />}
                </button>
              </div>

              <button
                type="button"
                className={`profile-use-button ${selectedId === focusedProfile.id ? "active" : ""}`}
                onClick={() => void selectProfile(focusedProfile.id)}
                disabled={savingId !== undefined || selectedId === focusedProfile.id}
              >
                {savingId === focusedProfile.id
                  ? <><LoaderCircle size={15} className="profiles-spin" /> Applying profile</>
                  : selectedId === focusedProfile.id
                    ? <><Check size={15} /> Active across Tars</>
                    : <>Use this teaching profile <ArrowUpRight size={15} /></>}
              </button>

              <div className="profile-sources">
                <span>Research basis</span>
                {focusedProfile.sources.map((source) => (
                  <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                    {source.label}<ArrowUpRight size={12} />
                  </a>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>

      <footer className="profiles-disclaimer">
        <span>Editorial note</span>
        <p>{catalog.disclaimer} Profiles adapt documented methods into modern AI behavior with explicit safety boundaries.</p>
        <a href={catalog.foundation.source.url} target="_blank" rel="noreferrer">
          View the Made to Stick teaching guide <ArrowUpRight size={12} />
        </a>
      </footer>
    </div>
  );
}
