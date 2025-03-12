"use client"; // <-- Add this at the very top

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, database } from "../firebase"; // Adjust path as needed
import Sidebar from "@/components/Sidebar"; // Adjust path as needed
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for Firebase Auth state changes.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // If no user is logged in, redirect to /login.
        router.push("/login");
        setIsLoading(false);
      } else {
        // Fetch the user’s role from Realtime Database at "user/{user.uid}/role"
        const roleRef = ref(database, `user/${user.uid}/role`);
        try {
          const snapshot = await get(roleRef);
          if (snapshot.exists()) {
            const dbRole = snapshot.val();
            setRole(dbRole);
          } else {
            // If role is not found, set a default (or handle appropriately)
            setRole("staff");
          }
        } catch (error) {
          console.error("Error fetching role:", error);
        }
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Optional: Protect certain routes by redirecting if the user’s role isn’t allowed.
  useEffect(() => {
    if (!isLoading && role) {
      if (role === "staff") {
        // Staff cannot access certain routes
        const restrictedRoutes = ["/admin", "/updatetest", "/pacakgedetail", "/package"];
        if (restrictedRoutes.includes(pathname)) {
          router.push("/");
        }
      } else if (role === "mini-admin") {
        // Mini-admin cannot access /admin
        if (pathname === "/admin") {
          router.push("/");
        }
      }
    }
  }, [isLoading, role, pathname, router]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <html lang="en">
      <body>
        <Sidebar open={true} role={role || "staff"} />
        <main className="ml-64 p-4">{children}</main>
      </body>
    </html>
  );
}
