"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import { database } from "../firebase";
import { ref, onValue, update } from "firebase/database";
import {
  UserIcon,
  ChartBarIcon,
  ClockIcon,
  UserGroupIcon,
  DocumentPlusIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";

interface BloodTest {
  testId: string;
  testName: string;
  price: number;
}

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  contact?: string;
  createdAt: string;
  discountPercentage: number;
  amountPaid: number;
  bloodTests?: BloodTest[];
  bloodtest?: Record<string, any>;
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [metrics, setMetrics] = useState({
    totalTests: 0,
    pendingReports: 0,
    completedTests: 0,
  });
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newAmountPaid, setNewAmountPaid] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  // Filter patients based on search term and date
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const matchesSearch = patient.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesDate = selectedDate
        ? patient.createdAt.startsWith(selectedDate)
        : true;
      return matchesSearch && matchesDate;
    });
  }, [patients, searchTerm, selectedDate]);

  // Calculate billing amounts for a patient
  const calculateAmounts = (patient: Patient) => {
    const testTotal =
      patient.bloodTests?.reduce((acc, bt) => acc + bt.price, 0) || 0;
    const discountValue = testTotal * (patient.discountPercentage / 100);
    const remaining = testTotal - discountValue - patient.amountPaid;
    return { testTotal, discountValue, remaining };
  };

  // Fetch patients from Firebase and convert object to array
  useEffect(() => {
    const patientsRef = ref(database, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const patientList = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
          age: Number(data[key].age),
        }));
        // Sort so that the latest entries (by createdAt) appear first
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

  // Handler to update the amountPaid by adding the new payment
  const handleUpdateAmount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    try {
      const updatedAmount = selectedPatient.amountPaid + newAmountPaid;
      const patientRef = ref(database, `patients/${selectedPatient.id}`);
      await update(patientRef, { amountPaid: updatedAmount });
      alert("Amount updated successfully!");
      setSelectedPatient(null);
      setNewAmountPaid(0);
    } catch (error) {
      console.error("Error updating amount:", error);
      alert("Error updating amount. Please try again.");
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <div
        className={`fixed z-50 md:static ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
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
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-600">Dr. Sarah Johnson</p>
              <p className="text-xs text-gray-400">Pathologist</p>
            </div>
            <Image
              src="/doctor-avatar.png"
              alt="Profile"
              width={40}
              height={40}
              className="h-10 w-10 rounded-full border-2 border-blue-100"
            />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          {/* Filter Section */}
          <div className="mb-4 flex flex-col md:flex-row gap-4">
            <input
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="p-2 border rounded-md"
            />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="p-2 border rounded-md"
            />
          </div>

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
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Tests</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Entry Date</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium">{patient.name}</p>
                          <p className="text-sm text-gray-500">{patient.age}y • {patient.gender}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {patient.bloodTests && patient.bloodTests.length > 0 ? (
                          <ul className="list-disc pl-4">
                            {patient.bloodTests.map((test) => (
                              <li key={test.testId}>{test.testName}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-gray-400">No tests</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {new Date(patient.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                          Pending Report
                        </span>
                      </td>
                      <td className="px-6 py-4 space-x-2">
                        {patient.bloodtest && Object.keys(patient.bloodtest).length > 0 ? (
                          <Link
                            href={`/download-report?patientId=${patient.id}`}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors"
                          >
                            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                            Download Report
                          </Link>
                        ) : (
                          <Link
                            href={`/blood-values/new?patientId=${patient.id}`}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                          >
                            <DocumentPlusIcon className="h-4 w-4 mr-2" />
                            Add Value
                          </Link>
                        )}
                        <button
                          onClick={() => {
                            setSelectedPatient(patient);
                            setNewAmountPaid(0);
                          }}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                        >
                          Update Amount
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredPatients.length === 0 && (
                <div className="p-6 text-center text-gray-500">
                  No recent patients found
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Modal Popup for Updating Amount */}
      {selectedPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => setSelectedPatient(null)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
            <h3 className="text-xl font-semibold mb-4">Update Payment for {selectedPatient.name}</h3>
            {(() => {
              const { testTotal, discountValue, remaining } = calculateAmounts(selectedPatient);
              return (
                <div className="mb-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Test Total:</span>
                    <span className="text-sm font-medium">₹{testTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Discount:</span>
                    <span className="text-sm font-medium">₹{discountValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Current Paid:</span>
                    <span className="text-sm font-medium">₹{selectedPatient.amountPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Remaining:</span>
                    <span className="text-sm font-medium">₹{remaining.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}
            <form onSubmit={handleUpdateAmount}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Additional Payment (INR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newAmountPaid}
                  onChange={(e) => setNewAmountPaid(Number(e.target.value))}
                  className="mt-1 block w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter additional payment"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                Update Payment
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
