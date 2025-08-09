"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

interface User {
  email?: string;
  name?: string;
  picture?: string;
}

const menuItems = [
  { label: "Monitor",   icon: "📊", href: "/dashboard" },
  { label: "Orders",    icon: "📦", href: "/dashboard/orders" },
  { label: "Shop",      icon: "🏪", href: "/dashboard/shop" },
  { label: "Templates", icon: "📄", href: "/dashboard/templates" },
  { label: "Settings",  icon: "⚙️", href: "/dashboard/settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 统一读取 fb_id_token（前面 AuthForm 已切换）
    const token = localStorage.getItem("fb_id_token");
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      // Firebase ID token 的 payload 字段不同，这里仅做占位显示
      setUser({
        email: payload?.email,
        name: payload?.name || payload?.user_name || "User",
        picture: payload?.picture,
      });
    } catch {
      // ignore
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("fb_id_token");
    router.push("/login");
  };

  return (
    <div className="tik-app flex min-h-screen">
      {/* ========== Sidebar ========== */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } transition-all duration-300 shrink-0`}
        aria-label="Sidebar"
      >
        <div className="relative h-full overflow-hidden rounded-none md:rounded-r-2xl border-r border-white/10 bg-black/30 backdrop-blur">
          {/* 霓虹装饰 */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-25 blur-2xl
                       bg-[conic-gradient(from_180deg_at_50%_50%,var(--color-tcyan),transparent, var(--color-tpink))]"
          />

          {/* Header / Toggle */}
          <div className="flex items-center justify-between px-3 py-3 border-b border-white/10">
            {sidebarOpen ? (
              <div className="font-semibold tracking-wide">
                TikTok&nbsp;Printer
              </div>
            ) : (
              <div className="text-xl">🅣</div>
            )}
            <button
              aria-label="Toggle sidebar"
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded-lg px-2 py-1 text-white/80 hover:text-white hover:bg-white/10 transition"
            >
              {sidebarOpen ? "◀" : "▶"}
            </button>
          </div>

          {/* Nav */}
          <nav className="p-2">
            <ul className="space-y-1">
              {menuItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={[
                        "group flex items-center gap-3 rounded-xl px-3 py-2 transition border",
                        active
                          ? "border-white/10 bg-white/10 text-[var(--color-text)] shadow-[0_0_0_2px_rgba(37,244,238,0.08)]"
                          : "border-white/5 hover:border-white/10 hover:bg-white/5 text-white/80",
                      ].join(" ")}
                    >
                      <span className="text-lg leading-none">{item.icon}</span>
                      {sidebarOpen && (
                        <span className={`font-medium ${active ? "" : "text-white/90"}`}>
                          {item.label}
                        </span>
                      )}
                      {active && sidebarOpen && (
                        <span className="ml-auto h-2 w-2 rounded-full"
                              style={{ background: "var(--color-tcyan)" }} />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User / Logout */}
          <div className="absolute inset-x-0 bottom-0 border-t border-white/10 p-3">
            <div className="flex items-center gap-3 mb-3">
              {user?.picture ? (
                <img src={user.picture} alt="Profile" className="h-10 w-10 rounded-full border border-white/10 object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-full grid place-items-center bg-white/10 border border-white/10">👤</div>
              )}
              {sidebarOpen && (
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
                  <p className="text-xs text-white/60 truncate">{user?.email || ""}</p>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-medium text-[var(--color-text)]
                         hover:bg-black/30 transition"
            >
              {sidebarOpen ? "Logout" : "🚪"}
            </button>
          </div>
        </div>
      </aside>

      {/* ========== Main ========== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/30 backdrop-blur">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-tpink)" }} />
              <span className="text-sm text-white/70">Dashboard</span>
            </div>
            <div className="hidden md:flex items-center gap-3 text-sm text-white/60">
              <span>Signed in</span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-tcyan)" }} />
            </div>
          </div>
        </header>

        {/* Content wrapper */}
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6">
            {/* 外层内容卡片，统一视觉 */}
            <div className="card">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}