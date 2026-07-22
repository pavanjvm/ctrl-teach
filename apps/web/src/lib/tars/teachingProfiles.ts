export const TEACHING_PROFILE_CHANGED_EVENT = "ctrlteach:teaching-profile-changed";

export type TeachingProfileSource = {
  label: string;
  url: string;
};

export type TeachingProfile = {
  id: string;
  educator: string;
  name: string;
  years: string;
  origin: string;
  tagline: string;
  description: string;
  signature: string;
  methods: string[];
  bestFor: string[];
  voice: string;
  voiceNote: string;
  color: string;
  accent: string;
  sources: TeachingProfileSource[];
};

export type TeachingProfileCatalog = {
  profiles: TeachingProfile[];
  selectedProfileId: string | null;
  foundation: {
    title: string;
    description: string;
    principles: string[];
    source: TeachingProfileSource;
  };
  disclaimer: string;
};
