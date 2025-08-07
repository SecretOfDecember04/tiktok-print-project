"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import ShopOverview from "@/components/ShopOverview";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    // TEMPORARILY COMMENTED OUT FOR TESTING
    // Uncomment this block when you want to re-enable authentication
    /*
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("token");
    const tokenFromStorage = localStorage.getItem("token");

    if (tokenFromUrl) {
      localStorage.setItem("token", tokenFromUrl);
      router.replace("/dashboard");
    } else if (!tokenFromStorage) {
      router.push("/login");
    }
    */

    // ADD FAKE TOKEN FOR TESTING (Remove this when done testing)
    const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJuYW1lIjoiVGVzdCBVc2VyIiwicGljdHVyZSI6IiJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    localStorage.setItem("token", fakeToken);
  }, [router]);

  return (
    <DashboardLayout>
      <ShopOverview />
    </DashboardLayout>
  );
}