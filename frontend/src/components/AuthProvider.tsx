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

const AUTH_TOKEN_KEY = "boardyboo_basic_auth";
const AUTH_USER_KEY = "boardyboo_user";

function makeBasicToken(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function saveAuth(token: string, user: AuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
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
    const token = makeBasicToken(username, password);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    await axios.post(
      `${API_URL}/api/users/sync`,
      { timezone: tz },
      { headers: { Authorization: token } }
    );

    const res = await axios.get(`${API_URL}/api/users/me`, {
      headers: { Authorization: token },
    });
    const metadata = res.data?.metadata ?? {};
    const nextUser: AuthUser = {
      uid: String(res.data?.uid ?? ""),
      username,
      email: metadata.email ?? username,
      displayName: metadata.name ?? username,
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
