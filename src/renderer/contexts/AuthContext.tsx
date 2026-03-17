/**
 * AuthContext — управление аутентификацией.
 * Использует Supabase Auth (или мок) + keytar для безопасного хранения токенов.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authAPI } from "@/lib/api";
import { keytar, isElectron } from "@/lib/electron";

const KEYTAR_SERVICE = "redbit-drive";
const KEYTAR_ACCOUNT = "access-token";

interface User {
  id: string;
  email: string;
  user_metadata: {
    full_name?: string;
    role?: string;
  };
}

interface AuthContextType {
  user: User | null;
  session: any;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Восстанавливаем сессию при старте
  useEffect(() => {
    (async () => {
      try {
        // Пробуем восстановить из keytar (secure storage)
        if (isElectron()) {
          const storedToken = await keytar.get(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
          if (storedToken) {
            // Проверяем сессию через Supabase
            const { data } = await authAPI.getSession();
            if (data.session) {
              setSession(data.session);
              setUser(data.session.user as User);
              setIsLoading(false);
              return;
            }
          }
        }

        // Fallback: берём из localStorage (Supabase делает это автоматически)
        const { data } = await authAPI.getSession();
        if (data.session) {
          setSession(data.session);
          setUser(data.session.user as User);
        }
      } catch (err) {
        console.error("Failed to restore session:", err);
      } finally {
        setIsLoading(false);
      }
    })();

    // Подписываемся на изменения auth state
    const { data: { subscription } } = authAPI.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user as User ?? null);

      if (event === "SIGNED_IN" && newSession?.access_token && isElectron()) {
        await keytar.set(KEYTAR_SERVICE, KEYTAR_ACCOUNT, newSession.access_token);
      } else if (event === "SIGNED_OUT" && isElectron()) {
        await keytar.delete(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    const { data, error } = await authAPI.signIn(email, password);

    if (error) {
      return { error: error.message || "Ошибка входа" };
    }

    if (data.session && isElectron()) {
      await keytar.set(KEYTAR_SERVICE, KEYTAR_ACCOUNT, data.session.access_token);
    }

    // Для мок: сохраняем токен в localStorage
    if (data.session?.access_token === "mock-token") {
      localStorage.setItem("mock_session", "mock-token");
    }

    setSession(data.session);
    setUser(data.user as User);
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await authAPI.signOut();
    if (isElectron()) {
      await keytar.delete(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
    }
    localStorage.removeItem("mock_session");
    setSession(null);
    setUser(null);
  }, []);

  const isAdmin = user?.user_metadata?.role === "admin";

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
