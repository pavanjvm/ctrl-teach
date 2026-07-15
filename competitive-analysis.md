# Competitive Analysis — Ctrl+Teach vs The Market

---

## Direct Competitors (AI Course Creation Platforms)

### Coursebox (closest competitor)
**What they do:** AI course creator + LMS. Prompt or document → full course with quizzes, videos, flashcards, AI tutor. 300K courses created, 150K training providers. White-label available.

**Pricing:** Free tier → Creator $40/mo → Pro $300/mo → Business $750/mo → Enterprise custom.

**Features they have that Ctrl+Teach doesn't:**
- Full LMS (enrollments, progress tracking, certificates, SCORM)
- AI video generation (avatar + voiceover from script)
- AI grading system + rubrics
- AI flashcard generator
- White-label branded platform
- Compliance training templates (healthcare, hospitality verticals)
- Integration ecosystem (SCORM, SSO, API)
- Quiz types: multiple choice, drag & drop, open answer

**Where Ctrl+Teach beats them:**
- **Real-time voice interaction** — Coursebox AI tutor is chat-only. Tars talks back
- **Whiteboard drawing** — Coursebox has no visual explanation. Tars draws on Excalidraw
- **Screen-aware tutoring** — Tars sees what's on screen, can point at things. Coursebox is blind
- **Latency** — OpenAI Realtime API vs chatbot turn-taking

**Verdict:** Coursebox is a polished LMS with AI features. Ctrl+Teach is an AI tutor that happens to generate courses. Different DNA. Coursebox wins on platform completeness. Ctrl+Teach wins on teaching quality.

---

### Sana Labs
**What they do:** AI-native enterprise LMS. Content creation, knowledge management, semantic search, virtual classroom. Used by Spotify, ASICS, Polestar, Brex.

**Pricing:** Core plan ~$25K+/year (minimum 100 users). Enterprise custom.

**Features they have that Ctrl+Teach doesn't:**
- Enterprise LMS (SSO, SCORM, integrations with HRIS)
- Semantic search across all company knowledge
- Virtual classroom (live sessions)
- Analytics dashboard for L&D teams
- Content automation (auto-tag, categorize, update)
- Security/compliance features (SOC 2, GDPR)

**Where Ctrl+Teach beats them:**
- Sana's AI tutor is basic Q&A on uploaded docs. Tars is a real-time voice + drawing tutor
- Sana generates courses from docs but no interactive teaching. Ctrl+Teach generates AND teaches
- Tars's screen awareness means it can show you *on the actual tool* (Jira, ServiceNow) not just slides

**Verdict:** Sana competes with Docebo/Cornerstone for enterprise LMS dollars. They're not building a realtime AI tutor. Ctrl+Teach isn't an LMS — it's a teaching engine that could plug into one.

---

### Teachfloor
**What they do:** Cohort-based collaborative learning + AI. AI course generator, AI grading, peer learning. Focus on schools/nonprofits.

**Pricing:** ~$99-499/mo.

**Features they have that Ctrl+Teach doesn't:**
- Cohort-based schedules (start/end dates, group learning)
- Peer review built-in
- Community features (discussion, groups)
- AI grading + instructor feedback tools

**Where Ctrl+Teach beats them:**
- Tars is better for 1:1 tutoring than cohort lecture format
- Whiteboard for technical/diagram-heavy topics vs text-only cohort

---

### 360Learning, Docebo, Cornerstone, Absorb LMS
**What they do:** Traditional enterprise LMS adding AI features. Content recommendations, skill gap analysis, virtual coaching.

**Pricing:** $8-$45K+/year.

**Ctrl+Teach edge:**
- They're bolting AI onto legacy LMS architectures. Ctrl+Teach is AI-native + realtime voice + screen drawing. Totally different category.

---

### Khan Academy Khanmigo
**What they do:** AI tutor for K-12/college. Step-by-step guidance, Socratic questioning. Not for corporate training.

**Ctrl+Teach edge:** Corporate focus. Tars can point at real software (Jira, ServiceNow). Khanmigo can't.

---

## What Ctrl+Teach Is Missing vs Market

| Feature | Coursebox | Sana | Teachfloor | Ctrl+Teach |
|---|---|---|---|---|
| LMS (enrollments, tracking, certs) | ✅ | ✅ | ✅ | ❌ |
| AI course generation | ✅ | ✅ | ✅ | ✅ (basic) |
| AI quiz generation | ✅ | ✅ | ✅ | ❌ |
| AI video generation | ✅ | ❌ | ❌ | ❌ |
| White-label / branding | ✅ | ✅ | ✅ | ❌ |
| SCORM/integrations | ✅ | ✅ | ✅ | ❌ |
| Analytics dashboard | ✅ | ✅ | ✅ | ❌ |
| Real-time voice tutor | ❌ | ❌ | ❌ | ✅ |
| Whiteboard drawing | ❌ | ❌ | ❌ | ✅ |
| Screen-aware pointing | ❌ | ❌ | ❌ | ✅ |
| Group/cohort learning | ❌ | ✅ | ✅ | ❌ |
| Enterprise auth (SSO) | ✅ | ✅ | ❌ | ❌ |
| Compliance templates | ✅ | ✅ | ❌ | ❌ |
| Mobile app | ✅ | ✅ | ✅ | ❌ |

---

## Ctrl+Teach's Unique Moats

**1. Tars — real-time voice tutor with screen awareness**
Nobody in corporate training has this. Coursebox's AI tutor is a chatbot. Sana's is document Q&A. Ctrl+Teach talks to you, listens, points at things on screen, draws on a whiteboard. This is the killer feature.

**2. Whiteboard for technical training**
Explaining Kubernetes architecture? Jira workflow? SAFe PI planning? Drawing is better than slides. Excalidraw + AI voice explanation is unmatched.

**3. Low latency (OpenAI Realtime API)**
Sub-second voice turns. Market competitors use turn-based chat. Ctrl+Teach feels like a real conversation.

## Gaps to Fill (Weaknesses to Fix)

| Gap | Severity | What to do |
|---|---|---|
| No LMS | 🔴 Critical | Need basic: enrollments, progress, certs. Without this, no enterprise sale. |
| No quiz generation | 🔴 High | Should be easy — generate from course content. |
| No analytics | 🟡 Medium | Track time, topics, scores per user. Report to admins. |
| No certification | 🟡 Medium | Auto-generate cert on completion. Basic PDF or badge. |
| No integration | 🟡 Medium | SSO (Google/Microsoft), SCORM export for existing LMS. |
| No video generation | 🟢 Low | Nice-to-have. Tars voice is better than avatar video. |
| No group/cohort | 🟢 Low | Cprime's model is individual. Add later. |

---

## Market Positioning Recommendation

**Don't compete as an LMS.** Ctrl+Teach will never beat Coursebox or Sana on platform features. Instead:

**Position as "AI Tutor Engine"** — the best real-time AI teacher in the world. Plug into existing LMS (Cprime's, client's own). Generate courses + deliver them with a voice tutor that draws. Sell as an add-on that transforms dead course content into interactive learning.

**Two products:**
1. **Course Generator** — prompt → course outline + content + quizzes (catch up to Coursebox)
2. **Tars Tutor** — the real moat. Voice + whiteboard + screen-aware. Nobody else has this.

Customers buy #2. #1 is table stakes.
