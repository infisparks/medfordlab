"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { auth, database } from "@/firebase"; // Ensure these paths are correct
import { onAuthStateChanged, signOut } from "firebase/auth"; // Import signOut
import { ref, onValue } from "firebase/database";

interface NavigationItem {
  href: string;
  label: string;
  icon: string; // SVG path data 'd' attribute
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
  const [userLoggedIn, setUserLoggedIn] = useState<boolean>(false); // Track login state

  // Listen for auth state changes, then fetch role from DB
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserLoggedIn(true); // User is logged in
        // Suppose your DB path is user/{uid}/role - adjust if different
        const userRef = ref(database, `user/${user.uid}`); // Adjust path as needed
        onValue(
          userRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const userData = snapshot.val();
              // Ensure role exists and is one of the expected values, otherwise default to "staff"
              const userRole = snapshot.val()?.role;
                        // ✅ include phlebotomist as a valid role
                       if (["admin", "mini-admin", "staff", "phlebotomist"].includes(userRole)) {
                          setRole(userRole as any);
              } else {
                console.warn("User role not found or invalid, defaulting to staff");
                setRole("staff");
              }
            } else {
               // User exists in auth, but no role found in DB - default to staff
               console.warn("User data not found in database, defaulting to staff role.");
               setRole("staff");
            }
          },
          (error) => {
            // Handle potential errors fetching data from the database
            console.error("Error fetching user role:", error);
            setRole("staff"); // Default to staff on error
          }
        );
      } else {
        // If not logged in, set role to staff and update login state
        setUserLoggedIn(false);
        setRole("staff");
        setActiveSubMenu(null); // Close any open submenus on logout
      }
    });
    return () => unsubscribe(); // Cleanup subscription on unmount
  }, []); // Empty dependency array ensures this runs once on mount

  // Define your navigation items with `allowed` roles
  const navigationItems: NavigationItem[] = [
    {
      href: "/",
      label: "Dashboard",
      icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", // Home icon
      allowed: ["admin", "mini-admin", "staff", "phlebotomist"],
    },
    {


      href: "/patient-entry",
      label: "Patients Registration",
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", // Users icon
      allowed: ["admin", "mini-admin", "staff"],
    },
    {
      href: "/admin", // Parent item might not need a direct href if it only opens subitems
      label: "Admin",
      icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", // Lock Closed icon (example)
      allowed: ["admin"], // Only admin can see the parent "Admin" menu
      subItems: [
        {
          href: "/admin", // Assuming this is the billing page path
          label: "Billing",
          icon: "M16 21v-2a4 4 0 00-8 0v2", // Briefcase icon (example)
          allowed: ["admin"],
        },
        {
          href: "/deletehistroy", // Assuming this is the billing page path
          label: "Delete History",
          icon: "M16 21v-2a4 4 0 00-8 0v2", // Briefcase icon (example)
          allowed: ["admin"],
        },
        {
          href: "/doctorregistration",
          label: "ADD Doctor %",
          icon: "M12 4v16", // Plus icon (example)
          allowed: ["admin", "mini-admin"], // Admin and Mini-Admin can add doctors
        },
        {
            href: "/admingraph",
            label: "Test Graph",
            icon: "M12 4v16", // Chart Bar icon (example) - Replace with actual path if needed
            allowed: ["admin"],
        },
      ],
    },
    {
      href: "/package", // Parent item might not need a direct href
      label: "Manage detail",
      icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6 a2 2 0 00-2 2v6 a2 2 0 002 2zm10-10V7 a4 4 0 00-8 0v4h8z", // Cog icon (example) - Replace with actual path
      allowed: ["mini-admin", "admin"], // Mini-admin and admin can manage details
      subItems: [
        {
          href: "/package",
          label: "Add Package",
          icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0 ...", // Placeholder icon path - replace
          allowed: ["mini-admin", "admin"],
        },
        {
          href: "/pacakgedetail", // Corrected typo: package detail
          label: "Manage Package",
          icon: "M9 19v-6a2 2 0 00-2-2H5 ...", // Placeholder icon path - replace
          allowed: ["mini-admin", "admin"],
        },
        {
          href: "/createbloodtest",
          label: "Add Test",
          icon: "M12 4v16m8-8H4 ...", // Placeholder icon path - replace
          allowed: ["mini-admin", "admin"],
        },
        {
          href: "/updatetest",
          label: "Update Test",
          icon: "M11 5H6 a2 2 0 00-2 2v11 ...", // Placeholder icon path - replace
          allowed: ["mini-admin", "admin"],
        },
      ],
    },
  ];

  // Only show items allowed for current role
  // Also filter subItems based on the role
  const filteredNavigationItems = navigationItems
    .filter((item) => item.allowed.includes(role))
    .map((item) => {
      if (item.subItems) {
        // If item has subItems, filter them based on role as well
        const filteredSubItems = item.subItems.filter((sub) =>
          sub.allowed.includes(role)
        );
        // Only include the parent item if it has visible subItems for the current role
        return filteredSubItems.length > 0
          ? { ...item, subItems: filteredSubItems }
          : null;
      }
      return item; // Return item as is if it has no subItems
    })
    .filter(item => item !== null) as NavigationItem[]; // Remove null entries resulted from filtering parents with no visible children

  // Toggle submenu visibility
  const toggleSubMenu = (label: string) => {
    setActiveSubMenu((prev) => (prev === label ? null : label));
  };

  // Handle Logout Action
  const handleLogout = async () => {
    try {
      await signOut(auth);
      // You might want to redirect the user to the login page after logout
      // e.g., using Next.js router: router.push('/login');
      console.log("User signed out successfully");
      // State updates (role, userLoggedIn) are handled by the onAuthStateChanged listener
    } catch (error) {
      console.error("Error signing out: ", error);
      // Optionally: show an error message to the user
    }
  };

  return (
    <aside
      className={`bg-slate-800 text-white h-screen fixed overflow-y-auto shadow-xl w-64 transition-transform duration-300 ease-in-out ${
        open ? "translate-x-0" : "-translate-x-full" // Use translate for smoother animation
      } md:translate-x-0 md:block`} // Ensure it's always visible on medium screens and up
    >
      <div className="p-6 flex flex-col h-full"> {/* Use flex-col for layout */}
        {/* Header */}
        <div className="mb-10 px-2">
          <h1 className="text-2xl font-bold text-blue-400">Medford</h1>
          <p className="text-sm text-slate-400 mt-1">Diagnostic Center</p>
        </div>

        {/* Navigation - Takes available space */}
        <nav className="flex-grow">
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
                        className="w-5 h-5 mr-3 group-hover:text-blue-400 flex-shrink-0" // Added flex-shrink-0
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
                      <span className="text-sm font-medium flex-grow">{item.label}</span> {/* Added flex-grow */}
                      <svg
                        className={`w-4 h-4 ml-auto transition-transform duration-200 flex-shrink-0 ${ // Added flex-shrink-0
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
                          d="M9 5l7 7-7 7" // Chevron Right
                        />
                      </svg>
                    </div>

                    {/* Sub-menu items */}
                    {activeSubMenu === item.label && (
                      <ul className="ml-8 space-y-1 mt-1"> {/* Optional: Add margin-top */}
                        {/* Filter subitems again here just in case, though filtering above should handle it */}
                        {item.subItems.filter(sub => sub.allowed.includes(role)).map((sub) => (
                          <li key={sub.label}>
                            <Link href={sub.href}>
                              <span className="flex items-center p-3 text-slate-300 rounded-lg transition-all duration-200 hover:bg-slate-700 hover:text-white group cursor-pointer hover:pl-4 text-xs"> {/* Adjusted padding/text size for subitems */}
                                <svg
                                  className="w-4 h-4 mr-3 group-hover:text-blue-400 flex-shrink-0" // Added flex-shrink-0
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  {/* Sub-item icon - using a generic one or sub.icon if provided */}
                                  <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      // Use sub.icon if available, otherwise fallback or omit
                                      d={sub.icon || "M9 5l7 7-7 7"} // Example fallback: Chevron right
                                  />
                                </svg>
                                <span className="font-medium flex-grow">{sub.label}</span> {/* Added flex-grow */}
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
                        className="w-5 h-5 mr-3 group-hover:text-blue-400 flex-shrink-0" // Added flex-shrink-0
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
                      <span className="text-sm font-medium flex-grow">{item.label}</span> {/* Added flex-grow */}
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer / User Info / Logout Button - Pushed to bottom */}
        <div className="mt-auto pt-6 border-t border-slate-700">
          {userLoggedIn && ( // Only show user info and logout if logged in
             <>
              <div className="flex items-center px-2 mb-4"> {/* Added margin-bottom */}
                <div className="flex-shrink-0">
                  {/* Placeholder User Avatar */}
                  <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                    {/* You could potentially display user initials here */}
                    <span className="text-xs text-slate-300">
                      {auth.currentUser?.email?.substring(0, 2).toUpperCase() || "U"}
                    </span>
                  </div>
                </div>
                <div className="ml-3">
                  {/* Display user email or name if available */}
                  <p className="text-sm font-medium text-slate-200 truncate" title={auth.currentUser?.email || 'User'}>
                    {auth.currentUser?.email || 'User'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {/* Display Role */}
                    {role === "admin"
                      ? "Administrator"
                      : role === "mini-admin"
                      ? "Mini-Admin"
                      : "Staff"}
                  </p>
                </div>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="flex items-center w-full p-3 text-slate-300 rounded-lg transition-all duration-200 hover:bg-red-600 hover:text-white group cursor-pointer"
              >
                <svg
                  className="w-5 h-5 mr-3 group-hover:text-white flex-shrink-0" // Icon color matches text on hover
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    // Logout Icon Path
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  ></path>
                </svg>
                <span className="text-sm font-medium">Logout</span>
              </button>
             </>
          )}
          {!userLoggedIn && ( // Optional: Show a login link if user is not logged in
            <Link href="/login"> {/* Adjust the login path as needed */}
              <span className="flex items-center w-full p-3 text-slate-300 rounded-lg transition-all duration-200 hover:bg-slate-700 hover:text-white group cursor-pointer">
                 {/* Login Icon example */}
                 <svg className="w-5 h-5 mr-3 group-hover:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
                <span className="text-sm font-medium">Login</span>
              </span>
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;