"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import CountUp from "@/components/CountUp";

interface ShopStats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  revenue: number;
  products: number;
  customers: number;
}

interface Order {
  id: string;
  customer: string;
  items: number;
  total: number;
  status: "pending" | "completed" | "processing";
  platform: string;
  date: string;
}

export default function ShopOverview() {
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlatform]);

  async function fetchDashboardData() {
    try {
      setErr(null);
      setLoading(true);

      // 这里先用 demo 数据；接后端时把下面注释替换为真实请求
      await new Promise((r) => setTimeout(r, 400));
      setStats({
        totalOrders: 1284,
        pendingOrders: 42,
        completedOrders: 1187,
        revenue: 52342.88,
        products: 86,
        customers: 2310,
      });
      setRecentOrders([
        { id: "TT-100245", customer: "Emma", items: 3, total: 56.8, status: "pending",    platform: "TikTok", date: "2025-08-08" },
        { id: "TT-100244", customer: "John", items: 1, total: 18.0, status: "completed", platform: "TikTok", date: "2025-08-08" },
        { id: "TT-100243", customer: "Mia",  items: 2, total: 29.9, status: "processing",platform: "TikTok", date: "2025-08-08" },
      ]);

      setLoading(false);
    } catch {
      setErr("Failed to fetch dashboard data");
      setLoading(false);
    }
  }

  async function handlePrintOrder(orderId: string) {
    try {
      console.log("Printing order", orderId);
      // TODO: 调用后端打印
    } catch (e) {
      console.error(e);
    }
  }

  async function handleConnectTikTok() {
    try {
      // 统一优先从 Firebase 拿 token，退化用本地存的 fb_id_token
      const idToken =
        (await auth.currentUser?.getIdToken(true)) ||
        localStorage.getItem("fb_id_token");

      if (!idToken) {
        alert("请先登录");
        return;
      }

      const base = process.env.NEXT_PUBLIC_API_BASE_URL!;
      const res = await fetch(`${base}/shops/connect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("connect failed:", res.status, text);
        alert(`连接失败 (${res.status})`);
        return;
      }

      const data = await res.json();
      if (data?.authUrl) window.location.href = data.authUrl;
      else alert("获取授权地址失败");
    } catch (e) {
      console.error(e);
      alert("连接 TikTok 失败");
    }
  }

  const statCards = [
    { title: "Total Orders",   value: stats?.totalOrders ?? 0, icon: "📦", from: "#25F4EE", to: "#A155B9" },
    { title: "Pending Orders", value: stats?.pendingOrders ?? 0, icon: "⏳", from: "#FE2C55", to: "#A155B9" },
    // 注意：这里把 revenue 的 value 改为数字，格式交给 CountUp 处理
    { title: "Revenue",        value: stats?.revenue ?? 0,      icon: "💰", from: "#25F4EE", to: "#FE2C55" },
    { title: "Customers",      value: stats?.customers ?? 0,    icon: "👥", from: "#A155B9", to: "#25F4EE" },
  ] as const;

  const platforms = [
    { id: "all",    name: "All Platforms", icon: "🌐" },
    { id: "tiktok", name: "TikTok",        icon: "📱" },
    { id: "shopee", name: "Shopee",        icon: "🛍️" },
    { id: "ozon",   name: "Ozon",          icon: "🎯" },
    { id: "shopify",name: "Shopify",       icon: "🛒" },
  ];

  return (
    <div className="space-y-6">
      {/* 顶部：标题 + 连接按钮 */}
      <div className="card relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-20 blur-2xl"
          style={{ background: "conic-gradient(from 180deg, var(--color-tcyan), transparent, var(--color-tpink))" }}
        />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Shop Dashboard</h1>
            <p className="text-white/70 mt-2">Welcome back! Here’s what’s happening today.</p>
          </div>
          <button onClick={handleConnectTikTok} className="btn-primary inline-flex items-center gap-2">
            <span>Connect TikTok Shop</span>
            <span>⚡</span>
          </button>
        </div>
      </div>

      {/* 平台选择 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {platforms.map((p) => {
          const active = selectedPlatform === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setSelectedPlatform(p.id)}
              className={[
                "rounded-full px-4 py-2 text-sm whitespace-nowrap border backdrop-blur transition",
                active
                  ? "bg-white/10 border-white/10 text-[var(--color-text)]"
                  : "bg-black/20 border-white/5 text-white/80 hover:bg-white/5 hover:border-white/10",
              ].join(" ")}
            >
              <span className="mr-1">{p.icon}</span>
              <span className="font-medium">{p.name}</span>
            </button>
          );
        })}
      </div>

      {/* 统计卡片 */}
      {loading ? (
        <SkeletonStats />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div key={card.title} className="card relative overflow-hidden hover:-translate-y-0.5 hover:shadow-2xl transition">
              <div
                aria-hidden
                className="absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-25 blur-2xl"
                style={{ background: `linear-gradient(135deg, ${card.from}, ${card.to})` }}
              />
              <div className="relative mb-3 flex items-center justify-between">
                <div
                  className="rounded-xl p-3 text-2xl text-white shadow"
                  style={{ background: `linear-gradient(135deg, ${card.from}, ${card.to})` }}
                >
                  {card.icon}
                </div>
              </div>
              <h3 className="text-white/70 text-sm">{card.title}</h3>
              <p className="text-2xl font-bold mt-1">
                {card.title === "Revenue" ? (
                  <CountUp value={card.value} decimals={2} prefix="$" duration={1200} />
                ) : (
                  <CountUp value={card.value} duration={900} />
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 最近订单 */}
      <div className="card overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg md:text-xl font-semibold">Recent Orders</h2>
          <Link href="/dashboard/orders" className="text-sm font-medium" style={{ color: "var(--color-tcyan)" }}>
            View All →
          </Link>
        </div>

        {loading ? (
          <SkeletonTable />
        ) : recentOrders.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/80">
                <tr>
                  {["Order ID", "Customer", "Platform", "Items", "Total", "Status", "Actions"].map((h) => (
                    <th key={h} className="text-left p-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o, i) => (
                  <tr key={o.id} className={`border-t border-white/10 ${i % 2 ? "bg-white/0" : "bg-white/[0.02]"} hover:bg-white/[0.04]`}>
                    <td className="p-4 font-semibold">{o.id}</td>
                    <td className="p-4">{o.customer}</td>
                    <td className="p-4">{o.platform}</td>
                    <td className="p-4">{o.items}</td>
                    <td className="p-4">${o.total.toFixed(2)}</td>
                    <td className="p-4">
                      <span
                        className={[
                          "px-2.5 py-1 rounded-full text-xs font-medium",
                          o.status === "completed"
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : o.status === "pending"
                            ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            : "bg-sky-500/15 text-sky-300 border border-sky-500/30",
                        ].join(" ")}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => handlePrintOrder(o.id)}
                        className="font-medium hover:underline"
                        style={{ color: "var(--color-tcyan)" }}
                      >
                        Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-white/60">No orders found. They’ll appear once synced.</div>
        )}
      </div>

      {/* 快捷操作 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CardAction href="/dashboard/orders"   icon="🖨️" title="Print Orders"     desc="Print pending order tickets" />
        <CardAction href="/dashboard/templates" icon="📋" title="Manage Templates" desc="Customize your ticket designs" />
        <button onClick={fetchDashboardData} className="card text-left hover:-translate-y-0.5 transition">
          <div className="text-3xl mb-3">🔄</div>
          <h3 className="font-semibold mb-1">Sync Platforms</h3>
          <p className="text-sm text-white/70">Update orders from all platforms</p>
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      )}
    </div>
  );
}

/* ===== 小组件 / 骨架屏 ===== */

function CardAction({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <Link href={href} className="card block hover:-translate-y-0.5 transition">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-white/70">{desc}</p>
    </Link>
  );
}

function SkeletonStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="h-10 w-10 rounded-xl bg-white/10 mb-4" />
          <div className="h-3 w-24 bg-white/10 rounded mb-2" />
          <div className="h-6 w-32 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="p-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3 border-b border-white/10 animate-pulse">
          <div className="h-4 w-28 bg-white/10 rounded" />
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-4 w-20 bg-white/10 rounded" />
          <div className="h-4 w-16 bg-white/10 rounded" />
          <div className="h-4 w-16 bg-white/10 rounded" />
          <div className="h-6 w-20 bg-white/10 rounded-full ml-auto" />
        </div>
      ))}
    </div>
  );
}