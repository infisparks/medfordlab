"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { auth, database } from "@/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, onValue } from "firebase/database";

interface NavigationItem {
  href: string;
  label: string;
  icon: string;
  allowed: string[];
  subItems?: NavigationItem[];
}

interface SidebarProps {
  open: boolean; // whether the sidebar is open or collapsed
}

const Sidebar: React.FC<SidebarProps> = ({ open }) => {
  // Track the user's role; default "staff" if unknown.
  const [role, setRole] = useState<"admin" | "mini-admin" | "staff">("staff");
  const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null);

  // Listen for auth state changes, then fetch role from DB
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Suppose your DB path is user/{uid}/role
        const userRef = ref(database, `user/${user.uid}`);
        onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.val();
            // e.g. userData.role => "admin", "mini-admin", or "staff"
            setRole((userData.role as "admin" | "mini-admin" | "staff") || "staff");
          }
        });
      } else {
        // If not logged in, treat them as staff or handle differently
        setRole("staff");
      }
    });
    return () => unsubscribe();
  }, []);

  // Define your navigation items with `allowed` roles
  const navigationItems: NavigationItem[] = [
    {
      href: "/",
      label: "Dashboard",
      icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
      allowed: ["admin", "mini-admin", "staff"],
    },
    {
      href: "/patient-entry",
      label: "Patients Registration",
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
      allowed: ["admin", "mini-admin", "staff"],
    },
    {
      href: "/admin",
      label: "Admin",
      icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
      allowed: ["admin"],
      subItems: [
        {
          href: "/admin",
          label: "Billing",
          icon: "M16 21v-2a4 4 0 00-8 0v2",
          allowed: ["admin"],
        },
        {
          href: "/doctorregistration",
          label: "ADD Doctor %",
          icon: "M12 4v16",
          allowed: ["admin" , "mini-admin"],
        },
        {
          href: "/admingraph",
          label: "Test Graph",
          icon: "M12 4v16",
          allowed: ["admin"],
        },
      ],
    },
    {
      href: "/package",
      label: "Manage detail",
      icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6 a2 2 0 00-2 2v6 a2 2 0 002 2zm10-10V7 a4 4 0 00-8 0v4h8z",
      allowed: ["mini-admin","admin"],
      subItems: [
        {
          href: "/package",
          label: "Add Package",
          icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0 ...",
          allowed: ["mini-admin","admin"],
        },
        {
          href: "/pacakgedetail",
          label: "Manage Package",
          icon: "M9 19v-6a2 2 0 00-2-2H5 ...",
          allowed: ["mini-admin","admin"],
        },
        {
          href: "/createbloodtest",
          label: "Add Test",
          icon: "M12 4v16m8-8H4 ...",
          allowed: ["mini-admin","admin"],
        },
        {
          href: "/updatetest",
          label: "Update Test",
          icon: "M11 5H6 a2 2 0 00-2 2v11 ...",
          allowed: ["mini-admin","admin"],
        },
      ],
    },
  ];

  // Only show items allowed for current role
  const filteredNavigationItems = navigationItems.filter((item) =>
    item.allowed.includes(role)
  );

  const toggleSubMenu = (label: string) => {
    setActiveSubMenu((prev) => (prev === label ? null : label));
  };

  return (
    <aside
      className={`bg-slate-800 text-white h-screen fixed overflow-y-auto shadow-xl w-64 ${
        open ? "block" : "hidden"
      } md:block`}
    >
      <div className="p-6">
        <div className="mb-10 px-2">
          <h1 className="text-2xl font-bold text-blue-400">Medford</h1>
          <p className="text-sm text-slate-400 mt-1">Diagnostic Center</p>
        </div>
        <nav>
          <ul className="space-y-1">
            {filteredNavigationItems.map((item) => (
              <li key={item.label}>
                {item.subItems ? (
                  <>
                    {/* Parent link that toggles sub menu */}
                    <div
                      onClick={() => toggleSubMenu(item.label)}
                      className="flex items-center p-3 text-slate-300 rounded-lg transition-all duration-200 hover:bg-slate-700 hover:text-white group cursor-pointer hover:pl-4"
                    >
                      <svg
                        className="w-5 h-5 mr-3 group-hover:text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={item.icon}
                        />
                      </svg>
                      <span className="text-sm font-medium">{item.label}</span>
                      <svg
                        className={`w-4 h-4 ml-auto transition-transform duration-200 ${
                          activeSubMenu === item.label ? "rotate-90" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>

                    {/* Sub-menu items */}
                    {activeSubMenu === item.label && (
                      <ul className="ml-8 space-y-1">
                        {item.subItems.map((sub) => (
                          <li key={sub.label}>
                            <Link href={sub.href}>
                              <span className="flex items-center p-3 text-slate-300 rounded-lg transition-all duration-200 hover:bg-slate-700 hover:text-white group cursor-pointer hover:pl-4">
                                <svg
                                  className="w-4 h-4 mr-3 group-hover:text-blue-400"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d={sub.icon}
                                  />
                                </svg>
                                <span className="text-sm font-medium">
                                  {sub.label}
                                </span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  // Direct link (no sub-menu)
                  <Link href={item.href}>
                    <span className="flex items-center p-3 text-slate-300 rounded-lg transition-all duration-200 hover:bg-slate-700 hover:text-white group cursor-pointer hover:pl-4">
                      <svg
                        className="w-5 h-5 mr-3 group-hover:text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d={item.icon}
                        />
                      </svg>
                      <span className="text-sm font-medium">{item.label}</span>
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-10 pt-6 border-t border-slate-700">
          <div className="flex items-center px-2">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                <span className="text-xs text-slate-300">IC</span>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-slate-200">InfiCare</p>
              <p className="text-xs text-slate-400">
                {role === "admin"
                  ? "Administrator"
                  : role === "mini-admin"
                  ? "Mini-Admin"
                  : "Staff"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
