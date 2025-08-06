import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">Welcome to TikTok Print</h1>
        <p className="text-gray-600">Please log in or create an account to continue</p>
        <div className="flex justify-center gap-4">
          <Link
            href="/login"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="border border-black px-4 py-2 rounded hover:bg-gray-100"
          >
            Sign Up
          </Link>
        </div>
      </div>
    </main>
  );
}