"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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
  /** Flag that indicates if the final report is ready. */
  report: boolean;
  /** If sample is collected, the timestamp goes here; otherwise undefined/null => not collected. */
  sampleCollectedAt?: string;
  paymentHistory?: { amount: number; paymentMode: string; time: string }[];
}

export default function Dashboard() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [metrics, setMetrics] = useState({
    totalTests: 0,
    pendingReports: 0,
    completedTests: 0,
  });
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newAmountPaid, setNewAmountPaid] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<string>("online");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  /** 
   *  statusFilter has 4 options: 
   *  "all", "notCollected", "sampleCollected", "completed" 
   */
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // -----------------------------
  // Helper: Calculate amounts
  // -----------------------------
  const calculateAmounts = (patient: Patient) => {
    const testTotal =
      patient.bloodTests?.reduce((acc, bt) => acc + bt.price, 0) || 0;
    const discountValue = testTotal * (patient.discountPercentage / 100);
    const remaining = testTotal - discountValue - patient.amountPaid;
    return { testTotal, discountValue, remaining };
  };

  // -----------------------------
  // Fetch patients from Firebase
  // -----------------------------
  useEffect(() => {
    const patientsRef = ref(database, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();

        // Convert the raw object into a typed array of Patients
        const patientList: Patient[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
          age: Number(data[key].age),
          report: Boolean(data[key].report),
        }));

        // Sort so that completed patients appear first, then by date descending
        const sortedPatients = patientList.sort((a, b) => {
          const aComplete = a.bloodtest && Object.keys(a.bloodtest).length > 0;
          const bComplete = b.bloodtest && Object.keys(b.bloodtest).length > 0;

          if (aComplete && !bComplete) return -1;
          if (!aComplete && bComplete) return 1;

          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });

        // Show only the most recent 5 on the dashboard
        setPatients(sortedPatients.slice(0, 5));

        // Compute metrics
        const total = patientList.length;
        const completed = patientList.filter(
          (p) => p.bloodtest && Object.keys(p.bloodtest).length > 0
        ).length;
        const pending = total - completed;
        setMetrics({
          totalTests: total,
          pendingReports: pending, // older logic for "pending"
          completedTests: completed,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // -----------------------------
  // Filter logic
  // -----------------------------
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const matchesSearch = patient.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

      const matchesDate = selectedDate
        ? patient.createdAt.startsWith(selectedDate)
        : true;

      // Determine the status of the patient
      const hasBloodtest =
        patient.bloodtest && Object.keys(patient.bloodtest).length > 0;
      const hasSampleCollected = !!patient.sampleCollectedAt;

      let matchesStatus = true;
      switch (statusFilter) {
        case "notCollected":
          matchesStatus = !hasSampleCollected;
          break;
        case "sampleCollected":
          matchesStatus = hasSampleCollected && !hasBloodtest;
          break;
        case "completed":
          matchesStatus = hasBloodtest;
          break;
        case "all":
        default:
          matchesStatus = true;
          break;
      }

      return matchesSearch && matchesDate && matchesStatus;
    });
  }, [patients, searchTerm, selectedDate, statusFilter]);

  // -----------------------------
  // "Collect Sample" action
  // -----------------------------
  const handleCollectSample = async (patient: Patient) => {
    try {
      const patientRef = ref(database, `patients/${patient.id}`);
      await update(patientRef, {
        sampleCollectedAt: new Date().toISOString(),
      });
      alert(`Sample collected for ${patient.name}!`);
    } catch (error) {
      console.error("Error collecting sample:", error);
      alert("Error collecting sample. Please try again.");
    }
  };

  // -----------------------------
  // "Update Payment" action
  // -----------------------------
  const handleUpdateAmount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;

    try {
      const updatedAmount = selectedPatient.amountPaid + newAmountPaid;
      const { testTotal, discountValue } = calculateAmounts(selectedPatient);
      const newRemaining = testTotal - discountValue - updatedAmount;
      const patientRef = ref(database, `patients/${selectedPatient.id}`);
      const epsilon = 1;
      const isComplete = newRemaining <= epsilon;

      // Update in Firebase: amountPaid, report status, paymentHistory
      await update(patientRef, {
        amountPaid: updatedAmount,
        report: isComplete,
        paymentHistory: [
          ...(selectedPatient.paymentHistory || []),
          {
            amount: newAmountPaid,
            paymentMode: paymentMode,
            time: new Date().toISOString(),
          },
        ],
      });

      alert("Amount updated successfully!");
      setSelectedPatient(null);
      setNewAmountPaid(0);
      setPaymentMode("online");
    } catch (error) {
      console.error("Error updating amount:", error);
      alert("Error updating amount. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm flex items-center justify-between p-4 md:px-8">
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-600">Dr. mudassir</p>
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

      {/* Main Content */}
      <main className="p-4 md:p-6">
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
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-2 border rounded-md"
          >
            <option value="all">All</option>
            <option value="notCollected">Not Collected</option>
            <option value="sampleCollected">Sample Collected</option>
            <option value="completed">Completed</option>
          </select>
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
                <p className="text-2xl font-semibold">
                  {metrics.pendingReports}
                </p>
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
                <p className="text-2xl font-semibold">
                  {metrics.completedTests}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Patients */}
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Tests
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Entry Date
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Remaining
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPatients.map((patient) => {
                  const hasBloodtest =
                    patient.bloodtest &&
                    Object.keys(patient.bloodtest).length > 0;
                  const hasSampleCollected = !!patient.sampleCollectedAt;
                  let statusLabel = "Not Collected";
                  if (hasSampleCollected && !hasBloodtest) {
                    statusLabel = "Sample Collected";
                  } else if (hasBloodtest) {
                    statusLabel = "Completed";
                  }

                  const { remaining } = calculateAmounts(patient);

                  return (
                    <tr key={patient.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium">{patient.name}</p>
                          <p className="text-sm text-gray-500">
                            {patient.age}y • {patient.gender}
                          </p>
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
                        {statusLabel === "Not Collected" && (
                          <span className="px-3 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            Not Collected
                          </span>
                        )}
                        {statusLabel === "Sample Collected" && (
                          <span className="px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            Sample Collected
                          </span>
                        )}
                        {statusLabel === "Completed" && (
                          <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            Completed
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {remaining > 0 ? `₹${remaining.toFixed(2)}` : "0"}
                      </td>
                      <td className="px-6 py-4 space-x-2">
                        {/* Action buttons based on sampleCollectedAt & bloodtest */}
                        {!hasSampleCollected ? (
                          <button
                            onClick={() => handleCollectSample(patient)}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors"
                          >
                            Collect Sample
                          </button>
                        ) : hasBloodtest ? (
                          <>
                            <Link
                              href={`/download-report?patientId=${patient.id}`}
                              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 transition-colors"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                              Download Report
                            </Link>
                            <Link
                              href={`/blood-values/new?patientId=${patient.id}`}
                              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-500 hover:bg-blue-600 transition-colors"
                            >
                              Edit Test
                            </Link>
                          </>
                        ) : (
                          <Link
                            href={`/blood-values/new?patientId=${patient.id}`}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                          >
                            <DocumentPlusIcon className="h-4 w-4 mr-2" />
                            Add Value
                          </Link>
                        )}
                        {/* Update Amount button */}
                        <button
                          onClick={() => {
                            setSelectedPatient(patient);
                            setNewAmountPaid(0);
                          }}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                        >
                          Update Amount
                        </button>
                        {/* New "Edit Details" button */}
                        <Link
                          href={`/patient-detail?patientId=${patient.id}`}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 transition-colors"
                        >
                          Edit Details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
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

      {/* Modal for Payment Update */}
      {selectedPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => setSelectedPatient(null)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
            <h3 className="text-xl font-semibold mb-4">
              Update Payment for {selectedPatient.name}
            </h3>
            {(() => {
              const { testTotal, discountValue, remaining } =
                calculateAmounts(selectedPatient);
              return (
                <div className="mb-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Test Total:</span>
                    <span className="text-sm font-medium">
                      ₹{testTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Discount:</span>
                    <span className="text-sm font-medium">
                      ₹{discountValue.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Current Paid:</span>
                    <span className="text-sm font-medium">
                      ₹{selectedPatient.amountPaid.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Remaining:</span>
                    <span className="text-sm font-medium">
                      ₹{remaining.toFixed(2)}
                    </span>
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
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Payment Mode
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="mt-1 block w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="cash">Cash</option>
                  <option value="online">Online</option>
                </select>
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
