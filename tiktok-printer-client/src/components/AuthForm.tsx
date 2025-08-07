"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

    async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const authFn =
        mode === "login"
        ? (credentials: { email: string; password: string }) =>
            supabase.auth.signInWithPassword(credentials)
        : (credentials: { email: string; password: string }) =>
            supabase.auth.signUp({ ...credentials, options: {} });

    const { data, error } = await authFn({ email, password });

    if (error) {
        if (mode === "register" && error.message.toLowerCase().includes("user already registered")) {
        setError("user already exists, please login instead");
        } else if (mode === "login" && error.message.toLowerCase().includes("invalid login credentials")) {
        setError("invalid email or password");
        } else {
        setError(error.message);
        }
        return;
    }

    if (!data.session) {
        setError("authentication failed, please try again");
        return;
    }

    localStorage.setItem("token", data.session.access_token);
    router.push("/dashboard");
    }
  async function handleGoogleOAuth() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/dashboard", 
      },
    });

    if (error) {
      setError(error.message);
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