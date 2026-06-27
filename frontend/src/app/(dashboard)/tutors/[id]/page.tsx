import { Play, GraduationCap, Star, ArrowLeft, ArrowRight, Lightbulb, Heart, Settings2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import "../../dashboard.css";

// This would typically fetch data based on the params.id
const tutorData = {
    id: "nova",
    name: "Nova",
    title: "Your personal guide to the cosmos and complex sciences.",
    image: "/personas/star.png",
    subjects: ["Astrophysics", "Quantum Mechanics", "Calculus"],
    stats: {
        sessions: "1,240",
        rating: "4.9/5"
    },
    styles: [
        {
            icon: <Lightbulb className="style-icon socratic" />,
            name: "Socratic Method",
            desc: "Nova asks guiding questions rather than giving direct answers, helping you build deep understanding."
        },
        {
            icon: <Heart className="style-icon encouraging" />,
            name: "Encouraging",
            desc: "Patient & supportive tone. Celebrates small wins and helps you navigate mistakes without judgment."
        }
    ]
};

export default async function TutorProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;
    return (
        <div className="dash-page tutor-profile-page">
            <div className="profile-top-nav">
                <Link href="/tutors" className="nav-back-btn">
                    <ArrowLeft size={16} /> Back to Tutors
                </Link>
            </div>

            <div className="profile-grid">
                {/* Left Column - Avatar & Stats */}
                <div className="profile-left">
                    <div className="profile-avatar-card">
                        <div className="status-badge">
                            <span className="status-dot"></span> Online & Ready
                        </div>
                        <div className="avatar-img-wrapper">
                            <Image src={tutorData.image} alt={tutorData.name} fill style={{ objectFit: 'contain' }} priority />
                        </div>
                        <div className="voice-sample-wrapper">
                            <button className="voice-btn">
                                <Play size={16} fill="currentColor" /> Listen to Voice Sample
                            </button>
                        </div>
                    </div>

                    <div className="profile-stats">
                        <div className="stat-card">
                            <GraduationCap className="stat-icon sessions" size={24} />
                            <h3>{tutorData.stats.sessions}</h3>
                            <span>SESSIONS</span>
                        </div>
                        <div className="stat-card">
                            <Star className="stat-icon rating" size={24} />
                            <h3>{tutorData.stats.rating}</h3>
                            <span>RATING</span>
                        </div>
                    </div>
                </div>

                {/* Right Column - Info & Customization */}
                <div className="profile-right">
                    <h1 className="profile-name">Meet {tutorData.name}</h1>
                    <p className="profile-title">{tutorData.title}</p>

                    <div className="profile-subjects">
                        {tutorData.subjects.map((sub, i) => (
                            <span key={i} className="subject-pill">
                                <span className="subject-icon">🧪</span> {sub}
                            </span>
                        ))}
                    </div>

                    <div className="profile-section">
                        <h3 className="section-title">
                            <div className="title-icon-wrapper"><Image src="/tutors-icon.svg" alt="icon" width={16} height={16} /></div> Teaching Style & Vibe
                        </h3>
                        <div className="styles-grid">
                            {tutorData.styles.map((style, i) => (
                                <div key={i} className="style-card">
                                    <div className={"style-icon-wrapper " + (i === 0 ? "socratic-bg" : "encouraging-bg")}>
                                        {style.icon}
                                    </div>
                                    <div className="style-details">
                                        <h4>{style.name}</h4>
                                        <p>{style.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="profile-section">
                        <div className="customize-header">
                            <h3 className="section-title">
                                <Settings2 size={20} className="text-primary" /> Customize Session
                            </h3>
                            <span className="settings-link">SETTINGS</span>
                        </div>

                        <div className="customize-card">
                            <div className="slider-group">
                                <div className="slider-label">
                                    <span><span className="slider-icon">⏱</span> Speaking Speed</span>
                                    <span className="slider-value">1.0x (Normal)</span>
                                </div>
                                <input type="range" className="tutor-slider speed-slider" defaultValue="50" min="0" max="100" />
                                <div className="slider-marks">
                                    <span>0.5x</span><span>2.0x</span>
                                </div>
                            </div>

                            <div className="slider-group">
                                <div className="slider-label">
                                    <span><span className="slider-icon">🔍</span> Explanation Depth</span>
                                    <span className="slider-value purple">Detailed</span>
                                </div>
                                <input type="range" className="tutor-slider depth-slider" defaultValue="100" min="0" max="100" />
                                <div className="slider-marks">
                                    <span>Simple Summary</span><span>Standard</span><span>Deep Dive</span>
                                </div>
                            </div>

                            <div className="start-session-wrapper">
                                <Link href="/board" className="start-btn">
                                    Start Learning with {tutorData.name} <ArrowRight size={18} />
                                </Link>
                                <p className="start-note">Free session includes 15 minutes of voice interaction.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
