import { useEffect, useState, useSyncExternalStore } from "react";
import { auth, db } from "@/lib/firebase";
import {
  EmailAuthProvider,
  isSignInWithEmailLink,
  linkWithCredential,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailLink,
  User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

/**
 * Silent data safeguard + optional account recovery for صوتی بقیہ.
 *
 * The app opens straight into the ledger, so there is no login screen and no
 * account to create. Firestore rules still scope every read and write to
 * `users/{uid}`, so the device mints an anonymous Firebase session in the
 * background. The user never sees it; it only keeps the same uid the device
 * already had, which is what makes the existing cloud data reachable.
 *
 * The catch with an anonymous session is that its uid belongs to one browser:
 * a new phone (or cleared site data) mints a *different* uid and can never see
 * the old `users/{uid}` documents. Optional email-link sign-in closes that gap
 * **without changing the uid** — the anonymous account is linked to the email
 * (`linkWithCredential` + `EmailAuthProvider.credentialWithLink`), so the same
 * khata becomes reachable from another device by opening a fresh link there.
 *
 * Local-first: if anonymous sign-in is unavailable (offline, disabled), the
 * ledger keeps working on-device and `isAuthenticated` stays false so cloud
 * actions degrade instead of blocking the UI.
 */

export interface AppUser {
  uid: string;
  name?: string;
  /** Set once the account has been linked to (or signed in with) an email. */
  email?: string;
  isAnonymous?: boolean;
}

const GUEST_NAME = "مہمان صارف";

/**
 * Where the address is remembered between "send the link" and "the link is
 * opened". Firebase requires the same email at completion time; storing it
 * locally means the user does not have to type it twice. It is not a secret —
 * the sign-in itself is proven by the one-time code in the link.
 */
const EMAIL_STORAGE_KEY = "sauti_email_for_link";

function mapUser(fbUser: FirebaseUser): AppUser {
  return {
    uid: fbUser.uid,
    name: fbUser.displayName || GUEST_NAME,
    email: fbUser.email ?? undefined,
    isAnonymous: fbUser.isAnonymous,
  };
}

/**
 * One bootstrap at a time: StrictMode double-mounts and several hooks call
 * `useAuth` simultaneously, and concurrent `signInAnonymously` calls would
 * otherwise race to create more than one identity.
 */
let bootstrap: Promise<boolean> | null = null;

function ensureAnonymousSession(): Promise<boolean> {
  if (auth.currentUser) return Promise.resolve(true);
  if (!bootstrap) {
    bootstrap = signInAnonymously(auth)
      .then(() => true)
      .catch(() => {
        bootstrap = null;
        return false;
      });
  }
  return bootstrap;
}

/* ------------------------------------------------------------------ */
/* Shared email-link state                                             */
/* ------------------------------------------------------------------ */

/*
 * `useAuth` is consumed by three hooks (the page, sync and parties). The
 * one-time email link may only be redeemed **once**, so the busy/message
 * state and the one-shot guard live at module scope and every consumer
 * subscribes to the same values instead of each running its own attempt.
 */
let accountBusyState = false;
let accountMessageState: string | null = null;
let accountToneState: "ok" | "error" = "ok";
let completionStarted = false;
const accountListeners = new Set<() => void>();

function emitAccount(next: {
  busy?: boolean;
  message?: string | null;
  tone?: "ok" | "error";
}) {
  if (next.busy !== undefined) accountBusyState = next.busy;
  if (next.message !== undefined) accountMessageState = next.message;
  if (next.tone !== undefined) accountToneState = next.tone;
  for (const listener of accountListeners) listener();
}

function subscribeAccount(listener: () => void) {
  accountListeners.add(listener);
  return () => {
    accountListeners.delete(listener);
  };
}

const getAccountBusy = () => accountBusyState;
const getAccountMessage = () => accountMessageState;
const getAccountTone = () => accountToneState;

/** Memoised URL check: the link parameters never change during a page load. */
let pendingState: boolean | null = null;
function isEmailLinkOpen(): boolean {
  if (pendingState !== null) return pendingState;
  try {
    pendingState = isSignInWithEmailLink(auth, window.location.href);
  } catch {
    pendingState = false;
  }
  return pendingState;
}

/** Removes the one-time sign-in parameters so a reload cannot replay them. */
function clearLinkParams() {
  try {
    const url = new URL(window.location.href);
    ["apiKey", "oobCode", "mode", "lang", "continueUrl"].forEach((key) =>
      url.searchParams.delete(key),
    );
    const search = url.searchParams.toString();
    window.history.replaceState(
      {},
      document.title,
      `${url.pathname}${search ? `?${search}` : ""}${url.hash}`,
    );
  } catch {
    /* history may be unavailable in exotic webviews — the link is still used */
  }
}

function readStoredEmail(): string {
  try {
    return (localStorage.getItem(EMAIL_STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function storeEmail(email: string) {
  try {
    if (email) localStorage.setItem(EMAIL_STORAGE_KEY, email);
    else localStorage.removeItem(EMAIL_STORAGE_KEY);
  } catch {
    /* storage full/disabled: completion will ask for the address again */
  }
}

/** Urdu explanation for the failure modes a shopkeeper can actually hit. */
function describeAuthError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/invalid-email":
      return "ای میل درست نہیں ہے — دوبارہ لکھیں۔";
    case "auth/expired-action-code":
      return "یہ لنک پرانا ہو گیا ہے — نیا لنک بھیجیں۔";
    case "auth/invalid-action-code":
      return "یہ لنک استعمال ہو چکا یا درست نہیں — نیا لنک بھیجیں۔";
    case "auth/network-request-failed":
      return "انٹرنیٹ نہیں مل رہا — کنکشن چیک کر کے دوبارہ کوشش کریں۔";
    case "auth/too-many-requests":
      return "بہت بار کوشش ہوئی — کچھ دیر بعد دوبارہ کریں۔";
    case "auth/operation-not-allowed":
      return "ای میل لنک سہولت ابھی Firebase میں فعال نہیں — ایڈمن سے کہیں کہ Email link آن کرے۔";
    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
      return "یہ ویب ایڈریس Firebase میں مجاز نہیں — ایڈمن Authorized domains چیک کرے۔";
    default:
      return "کھاتہ محفوظ نہیں ہو سکا — دوبارہ کوشش کریں۔";
  }
}

export type EmailLinkResult = { ok: boolean; message: string };

/**
 * Redeems the one-time link.
 *
 * Order matters:
 *  1. If this browser is on an anonymous session, the email is *linked* to
 *     it, so the uid — and every `users/{uid}` document — stays the same.
 *  2. If that email already belongs to another account (the "new phone"
 *     case), linking is impossible by design; the credential is used to
 *     sign in to the existing account instead. Nothing is deleted: local
 *     entries stay on the device and are uploaded to the recovered account
 *     by the normal sync path.
 */
async function finishEmailLink(email: string): Promise<EmailLinkResult> {
  if (completionStarted) {
    return { ok: false, message: "یہ لنک پہلے ہی استعمال ہو چکا ہے۔" };
  }
  completionStarted = true;
  emitAccount({ busy: true, message: null });

  try {
    const href = window.location.href;
    const credential = EmailAuthProvider.credentialWithLink(email, href);
    let linked = true;

    /* A permanently signed-in browser must never silently switch accounts:
       the device's local ledger would then be uploaded into a different
       account. Only the anonymous → linked transition is automatic. */
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      const currentEmail = auth.currentUser.email ?? "";
      clearLinkParams();
      pendingState = false;
      if (currentEmail === email) {
        storeEmail("");
        const message = "یہ کھاتہ پہلے ہی اس ای میل سے محفوظ ہے۔";
        emitAccount({ busy: false, message, tone: "ok" });
        return { ok: true, message };
      }
      completionStarted = false;
      const message =
        "یہ براؤزر پہلے ہی دوسرے کھاتے سے جڑا ہے — پہلے اُس کھاتے سے الگ ہوں، پھر نیا لنک کھولیں۔";
      emitAccount({ busy: false, message, tone: "error" });
      return { ok: false, message };
    }

    if (auth.currentUser?.isAnonymous) {
      try {
        await linkWithCredential(auth.currentUser, credential);
      } catch (error) {
        const code = (error as { code?: string } | null)?.code ?? "";
        const alreadyOwned =
          code === "auth/email-already-in-use" ||
          code === "auth/credential-already-in-use";
        if (!alreadyOwned) throw error;
        // Another account owns this email: open it rather than fail.
        linked = false;
        try {
          await signInWithCredential(auth, credential);
        } catch {
          await signInWithEmailLink(auth, email, href);
        }
      }
    } else {
      linked = false;
      try {
        await signInWithEmailLink(auth, email, href);
      } catch {
        await signInWithCredential(auth, credential);
      }
    }

    storeEmail("");
    clearLinkParams();
    pendingState = false;
    const message = linked
      ? "کھاتہ ای میل سے محفوظ ہو گیا — نئے فون پر اسی ای میل سے سائن اِن کر کے پورا کھاتہ مل جائے گا۔"
      : "پرانا کھاتہ کھل گیا — کلاؤڈ سے ڈیٹا خود لوڈ ہو رہا ہے۔";
    emitAccount({ busy: false, message, tone: "ok" });
    return { ok: true, message };
  } catch (error) {
    completionStarted = false;
    const message = describeAuthError(error);
    emitAccount({ busy: false, message, tone: "error" });
    return { ok: false, message };
  }
}

/** Sends the one-time sign-in link, or completes an already-opened one. */
export async function submitEmail(email: string): Promise<EmailLinkResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    const message = "پہلے اپنا ای میل لکھیں۔";
    emitAccount({ busy: false, message, tone: "error" });
    return { ok: false, message };
  }
  if (isEmailLinkOpen()) {
    return finishEmailLink(trimmed);
  }

  emitAccount({ busy: true, message: null });
  try {
    await sendSignInLinkToEmail(auth, trimmed, {
      // The app is a single-page bundle; the link returns to its root and
      // the one-time code is read from the query string on load.
      url: `${window.location.origin}/?emailSignIn=1`,
      handleCodeInApp: true,
    });
    storeEmail(trimmed);
    const message =
      "لنک بھیج دیا گیا — ای میل کھول کر «سائن اِن» پر کلک کریں، پھر یہیں واپس آئیں۔";
    emitAccount({ busy: false, message, tone: "ok" });
    return { ok: true, message };
  } catch (error) {
    const message = describeAuthError(error);
    emitAccount({ busy: false, message, tone: "error" });
    return { ok: false, message };
  }
}

export function useAuth() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const accountBusy = useSyncExternalStore(subscribeAccount, getAccountBusy, () => false);
  const accountMessage = useSyncExternalStore(
    subscribeAccount,
    getAccountMessage,
    () => null,
  );
  const accountMessageTone = useSyncExternalStore(
    subscribeAccount,
    getAccountTone,
    () => "ok" as const,
  );
  const emailLinkPending = useSyncExternalStore(
    subscribeAccount,
    isEmailLinkOpen,
    () => false,
  );

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      if (cancelled) return;

      if (!fbUser) {
        // No session yet: mint the silent anonymous one. Loading stays true
        // until it resolves so consumers do not treat this as "denied".
        void ensureAnonymousSession().then((ok) => {
          if (!cancelled && !ok) setIsLoading(false);
        });
        return;
      }

      const mappedUser = mapUser(fbUser);
      setUser(mappedUser);
      setIsLoading(false);

      // Audit #26: only anonymous sessions need a profile document.
      if (fbUser.isAnonymous) {
        void ensureUserProfile(fbUser, mappedUser);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /** Resumes a link that was opened after a reload, without asking twice. */
  useEffect(() => {
    if (!isEmailLinkOpen()) return;
    const stored = readStoredEmail();
    if (!stored) return;
    /* Deferred by a tick so Firebase's own session bootstrap settles first;
       `finishEmailLink` is module-guarded, so extra consumers are harmless. */
    const timer = window.setTimeout(() => void finishEmailLink(stored), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return {
    isLoading,
    isAuthenticated: Boolean(user),
    user,
    emailLinkPending,
    accountBusy,
    accountMessage,
    accountMessageTone,
    submitEmail,
  };
}

/** Writes the profile doc once per uid (local-first: failures never block). */
async function ensureUserProfile(fbUser: FirebaseUser, mappedUser: AppUser) {
  try {
    const userRef = doc(db, "users", fbUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        id: fbUser.uid,
        name: mappedUser.name,
        isAnonymous: fbUser.isAnonymous,
        createdAt: Date.now(),
      });
    }
  } catch {
    // Offline or restricted mode — the ledger keeps working locally.
  }
}
