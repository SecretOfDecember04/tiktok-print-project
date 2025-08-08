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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn("register fallback:", data?.error || res.statusText);
      }
    } catch (e) {
      console.warn("register request failed (ignored):", (e as any)?.message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const userCredential =
        mode === "login"
          ? await signInWithEmailAndPassword(auth, email, password)
          : await createUserWithEmailAndPassword(auth, email, password);

      const idToken = await userCredential.user.getIdToken(true);

      localStorage.removeItem("token");
      localStorage.setItem("fb_id_token", idToken);

      console.log(
        `${mode} ID token:`,
        idToken.slice(0, 8) + "..." + idToken.slice(-8)
      );

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

        console.log(
        "Google OAuth token:",
        idToken.slice(0, 8) + "..." + idToken.slice(-8)
        );

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
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 w-full max-w-md border p-6 rounded-xl shadow"
    >
      <h2 className="text-xl font-semibold text-center">
        {mode === "login" ? "Login" : "Sign Up"}
      </h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        disabled={submitting}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="border p-2 rounded w-full"
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        disabled={submitting}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="border p-2 rounded w-full"
      />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-black text-white py-2 rounded hover:opacity-90 disabled:opacity-60"
      >
        {submitting
          ? mode === "login"
            ? "Logging in..."
            : "Signing up..."
          : mode === "login"
          ? "Login"
          : "Sign Up"}
      </button>

      <button
        type="button"
        disabled={submitting}
        onClick={handleGoogleOAuth}
        className="border border-gray-400 rounded py-2 px-4 hover:bg-gray-100 disabled:opacity-60"
      >
        Continue with Google
      </button>
    </form>
  );
}