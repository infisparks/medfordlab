"use client"

import type React from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { auth, database } from "@/firebase"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { ref, onValue } from "firebase/database"
import {
  BarChart3,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Package,
  PackagePlus,
  PanelLeft,
  Pencil,
  Settings,
  ShieldAlert,
  TestTube,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type UserRole = "admin" | "mini-admin" | "staff" | "phlebotomist"

interface NavigationItem {
  href: string
  label: string
  icon: LucideIcon
  allowed: UserRole[]
  subItems?: NavigationItem[]
}

interface SidebarProps {
  open: boolean
  setOpen: (open: boolean) => void
}

const Sidebar: React.FC<SidebarProps> = ({ open, setOpen }) => {
  const [role, setRole] = useState<UserRole>("staff")
  const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null)
  const [userLoggedIn, setUserLoggedIn] = useState<boolean>(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserLoggedIn(true)
        const userRef = ref(database, `user/${user.uid}`)
        onValue(
          userRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const userRole = snapshot.val()?.role
              if (["admin", "mini-admin", "staff", "phlebotomist"].includes(userRole)) {
                setRole(userRole as UserRole)
              } else {
                console.warn("User role not found or invalid, defaulting to staff")
                setRole("staff")
              }
            } else {
              console.warn("User data not found in database, defaulting to staff role.")
              setRole("staff")
            }
          },
          (error) => {
            console.error("Error fetching user role:", error)
            setRole("staff")
          },
        )
      } else {
        setUserLoggedIn(false)
        setRole("staff")
        setActiveSubMenu(null)
      }
    })
    return () => unsubscribe()
  }, [])

  const navigationItems: NavigationItem[] = [
    {
      href: "/",
      label: "Dashboard",
      icon: LayoutDashboard,
      allowed: ["admin", "mini-admin", "staff", "phlebotomist"],
    },
    {
      href: "/patient-entry",
      label: "Patients Registration",
      icon: UserPlus,
      allowed: ["admin", "mini-admin", "staff"],
    },
    {
      href: "/admin",
      label: "Admin",
      icon: ShieldAlert,
      allowed: ["admin"],
      subItems: [
        {
          href: "/admin",
          label: "Billing",
          icon: FileText,
          allowed: ["admin"],
        },
        {
          href: "/deletehistroy",
          label: "Delete History",
          icon: Trash2,
          allowed: ["admin"],
        },
        {
          href: "/doctorregistration",
          label: "ADD Doctor %",
          icon: Users,
          allowed: ["admin", "mini-admin"],
        },
        {
          href: "/admingraph",
          label: "Test Graph",
          icon: BarChart3,
          allowed: ["admin"],
        },
      ],
    },
    {
      href: "/package",
      label: "Manage detail",
      icon: Settings,
      allowed: ["mini-admin", "admin"],
      subItems: [
        {
          href: "/package",
          label: "Add Package",
          icon: PackagePlus,
          allowed: ["mini-admin", "admin"],
        },
        {
          href: "/pacakgedetail",
          label: "Manage Package",
          icon: Package,
          allowed: ["mini-admin", "admin"],
        },
        {
          href: "/createbloodtest",
          label: "Add Test",
          icon: TestTube,
          allowed: ["mini-admin", "admin"],
        },
        {
          href: "/updatetest",
          label: "Update Test",
          icon: Pencil,
          allowed: ["mini-admin", "admin"],
        },
      ],
    },
  ]

  const filteredNavigationItems = navigationItems
    .filter((item) => item.allowed.includes(role))
    .map((item) => {
      if (item.subItems) {
        const filteredSubItems = item.subItems.filter((sub) => sub.allowed.includes(role))
        return filteredSubItems.length > 0 ? { ...item, subItems: filteredSubItems } : null
      }
      return item
    })
    .filter((item) => item !== null) as NavigationItem[]

  const toggleSubMenu = (label: string) => {
    if (open) {
      setActiveSubMenu((prev) => (prev === label ? null : label))
    } else {
      setOpen(true)
      setActiveSubMenu(label)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut(auth)
      console.log("User signed out successfully")
    } catch (error) {
      console.error("Error signing out: ", error)
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "bg-slate-900 text-white h-screen fixed overflow-y-auto shadow-xl transition-all duration-300 ease-in-out z-30",
          open ? "w-64" : "w-[70px]",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-slate-800">
            <div className={cn("flex items-center", !open && "justify-center w-full")}>
              {open ? (
                <>
                  <div className="flex-shrink-0 bg-blue-600 rounded-lg p-1.5">
                    <TestTube className="h-5 w-5 text-white" />
                  </div>
                  <h1 className="ml-2 text-xl font-bold text-blue-400">Medford</h1>
                </>
              ) : (
                <div className="flex-shrink-0 bg-blue-600 rounded-lg p-1.5">
                  <TestTube className="h-5 w-5 text-white" />
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(!open)}
              className={cn("text-slate-400 hover:text-white hover:bg-slate-800", !open && "hidden")}
            >
              <PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle sidebar</span>
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-grow py-4">
            <ul className="space-y-1 px-2">
              {filteredNavigationItems.map((item) => (
                <li key={item.label}>
                  {item.subItems ? (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => toggleSubMenu(item.label)}
                            className={cn(
                              "flex items-center w-full rounded-lg transition-all duration-200 hover:bg-slate-800 group",
                              activeSubMenu === item.label ? "bg-slate-800 text-white" : "text-slate-300",
                              open ? "p-3 justify-between" : "p-3 justify-center",
                            )}
                          >
                            <div className="flex items-center">
                              <item.icon className="h-5 w-5 text-blue-400" />
                              {open && <span className="ml-3 text-sm font-medium">{item.label}</span>}
                            </div>
                            {open && (
                              <ChevronRight
                                className={cn(
                                  "h-4 w-4 transition-transform",
                                  activeSubMenu === item.label && "rotate-90",
                                )}
                              />
                            )}
                          </button>
                        </TooltipTrigger>
                        {!open && <TooltipContent side="right">{item.label}</TooltipContent>}
                      </Tooltip>

                      {/* Sub-menu items */}
                      {activeSubMenu === item.label && open && (
                        <ul className="mt-1 ml-2 space-y-1 border-l-2 border-slate-800 pl-4">
                          {item.subItems.map((sub) => (
                            <li key={sub.label}>
                              <Link
                                href={sub.href}
                                className="flex items-center p-2 text-sm text-slate-300 rounded-lg transition-all duration-200 hover:bg-slate-800 hover:text-white"
                              >
                                <sub.icon className="h-4 w-4 text-blue-400" />
                                <span className="ml-3 font-medium">{sub.label}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center rounded-lg transition-all duration-200 hover:bg-slate-800 text-slate-300 hover:text-white",
                            open ? "p-3" : "p-3 justify-center",
                          )}
                        >
                          <item.icon className="h-5 w-5 text-blue-400" />
                          {open && <span className="ml-3 text-sm font-medium">{item.label}</span>}
                        </Link>
                      </TooltipTrigger>
                      {!open && <TooltipContent side="right">{item.label}</TooltipContent>}
                    </Tooltip>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer / User Info / Logout Button */}
          <div className="mt-auto border-t border-slate-800 p-4">
            {userLoggedIn && (
              <>
                <div className={cn("flex items-center", !open && "justify-center")}>
                  <Avatar className="h-8 w-8 bg-slate-700">
                    <AvatarFallback className="text-xs text-slate-300">
                      {auth.currentUser?.email?.substring(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {open && (
                    <div className="ml-3">
                      <p
                        className="text-sm font-medium text-slate-200 truncate"
                        title={auth.currentUser?.email || "User"}
                      >
                        {auth.currentUser?.email || "User"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {role === "admin"
                          ? "Administrator"
                          : role === "mini-admin"
                            ? "Mini-Admin"
                            : role === "phlebotomist"
                              ? "Phlebotomist"
                              : "Staff"}
                      </p>
                    </div>
                  )}
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleLogout}
                      className={cn(
                        "flex items-center rounded-lg transition-all duration-200 hover:bg-red-600 hover:text-white text-slate-300 mt-4",
                        open ? "w-full p-3" : "mx-auto p-3 justify-center",
                      )}
                    >
                      <LogOut className="h-5 w-5" />
                      {open && <span className="ml-3 text-sm font-medium">Logout</span>}
                    </button>
                  </TooltipTrigger>
                  {!open && <TooltipContent side="right">Logout</TooltipContent>}
                </Tooltip>
              </>
            )}
            {!userLoggedIn && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/login"
                    className={cn(
                      "flex items-center rounded-lg transition-all duration-200 hover:bg-slate-800 hover:text-white text-slate-300",
                      open ? "w-full p-3" : "mx-auto p-3 justify-center",
                    )}
                  >
                    <LogOut className="h-5 w-5 transform rotate-180" />
                    {open && <span className="ml-3 text-sm font-medium">Login</span>}
                  </Link>
                </TooltipTrigger>
                {!open && <TooltipContent side="right">Login</TooltipContent>}
              </Tooltip>
            )}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}

export default Sidebar
