// app/layout.tsx
"use client"  // make this a Client Component so we can use useState

import "@/app/globals.css"
import { useState } from "react"
import Sidebar from "@/components/Sidebar"
import AuthProvider from "@/components/AuthProvider"



export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // ▶︎ sidebar open/closed state
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <html lang="en">
      <head /> {/* required for Metadata API */}
      <body className="flex">
        {/* pass both props down */}
        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />

        {/* shift main content depending on sidebar width */}
        <main
          className={`transition-all flex-1 ${
            sidebarOpen ? "ml-64" : "ml-[70px]"
          } p-4`}
        >
          <AuthProvider>{children}</AuthProvider>
        </main>
      </body>
    </html>
  )
}
