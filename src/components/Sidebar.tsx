// components/Sidebar.tsx
import React from "react";
import Link from "next/link";

const Sidebar: React.FC = () => {
  return (
    <aside className="bg-gradient-to-b from-blue-600 to-blue-800 text-white w-64 h-screen fixed overflow-y-auto">
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-8">Lab Dashboard</h1>
        <nav>
          <ul className="space-y-4">
            <li>
              <Link href="/">
                <span className="flex items-center p-2 rounded-md transition duration-200 hover:bg-blue-500 hover:text-white cursor-pointer">
                  <svg
                    className="h-6 w-6 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 21V9h6v12"
                    />
                  </svg>
                  Dashboard
                </span>
              </Link>
            </li>
            <li>
              <Link href="/patient-entry">
                <span className="flex items-center p-2 rounded-md transition duration-200 hover:bg-blue-500 hover:text-white cursor-pointer">
                  <svg
                    className="h-6 w-6 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 17l-4 4m0 0l-4-4m4 4V3"
                    />
                  </svg>
                  Patients
                </span>
              </Link>
            </li>
            <li>
              <Link href="/createbloodtest">
                <span className="flex items-center p-2 rounded-md transition duration-200 hover:bg-blue-500 hover:text-white cursor-pointer">
                  <svg
                    className="h-6 w-6 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 21V9h6v12"
                    />
                  </svg>
                  Add Test
                </span>
              </Link>
            </li>
            <li>
              <Link href="/updatetest">
                <span className="flex items-center p-2 rounded-md transition duration-200 hover:bg-blue-500 hover:text-white cursor-pointer">
                  <svg
                    className="h-6 w-6 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2 12a10 10 0 0120 0 10 10 0 01-20 0z"
                    />
                  </svg>
                  Update Test
                </span>
              </Link>
            </li>
            <li>
              <Link href="/admin">
                <span className="flex items-center p-2 rounded-md transition duration-200 hover:bg-blue-500 hover:text-white cursor-pointer">
                  <svg
                    className="h-6 w-6 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2 12a10 10 0 0120 0 10 10 0 01-20 0z"
                    />
                  </svg>
                  Admin
                </span>
              </Link>
            </li>
            <li>
              <Link href="/admingraph">
                <span className="flex items-center p-2 rounded-md transition duration-200 hover:bg-blue-500 hover:text-white cursor-pointer">
                  <svg
                    className="h-6 w-6 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2 12a10 10 0 0120 0 10 10 0 01-20 0z"
                    />
                  </svg>
                  Admin Graph
                </span>
              </Link>
            </li>
            <li>
              <Link href="#">
                <span className="flex items-center p-2 rounded-md transition duration-200 hover:bg-blue-500 hover:text-white cursor-pointer">
                  <svg
                    className="h-6 w-6 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 12h9m-9 4h9m-9-8h9M4 6h.01M4 10h.01M4 14h.01M4 18h.01"
                    />
                  </svg>
                  Settings
                </span>
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
