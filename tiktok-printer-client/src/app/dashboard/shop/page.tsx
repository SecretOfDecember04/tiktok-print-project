"use client";

import DashboardLayout from "@/components/DashboardLayout";

export default function ShopPage() {
  return (
    <DashboardLayout>
      <div className="bg-white rounded-xl shadow-sm border p-8">
        <h1 className="text-2xl font-bold mb-4">Shop Settings</h1>
        <p className="text-gray-600">
          Configure your shop details and platform integrations.
        </p>
      </div>
    </DashboardLayout>
  );
}