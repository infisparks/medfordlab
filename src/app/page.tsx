"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { database } from "../firebase";
import { ref, onValue } from "firebase/database";
import {
  UserIcon,
  DocumentPlusIcon,
  ChartBarIcon,
  ClockIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  contact?: string;
  createdAt: string; // Use createdAt instead of appointmentDate
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [metrics, setMetrics] = useState({
    totalTests: 0,
    pendingReports: 0,
    completedTests: 0,
  });

  useEffect(() => {
    const patientsRef = ref(database, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const patientList = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        // Sort so that latest entries appear first using createdAt timestamp
        const sortedPatients = patientList.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setPatients(sortedPatients.slice(0, 5));
        
        // Calculate metrics
        const total = patientList.length;
        const pending = patientList.filter((p: any) => !p.report).length;
        setMetrics({
          totalTests: total,
          pendingReports: pending,
          completedTests: total - pending,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <div className={`fixed z-50 md:static ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col ml-0 md:ml-64">
        {/* Header */}
        <header className="bg-white shadow-sm flex items-center justify-between p-4 md:px-8">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-600 hover:text-gray-800 md:hidden"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-600">Dr. Sarah Johnson</p>
              <p className="text-xs text-gray-400">Pathologist</p>
            </div>
            <img
              src="/doctor-avatar.png"
              alt="Profile"
              className="h-10 w-10 rounded-full border-2 border-blue-100"
            />
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 p-4 md:p-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <ChartBarIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Total Tests</p>
                  <p className="text-2xl font-semibold">{metrics.totalTests}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <ClockIcon className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Pending Reports</p>
                  <p className="text-2xl font-semibold">{metrics.pendingReports}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-green-50 rounded-lg">
                  <UserGroupIcon className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Completed Tests</p>
                  <p className="text-2xl font-semibold">{metrics.completedTests}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Patients Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold flex items-center">
                <UserIcon className="h-5 w-5 mr-2 text-gray-600" />
                Recent Patients
              </h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Patient</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Entry Date</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {patients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium">{patient.name}</p>
                          <p className="text-sm text-gray-500">{patient.age}y • {patient.gender}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {new Date(patient.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                          Pending Report
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/reports/new?patientId=${patient.id}`}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                        >
                          <DocumentPlusIcon className="h-4 w-4 mr-2" />
                          Add Report
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {patients.length === 0 && (
                <div className="p-6 text-center text-gray-500">
                  No recent patients found
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
