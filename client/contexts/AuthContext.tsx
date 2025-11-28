import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { supabase } from "@/lib/supabaseClient";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "user";
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  manualLogin: (user: User) => void;   // ← NEW
  signup: (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const STORAGE_KEY = "careSync_user";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Convert Supabase session → User object
function buildUserFromSupabase(supaUser: any, fallbackEmail?: string): User {
  const meta = supaUser?.user_metadata || {};
  return {
    id: supaUser.id,
    email: supaUser.email ?? fallbackEmail ?? "",
    firstName: (meta.firstName as string) || "",
    lastName: (meta.lastName as string) || "",
    role: (meta.role as "admin" | "user") || "user",
    avatar: meta.avatar as string | undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on app load
  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const supaUser = data?.user;
        const stored = localStorage.getItem(STORAGE_KEY);

        if (supaUser) {
          let baseUser = buildUserFromSupabase(supaUser);
          if (stored) {
            const storedUser: User = JSON.parse(stored);
            baseUser = { ...baseUser, ...storedUser };
          }
          setUser(baseUser);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(baseUser));
        } else if (stored) {
          const storedUser: User = JSON.parse(stored);
          setUser(storedUser);
        }
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // 🔥 NEW: Manual login for backend API auth
  const manualLogin = (userData: User) => {
    setUser(userData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
  };

  // Supabase login
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);

      const userObj = buildUserFromSupabase(data.user, email);
      setUser(userObj);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userObj));
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string
  ) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            firstName,
            lastName,
            role: "user",
          },
        },
      });

      if (error) throw new Error(error.message);

      await login(email, password);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
      setUser(null);
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    if (!user) throw new Error("Not authenticated");

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { ...data, role: data.role || user.role },
      });

      if (error) throw new Error(error.message);

      const updatedUser: User = { ...user, ...data };
      setUser(updatedUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        manualLogin,   // ← EXPORTED
        signup,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
