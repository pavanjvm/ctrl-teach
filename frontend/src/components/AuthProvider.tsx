"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

import { API_URL } from "@/lib/constants";

type AuthUser = {
  uid: string;
  username: string;
  email?: string;
  displayName?: string;
  photoURL?: string | null;
};

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  signUp: async () => {},
  logout: async () => {},
  getToken: async () => null,
});

const AUTH_TOKEN_KEY = "ctrlteach_session_token";
const AUTH_USER_KEY = "ctrlteach_session_user";
const LEGACY_AUTH_TOKEN_KEY = "boardyboo_basic_auth";
const LEGACY_AUTH_USER_KEY = "boardyboo_user";

function saveAuth(token: string, user: AuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  // Older builds persisted reversible Basic credentials. Remove them whenever
  // auth state is touched so an upgrade cannot leave a password in storage.
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  localStorage.removeItem(LEGACY_AUTH_USER_KEY);
}

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
      localStorage.removeItem(LEGACY_AUTH_USER_KEY);
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      const stored = loadStoredUser();
      if (!token || !stored) {
        setLoading(false);
        return;
      }
      try {
        const res = await axios.get(`${API_URL}/api/users/me`, {
          headers: { Authorization: token },
        });
        const metadata = res.data?.metadata ?? {};
        const uid = res.data?.uid ?? stored.uid;
        const nextUser: AuthUser = {
          uid: String(uid),
          username: stored.username,
          email: metadata.email ?? stored.email,
          displayName: metadata.name ?? stored.displayName ?? stored.username,
          photoURL: metadata.picture ?? stored.photoURL ?? null,
        };
        saveAuth(token, nextUser);
        setUser(nextUser);
      } catch {
        clearAuth();
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  const login = async (username: string, password: string) => {
    const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
      username,
      password,
    });
    const rawToken = String(loginResponse.data?.access_token ?? "");
    if (!rawToken) throw new Error("Login did not return a session token.");
    const token = `Bearer ${rawToken}`;
    const canonicalUsername = String(
      loginResponse.data?.user?.username ?? username.trim(),
    );
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      await axios.post(
        `${API_URL}/api/users/sync`,
        { timezone: tz },
        { headers: { Authorization: token } }
      );
    } catch (error) {
      // A profile refresh should not invalidate an otherwise valid session.
      console.warn("Profile synchronization was skipped during sign-in.", error);
    }

    const res = await axios.get(`${API_URL}/api/users/me`, {
      headers: { Authorization: token },
    });
    const metadata = res.data?.metadata ?? {};
    const nextUser: AuthUser = {
      uid: String(res.data?.uid ?? ""),
      username: canonicalUsername,
      email: metadata.email ?? canonicalUsername,
      displayName: metadata.name ?? canonicalUsername,
      photoURL: metadata.picture ?? null,
    };
    saveAuth(token, nextUser);
    setUser(nextUser);
  };

  const signUp = async (username: string, password: string, displayName: string) => {
    await axios.post(`${API_URL}/api/auth/register`, {
      username,
      password,
      name: displayName,
      email: username,
    });
    await login(username, password);
  };

  const logout = async () => {
    clearAuth();
    setUser(null);
  };

  const getToken = async () => {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signUp, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
