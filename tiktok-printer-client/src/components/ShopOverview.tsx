"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
  status: string;
  platform: string;
  date: string;
}

export default function ShopOverview() {
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, [selectedPlatform]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      // Fetch stats from backend
      // const statsRes = await fetch(`/api/dashboard/stats?platform=${selectedPlatform}`, {
      //   headers: {
      //     Authorization: `Bearer ${token}`,
      //   },
      // });
      // const statsData = await statsRes.json();
      // setStats(statsData);

      // Fetch recent orders
      // const ordersRes = await fetch(`/api/dashboard/orders?platform=${selectedPlatform}`, {
      //   headers: {
      //     Authorization: `Bearer ${token}`,
      //   },
      // });
      // const ordersData = await ordersRes.json();
      // setRecentOrders(ordersData);

      setLoading(false);
    } catch (err) {
      setError("Failed to fetch dashboard data");
      setLoading(false);
    }
  };

  const handlePrintOrder = async (orderId: string) => {
    try {
      const token = localStorage.getItem("token");
      // const res = await fetch(`/api/orders/${orderId}/print`, {
      //   method: "POST",
      //   headers: {
      //     Authorization: `Bearer ${token}`,
      //   },
      // });
      // Handle print response
      console.log(`Printing order ${orderId}`);
    } catch (err) {
      console.error("Failed to print order:", err);
    }
  };

  const statCards = [
    {
      title: "Total Orders",
      value: stats?.totalOrders || 0,
      icon: "📦",
      color: "bg-blue-500",
    },
    {
      title: "Pending Orders",
      value: stats?.pendingOrders || 0,
      icon: "⏳",
      color: "bg-yellow-500",
    },
    {
      title: "Revenue",
      value: `$${stats?.revenue?.toFixed(2) || "0.00"}`,
      icon: "💰",
      color: "bg-green-500",
    },
    {
      title: "Customers",
      value: stats?.customers || 0,
      icon: "👥",
      color: "bg-purple-500",
    },
  ];

  const platforms = [
    { id: "all", name: "All Platforms", icon: "🌐" },
    { id: "tiktok", name: "TikTok", icon: "📱" },
    { id: "shopee", name: "Shopee", icon: "🛍️" },
    { id: "ozon", name: "Ozon", icon: "🎯" },
    { id: "shopify", name: "Shopify", icon: "🛒" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading dashboard data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchDashboardData}
          className="mt-2 text-sm text-red-600 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Shop Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Welcome back! Here's what's happening with your shop today.
        </p>
      </div>

      {/* Platform Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {platforms.map((platform) => (
          <button
            key={platform.id}
            onClick={() => setSelectedPlatform(platform.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              selectedPlatform === platform.id
                ? "bg-blue-500 text-white"
                : "bg-white border hover:bg-gray-50"
            }`}
          >
            <span>{platform.icon}</span>
            <span>{platform.name}</span>
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.title}
            className="bg-white rounded-xl shadow-sm p-6 border"
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className={`${card.color} text-white p-3 rounded-lg text-2xl`}
              >
                {card.icon}
              </div>
            </div>
            <h3 className="text-gray-600 text-sm">{card.title}</h3>
            <p className="text-2xl font-bold text-gray-800">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Orders Table */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Recent Orders</h2>
        </div>
        {recentOrders.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-4 font-medium text-gray-700">
                      Order ID
                    </th>
                    <th className="text-left p-4 font-medium text-gray-700">
                      Customer
                    </th>
                    <th className="text-left p-4 font-medium text-gray-700">
                      Platform
                    </th>
                    <th className="text-left p-4 font-medium text-gray-700">
                      Items
                    </th>
                    <th className="text-left p-4 font-medium text-gray-700">
                      Total
                    </th>
                    <th className="text-left p-4 font-medium text-gray-700">
                      Status
                    </th>
                    <th className="text-left p-4 font-medium text-gray-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-t hover:bg-gray-50">
                      <td className="p-4 font-medium">{order.id}</td>
                      <td className="p-4">{order.customer}</td>
                      <td className="p-4">{order.platform}</td>
                      <td className="p-4">{order.items}</td>
                      <td className="p-4">${order.total.toFixed(2)}</td>
                      <td className="p-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            order.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : order.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => handlePrintOrder(order.id)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t">
              <Link href="/dashboard/orders" className="text-blue-600 hover:text-blue-800 font-medium">
                View All Orders →
              </Link>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-gray-500">
            No orders found. Orders will appear here once they're synced from your platforms.
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/dashboard/orders"
          className="bg-white border rounded-xl p-6 hover:shadow-md transition-shadow text-left block"
        >
          <div className="text-3xl mb-3">🖨️</div>
          <h3 className="font-semibold mb-1">Print Orders</h3>
          <p className="text-sm text-gray-600">
            Print pending order tickets
          </p>
        </Link>
        <Link
          href="/dashboard/templates"
          className="bg-white border rounded-xl p-6 hover:shadow-md transition-shadow text-left block"
        >
          <div className="text-3xl mb-3">📋</div>
          <h3 className="font-semibold mb-1">Manage Templates</h3>
          <p className="text-sm text-gray-600">
            Customize your ticket designs
          </p>
        </Link>
        <button
          onClick={fetchDashboardData}
          className="bg-white border rounded-xl p-6 hover:shadow-md transition-shadow text-left"
        >
          <div className="text-3xl mb-3">🔄</div>
          <h3 className="font-semibold mb-1">Sync Platforms</h3>
          <p className="text-sm text-gray-600">
            Update orders from all platforms
          </p>
        </button>
      </div>
    </div>
  );
}