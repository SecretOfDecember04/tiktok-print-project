import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      {/* 外层带轻微光晕的卡片 */}
      <div className="relative w-full max-w-md">
        <div className="absolute -inset-2 rounded-3xl bg-[radial-gradient(400px_200px_at_20%_-20%,rgba(37,244,238,0.20),transparent),radial-gradient(300px_160px_at_80%_-30%,rgba(254,44,85,0.20),transparent)] blur-2xl" />
        <div className="relative card text-center space-y-5">
          {/* 标题徽章 */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl opacity-30 bg-[linear-gradient(90deg,#25F4EE,#FE2C55)] blur-md" />
              <div className="relative rounded-xl border px-4 py-1.5 text-sm font-semibold">
                TikTok Print
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-semibold leading-tight">Welcome to TikTok Print</h1>
          <p className="text-gray-300">Please log in or create an account to continue</p>

          <div className="flex justify-center gap-3 pt-2">
            <Link href="/login" className="btn-primary">
              Login
            </Link>
            <Link
              href="/signup"
              className="rounded-xl border border-white/20 px-4 py-2 font-semibold transition
                         hover:bg-white/5"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}