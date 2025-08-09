"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5050/api";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function persistUserToBackend(idToken: string, fullName?: string) {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fullName: fullName || email.split("@")[0],
        }),
      });
      // 后端可能已存在用户——不作为致命错误
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn("register fallback:", data?.error || res.statusText);
      }
    } catch (e: any) {
      console.warn("register request failed (ignored):", e?.message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const cred =
        mode === "login"
          ? await signInWithEmailAndPassword(auth, email, password)
          : await createUserWithEmailAndPassword(auth, email, password);

      const idToken = await cred.user.getIdToken(true);

      // 统一存 fb_id_token（避免与之前 token 混用）
      localStorage.removeItem("token");
      localStorage.setItem("fb_id_token", idToken);

      if (mode === "register") {
        await persistUserToBackend(idToken);
      }

      router.push("/dashboard");
    } catch (err: any) {
      if (mode === "register" && err.code === "auth/email-already-in-use") {
        setError("user already exists, please login instead");
      } else if (mode === "login" && err.code === "auth/invalid-credential") {
        setError("invalid email or password");
      } else {
        setError(err?.message || "authentication failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleOAuth() {
    setError("");
    setSubmitting(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken(true);

      localStorage.removeItem("token");
      localStorage.setItem("fb_id_token", idToken);

      await persistUserToBackend(idToken, result.user.displayName || undefined);
      router.push("/dashboard");
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") {
        setError("login popup closed, please try again");
      } else if (err?.code === "auth/cancelled-popup-request") {
        setError("another login is in progress, please wait");
      } else {
        setError(err?.message || "Google sign-in failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* 背景霓虹光晕 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-3 rounded-2xl opacity-25 blur-xl
                   bg-[radial-gradient(360px_160px_at_20%_0%,rgba(37,244,238,.35),transparent),radial-gradient(360px_160px_at_80%_0%,rgba(254,44,85,.35),transparent)]"
      />
      <form onSubmit={handleSubmit} className="card relative space-y-4" autoComplete="on">
        {/* 标题胶囊 */}
        <div className="flex justify-center">
          <span className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-4 py-1.5 text-sm font-semibold">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </span>
        </div>

        {/* Email */}
        <label className="block">
          <span className="mb-1.5 block text-sm text-white/70">Email</span>
          <input
            type="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            disabled={submitting}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2.5
                       text-[var(--color-text)] placeholder:text-white/40
                       outline-none transition
                       focus:border-[var(--color-tcyan)] focus:ring-2 focus:ring-[var(--color-tcyan)]/25
                       disabled:opacity-60"
          />
        </label>

        {/* Password */}
        <label className="block">
          <span className="mb-1.5 block text-sm text-white/70">Password</span>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              disabled={submitting}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2.5
                         text-[var(--color-text)] placeholder:text-white/40
                         outline-none transition
                         focus:border-[var(--color-tpink)] focus:ring-2 focus:ring-[var(--color-tpink)]/25
                         disabled:opacity-60 pr-10"
            />
            <button
              type="button"
              aria-label={showPwd ? "Hide password" : "Show password"}
              onClick={() => setShowPwd((v) => !v)}
              className="absolute inset-y-0 right-2 my-auto h-8 px-2 rounded-lg
                         text-white/70 hover:text-white/90 bg-white/5 hover:bg-white/10 transition"
              disabled={submitting}
            >
              {showPwd ? "🙈" : "👁️"}
            </button>
          </div>
        </label>

        {/* 错误提示 */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full disabled:opacity-60"
        >
          {submitting
            ? mode === "login"
              ? "Logging in..."
              : "Signing up..."
            : mode === "login"
            ? "Login"
            : "Sign Up"}
        </button>

        {/* 分隔线 */}
        <div className="flex items-center gap-3 text-xs text-white/40">
          <div className="h-px flex-1 bg-white/10" />
          OR
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Google 登录 */}
        <button
          type="button"
          disabled={submitting}
          onClick={handleGoogleOAuth}
          className="w-full inline-flex items-center justify-center gap-2
                     rounded-xl border border-white/10 bg-black/20 px-4 py-2.5
                     font-semibold text-[var(--color-text)]
                     transition hover:bg-black/30 disabled:opacity-60"
        >
          <span className="text-lg">🔐</span>
          Continue with Google
        </button>

        {/* 协议提示 */}
        <p className="text-center text-xs text-white/40">
          By continuing, you agree to our Terms & Privacy Policy.
        </p>
      </form>
    </div>
  );
}