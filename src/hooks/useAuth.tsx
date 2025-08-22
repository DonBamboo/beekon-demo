import { supabase } from "@/integrations/supabase/client";
import { Session, User, AuthError } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { debugAuth } from '@/lib/debug-utils';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  workspaceId: string | null;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Separate effect for auth state
  useEffect(() => {
    // Set up auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      debugAuth(
        `Auth state changed: ${event}`,
        {
          event,
          hasSession: !!session,
          userId: session?.user?.id,
          email: session?.user?.email,
        }
      );

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        debugAuth(
          `Failed to get initial session: ${error.message}`,
          { error: error.message },
          true
        );
      } else {
        debugAuth(
          'Initial session loaded',
          {
            hasSession: !!session,
            userId: session?.user?.id,
            email: session?.user?.email,
          }
        );
      }

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Separate effect for workspace fetching
  useEffect(() => {
    const fetchWorkspace = async () => {
      if (user?.id) {
        try {
          debugAuth(
            'Fetching user workspace',
            { userId: user.id }
          );

          const { data, error } = await supabase
            .schema("beekon_data")
            .from("workspaces")
            .select(`id`)
            .eq("owner_id", user.id)
            .limit(1)
            .single();

          if (error && error.code !== "PGRST116") {
            debugAuth(
              `Error fetching workspace: ${error.message}`,
              { userId: user.id, error: error.message, errorCode: error.code },
              true
            );
          } else if (data?.id) {
            debugAuth(
              'Workspace found',
              { userId: user.id, workspaceId: data.id }
            );
          } else {
            debugAuth(
              'No workspace found for user',
              { userId: user.id }
            );
          }

          setWorkspaceId(data?.id || null);
        } catch (error) {
          debugAuth(
            `Unexpected error fetching workspace: ${error instanceof Error ? error.message : String(error)}`,
            { userId: user.id, error: String(error) },
            true
          );
          setWorkspaceId(null);
        }
      } else {
        setWorkspaceId(null);
      }
    };

    fetchWorkspace();
  }, [user?.id]);

  // Add a function that can be called by WorkspaceProvider to sync workspace changes
  useEffect(() => {
    const handleWorkspaceSync = (event: CustomEvent<{ workspaceId: string | null }>) => {
      setWorkspaceId(event.detail.workspaceId);
    };

    window.addEventListener('workspaceChange', handleWorkspaceSync as EventListener);
    
    return () => {
      window.removeEventListener('workspaceChange', handleWorkspaceSync as EventListener);
    };
  }, []);

  const signUp = async (email: string, password: string) => {
    debugAuth(
      'Attempting user signup',
      { email, hasPassword: !!password }
    );

    const redirectUrl = `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      debugAuth(
        `Signup failed: ${error.message}`,
        { email, error: error.message, errorCode: error.name },
        true
      );
    } else {
      debugAuth(
        'Signup successful',
        { email }
      );
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    debugAuth(
      'Attempting user signin',
      { email, hasPassword: !!password }
    );

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      debugAuth(
        `Signin failed: ${error.message}`,
        { email, error: error.message, errorCode: error.name },
        true
      );
    } else {
      debugAuth(
        'Signin successful',
        { email }
      );
    }

    return { error };
  };

  const signOut = async () => {
    debugAuth(
      'Attempting user signout',
      { userId: user?.id }
    );

    const { error } = await supabase.auth.signOut();

    if (error) {
      debugAuth(
        `Signout failed: ${error.message}`,
        { userId: user?.id, error: error.message },
        true
      );
    } else {
      debugAuth(
        'Signout successful',
        { userId: user?.id }
      );
    }
  };

  const value = {
    user,
    session,
    workspaceId,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
