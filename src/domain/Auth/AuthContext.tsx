import { router, SplashScreen } from "expo-router";
import { use, useEffect, useState, createContext, PropsWithChildren } from "react";
import { AuthUser } from "./AuthUser";
import { useStorage } from "@/src/infra/services/storage/StorageContext";

type AuthState = {
  authUser: AuthUser | null;
  isReady: boolean;
  saveAuthUser: (authUser: AuthUser) => Promise<void>;
  removeAuthUser: () => Promise<void>;
};

SplashScreen.preventAutoHideAsync();

export const AuthContext = createContext<AuthState>({
  authUser: null,
  isReady: false,
  saveAuthUser: async () => { },
  removeAuthUser: async () => { },
});

const AUTH_KEY = "AUTH_KEY";

export function AuthProvider({ children }: PropsWithChildren) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  const { storage } = useStorage();
  async function saveAuthUser(user: AuthUser) {
    await storage.setItem(AUTH_KEY, user);
    setAuthUser(user);
    router.replace("/");
  }

  async function removeAuthUser() {
    await storage.removeItem(AUTH_KEY);
    setAuthUser(null);
  }

  async function loadAuthUser() {
    try {
      const user = await storage.getItem<AuthUser>(AUTH_KEY);
      if (user) {
        setAuthUser(user);
      }
    } catch (error) {
      console.log(error);
    } finally {
      setIsReady(true);
    }
  }

  useEffect(() => {
    loadAuthUser();
  }, []);

  useEffect(() => {
    if (isReady) {
      SplashScreen.hide();
    }
  }, [isReady]);

  return (
    <AuthContext.Provider
      value={{ authUser, isReady, saveAuthUser, removeAuthUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = use(AuthContext);
  if (!context) {
    throw new Error("Auth Context should be used within an AuthProvider");
  }
  return context;
}