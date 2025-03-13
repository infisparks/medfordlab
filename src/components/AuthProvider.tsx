"use client";  // This is now a Client Component

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, database } from "../firebase";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Listen for Firebase Auth state changes.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        setIsLoading(false);
      } else {
        // Fetch the user’s role
        const roleRef = ref(database, `user/${user.uid}/role`);
        try {
          const snapshot = await get(roleRef);
          if (snapshot.exists()) {
            setRole(snapshot.val());
          } else {
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

  // Optionally protect certain routes based on role
  useEffect(() => {
    if (!isLoading && role) {
      if (role === "staff") {
        const restrictedRoutes = ["/admin", "/updatetest", "/pacakgedetail", "/package"];
        if (restrictedRoutes.includes(pathname)) {
          router.push("/");
        }
      } else if (role === "mini-admin") {
        if (pathname === "/admin") {
          router.push("/");
        }
      }
    }
  }, [isLoading, role, pathname, router]);

  // You can also pass `role` to your children via context if needed
  if (isLoading) {
    return <div>Loading...</div>;
  }

  return <>{children}</>;
}
