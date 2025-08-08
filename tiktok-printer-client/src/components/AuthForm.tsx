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

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      const userCredential =
        mode === "login"
          ? await signInWithEmailAndPassword(auth, email, password)
          : await createUserWithEmailAndPassword(auth, email, password);

      const token = await userCredential.user.getIdToken();
      localStorage.setItem("token", token);

      router.push("/dashboard");
    } catch (err: any) {
      if (mode === "register" && err.code === "auth/email-already-in-use") {
        setError("user already exists, please login instead");
      } else if (mode === "login" && err.code === "auth/invalid-credential") {
        setError("invalid email or password");
      } else {
        setError(err.message);
      }
    }
  }

  async function handleGoogleOAuth() {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      const token = await result.user.getIdToken();
      localStorage.setItem("token", token);

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
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
        onChange={(e) => setEmail(e.target.value)}
        required
        className="border p-2 rounded w-full"
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="border p-2 rounded w-full"
      />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        type="submit"
        className="bg-black text-white py-2 rounded hover:opacity-90"
      >
        {mode === "login" ? "Login" : "Sign Up"}
      </button>

      <button
        type="button"
        onClick={handleGoogleOAuth}
        className="border border-gray-400 rounded py-2 px-4 hover:bg-gray-100"
      >
        Continue with Google
      </button>
    </form>
  );
}