"use client";

import DashboardLayout from "@/components/DashboardLayout";

export default function TemplatesPage() {
  return (
    <DashboardLayout>
      <div className="bg-white rounded-xl shadow-sm border p-8">
        <h1 className="text-2xl font-bold mb-4">Print Templates</h1>
        <p className="text-gray-600">
          Design and manage your ticket printing templates.
        </p>
      </div>
    </DashboardLayout>
  );
}