import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
}

let _state: AuthState = { status: 'loading', session: null, user: null };
const listeners = new Set<() => void>();

function emit() { listeners.forEach(l => l()); }

function setState(next: AuthState) {
  _state = next;
  emit();
}

export function getAuth(): AuthState { return _state; }

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let _initialized = false;
export async function initAuth() {
  if (_initialized) return;
  _initialized = true;

  // Restore session from storage if present.
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    // Treat any session-fetch error as logged out.
    setState({ status: 'unauthenticated', session: null, user: null });
  } else if (data.session) {
    setState({ status: 'authenticated', session: data.session, user: data.session.user });
  } else {
    setState({ status: 'unauthenticated', session: null, user: null });
  }

  // Live updates: token refresh, sign in, sign out.
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      setState({ status: 'authenticated', session, user: session.user });
    } else {
      setState({ status: 'unauthenticated', session: null, user: null });
    }
  });
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
