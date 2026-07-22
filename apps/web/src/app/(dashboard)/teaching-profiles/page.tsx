"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL } from "@/lib/constants";
import {
  TEACHING_PROFILE_CHANGED_EVENT,
  type TeachingProfile,
  type TeachingProfileCatalog,
} from "@/lib/tars/teachingProfiles";

import "./teaching-profiles.css";


const TEACHING_PROFILES_ENABLED = false;


function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}


export default function TeachingProfilesPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [catalog, setCatalog] = useState<TeachingProfileCatalog | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null | undefined>(undefined);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!TEACHING_PROFILES_ENABLED) router.replace("/profile");
  }, [router]);

  useEffect(() => {
    if (!TEACHING_PROFILES_ENABLED) return;
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

  const focusProfile = useCallback((profileId: string, keyboardInitiated: boolean) => {
    setFocusedId(profileId);
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    window.requestAnimationFrame(() => {
      const detail = detailRef.current;
      detail?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (keyboardInitiated) detail?.focus({ preventScroll: true });
    });
  }, []);

  if (!TEACHING_PROFILES_ENABLED) return null;

  if (loading) {
    return (
      <div className="profiles-loading" role="status">
        <LoaderCircle size={22} className="profiles-spin" />
        Loading profiles…
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
      <header className="profiles-header">
        <div className="profiles-header-copy">
          <span className="profiles-eyebrow">Teaching profiles</span>
          <h1>Choose how Tars teaches<span>.</span></h1>
          <p>Pick the approach that fits how you learn.</p>
        </div>

        <div className="profiles-current" aria-live="polite">
          <div className="profiles-current-mark"><Check size={16} /></div>
          <div>
            <span>Active profile</span>
            <strong>{selectedProfile?.name ?? "Original Tars"}</strong>
          </div>
          {selectedProfile && (
            <button
              type="button"
              onClick={() => void selectProfile(null)}
              disabled={savingId !== undefined}
              title="Restore the original Tars teaching style"
            >
              <RotateCcw size={14} /> Use original
            </button>
          )}
        </div>
      </header>

      {error && <div className="profiles-alert" role="alert"><CircleAlert size={15} />{error}</div>}

      <div className="profiles-workspace">
        <section className="profiles-collection" aria-labelledby="profiles-list-title">
          <div className="profiles-section-heading">
            <h2 id="profiles-list-title">Profiles</h2>
            <span>{catalog.profiles.length} approaches</span>
          </div>

          <div className="profiles-grid" aria-label="Teaching profiles">
            {catalog.profiles.map((profile) => {
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
                    onClick={(event) => focusProfile(profile.id, event.detail === 0)}
                    aria-pressed={isFocused}
                  >
                    <div className="profile-card-topline">
                      <div className="profile-card-educator">
                        <span className="profile-monogram" aria-hidden="true">{initials(profile.educator)}</span>
                        <span>{profile.educator}</span>
                      </div>
                      {isSelected && <em><Check size={12} /> Active</em>}
                    </div>
                    <h3>{profile.name}</h3>
                    <p>{profile.tagline}</p>
                    <ChevronRight className="profile-card-arrow" size={17} aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        {focusedProfile && (
          <aside
            ref={detailRef}
            className="profile-detail"
            tabIndex={-1}
            aria-labelledby="profile-detail-title"
            style={{ "--profile-color": focusedProfile.color, "--profile-accent": focusedProfile.accent } as React.CSSProperties}
          >
            <div className="profile-detail-header">
              <div className="profile-detail-monogram" aria-hidden="true">{initials(focusedProfile.educator)}</div>
              <div>
                <span>{focusedProfile.educator}</span>
                <h2 id="profile-detail-title">{focusedProfile.name}</h2>
              </div>
            </div>

            <p className="profile-detail-tagline">{focusedProfile.tagline}</p>

            <button
              type="button"
              className={`profile-use-button ${selectedId === focusedProfile.id ? "active" : ""}`}
              onClick={() => void selectProfile(focusedProfile.id)}
              disabled={savingId !== undefined || selectedId === focusedProfile.id}
            >
              {savingId === focusedProfile.id
                ? <><LoaderCircle size={15} className="profiles-spin" /> Applying…</>
                : selectedId === focusedProfile.id
                  ? <><Check size={15} /> Active profile</>
                  : <><Check size={15} /> Use profile</>}
            </button>

            <section className="profile-detail-section" aria-labelledby="profile-methods-title">
              <h3 id="profile-methods-title">How Tars teaches</h3>
              <ul>
                {focusedProfile.methods.map((method) => (
                  <li key={method}><Check size={14} />{method}</li>
                ))}
              </ul>
            </section>

            <section className="profile-detail-section" aria-labelledby="profile-best-title">
              <h3 id="profile-best-title">Works well for</h3>
              <div className="profile-best-for">
                {focusedProfile.bestFor.map((item) => <span key={item}>{item}</span>)}
              </div>
            </section>

            <div className="profile-voice">
              <Headphones size={17} />
              <span><b>{focusedProfile.voiceNote}</b><small>Voice preview</small></span>
              <button
                type="button"
                onClick={() => togglePreview(focusedProfile)}
                aria-label={`${playingId === focusedProfile.id ? "Pause" : "Preview"} ${focusedProfile.voice} voice`}
                title={`${playingId === focusedProfile.id ? "Pause" : "Preview"} voice`}
              >
                {playingId === focusedProfile.id ? <Pause size={15} /> : <Play size={15} />}
              </button>
            </div>

            <details className="profile-research">
              <summary>Research and approach</summary>
              <p>{focusedProfile.description}</p>
              <p>{catalog.disclaimer}</p>
              <div className="profile-sources">
                {focusedProfile.sources.map((source) => (
                  <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                    {source.label}<ArrowUpRight size={12} />
                  </a>
                ))}
                <a href={catalog.foundation.source.url} target="_blank" rel="noreferrer">
                  Teaching approach guide <ArrowUpRight size={12} />
                </a>
              </div>
            </details>
          </aside>
        )}
      </div>
    </div>
  );
}
