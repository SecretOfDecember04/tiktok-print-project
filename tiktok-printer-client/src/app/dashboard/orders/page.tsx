"use client";

import DashboardLayout from "@/components/DashboardLayout";

export default function OrdersPage() {
  return (
    <DashboardLayout>
      <div className="bg-white rounded-xl shadow-sm border p-8">
        <h1 className="text-2xl font-bold mb-4">Orders Management</h1>
        <p className="text-gray-600">
          Manage and track all your orders from different platforms here.
        </p>
      </div>
    </DashboardLayout>
  );
}