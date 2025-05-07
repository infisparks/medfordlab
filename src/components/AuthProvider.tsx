// components/AuthProvider.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, database } from "../firebase";

const allowedRoutes: Record<string, string[]> = {
  admin: [
    "/", 
    "/dashboard",
    "/admin",
    "/admingraph",
    "/login",
    "/blood-values",
    "/blood-values/new",  
    "/component",
    "/createbloodtest",
    "/doctoradmin",
    "/doctorregistration",
    "/download-report",
    "/pacakgedetail",
    "/package",
    "/patient-detail",
    "/patient-registration",
    "/patient-entry",
    "/register",
    "/uidlogin",
    "/updatetest",
    "/deletehistroy"
  ],
  technician: [
    "/", 
    "/dashboard", 
    "/patient-detail",
    "/blood-values",
    "/blood-values/new",  
    "/login",
    "/patient-entry",
    "/patient-registration",
    "/download-report",
  ],
  phlebotomist: [
    "/", 
    "/dashboard",
    "/download-report",
    "/login",
  ],
};

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 1) onAuthStateChanged → fetch role or send to /login
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRole(null);
        setIsLoading(false);
        router.replace("/login");
        return;
      }

      try {
        const snap = await get(ref(database, `user/${user.uid}/role`));
        if (snap.exists()) {
          setRole(snap.val());
        } else {
          // no role in DB → treat as unauthenticated
          setRole(null);
          router.replace("/login");
        }
      } catch (err) {
        console.error("Error fetching role:", err);
        setRole(null);
        router.replace("/login");
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // 2) once we know role, guard access
  useEffect(() => {
    if (isLoading) return;     // still waiting on auth/role
    if (!role) return;         // already sent to /login

    const allowed = allowedRoutes[role];
    if (!allowed) {
      router.replace("/login");
      return;
    }
    if (!allowed.includes(pathname)) {
      router.replace("/");
    }
  }, [isLoading, role, pathname, router]);

  // 3) while auth & role-loading, render a spinner
  if (isLoading) {
    return <div>Loading...</div>;
  }

  // 4) passed all checks → render children
  return <>{children}</>;
}
