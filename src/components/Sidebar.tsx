import React from "react";
import Link from "next/link";

interface SidebarProps {
  open: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ open }) => {
  return (
    <aside
      className={`bg-slate-800 text-white h-screen fixed overflow-y-auto shadow-xl 
        w-64 
        ${open ? "block" : "hidden"} 
        md:block`}
    >
      <div className="p-6">
        <div className="mb-10 px-2">
          <h1 className="text-2xl font-bold text-blue-400">Medford</h1>
          <p className="text-sm text-slate-400 mt-1">Diagnostic Center</p>
        </div>

        <nav>
          <ul className="space-y-1">
            {[
              {
                href: "/",
                label: "Dashboard",
                icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
              },
              {
                href: "/patient-entry",
                label: "Patients",
                icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
              },
              {
                href: "/createbloodtest",
                label: "Add Test",
                icon: "M12 4v16m8-8H4M13 5h3a2 2 0 012 2v3M11 19h3a2 2 0 002-2v-3M5 11h3a2 2 0 012 2v3M5 5h3a2 2 0 012 2v3",
              },
              {
                href: "/updatetest",
                label: "Update Test",
                icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
              },
              {
                href: "/admin",
                label: "Admin",
                icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
              },
              {
                href: "/pacakgedetail",
                label: "Manage Package",
                icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
              },
              {
                href: "/package",
                label: "Add Packages",
                icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31 2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
              },
            ].map((item) => (
              <li key={item.label}>
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
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-10 pt-6 border-t border-slate-700">
          <div className="flex items-center px-2">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center">
                <span className="text-xs text-slate-300">JD</span>
              </div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-slate-200">John Doe</p>
              <p className="text-xs text-slate-400">Lab Administrator</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
