"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { database } from "../firebase";
import { ref, onValue, update, remove } from "firebase/database";
import {
  UserIcon,
  ChartBarIcon,
  ClockIcon,
  UserGroupIcon,
  DocumentPlusIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

// -----------------------------
// Types
// -----------------------------
interface BloodTest {
  testId: string;
  testName: string;
  price: number;
  testType?: string; // optional
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
  report?: boolean;
  sampleCollectedAt?: string;
  paymentHistory?: { amount: number; paymentMode: string; time: string }[];
}

// -----------------------------
// Helper: Convert test name -> slug used in 'bloodtest'
// -----------------------------
function slugifyTestName(testName: string) {
  // e.g. "Complete Blood Count (CBC)" -> "complete_blood_count_(cbc)"
  return testName
    .toLowerCase()
    .replace(/\s+/g, "_") // spaces to underscores
    .replace(/[^\w()]/g, "_") // punctuation replaced with underscore
    .replace(/_+/g, "_"); // condense consecutive underscores
}

// -----------------------------
// Helper: Check if a single test is fully filled
// -----------------------------
function isTestFullyEntered(patient: Patient, test: BloodTest): boolean {
  if (!patient.bloodtest) return false;

  const slug = slugifyTestName(test.testName);
  const testData = patient.bloodtest[slug];
  if (!testData || !testData.parameters) {
    return false; // test data missing
  }
  // If *any* parameter is missing a value, consider not filled
  for (const param of testData.parameters) {
    if (param.value === null || param.value === undefined || param.value === "") {
      return false;
    }
  }
  return true;
}

// -----------------------------
// Helper: Check if all tests are fully filled
// -----------------------------
function isAllTestsComplete(patient: Patient): boolean {
  if (!patient.bloodTests || patient.bloodTests.length === 0) {
    // If no tests are booked, consider it "complete."
    return true;
  }
  // If the patient has some tests, each must be fully filled
  return patient.bloodTests.every((test) => isTestFullyEntered(patient, test));
}

// -----------------------------
// Helper: Calculate amounts
// -----------------------------
function calculateAmounts(patient: Patient) {
  const testTotal =
    patient.bloodTests?.reduce((acc, bt) => acc + bt.price, 0) || 0;
  const discountValue = testTotal * (patient.discountPercentage / 100);
  const remaining = testTotal - discountValue - patient.amountPaid;
  return { testTotal, discountValue, remaining };
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);

  // -----------------------------
  // Determine rank for sorting
  // (1) Not Collected
  // (2) Collected but not complete
  // (3) Completed
  // Then newest createdAt first
  // -----------------------------
  function getRank(patient: Patient): number {
    // No sample => rank 1
    if (!patient.sampleCollectedAt) {
      return 1;
    }
    // Sample collected => check if all tests complete
    if (isAllTestsComplete(patient)) {
      return 3;
    } else {
      return 2;
    }
  }

  // -----------------------------
  // Fetch patients from Firebase
  // -----------------------------
  useEffect(() => {
    const patientsRef = ref(database, "patients");
    const unsubscribe = onValue(patientsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const patientList: Patient[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
          age: Number(data[key].age),
        }));

        // Sort by rank, then by createdAt descending
        const sorted = patientList.sort((a, b) => {
          const rankA = getRank(a);
          const rankB = getRank(b);
          if (rankA !== rankB) {
            return rankA - rankB;
          }
          // same rank => compare createdAt desc
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        setPatients(sorted);

        // Compute metrics
        const total = patientList.length;
        let completedCount = 0;
        for (const p of patientList) {
          if (isAllTestsComplete(p) && p.sampleCollectedAt) {
            completedCount++;
          }
        }
        const pending = total - completedCount;

        setMetrics({
          totalTests: total,
          pendingReports: pending,
          completedTests: completedCount,
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // -----------------------------
  // Filter logic
  // -----------------------------
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = selectedDate
        ? p.createdAt.startsWith(selectedDate)
        : true;

      // status logic
      const sampleCollected = !!p.sampleCollectedAt;
      const allComplete = isAllTestsComplete(p);

      let matchesStatus = true;
      switch (statusFilter) {
        case "notCollected":
          matchesStatus = !sampleCollected;
          break;
        case "sampleCollected":
          matchesStatus = sampleCollected && !allComplete;
          break;
        case "completed":
          matchesStatus = sampleCollected && allComplete;
          break;
        case "all":
        default:
          matchesStatus = true;
      }
      return matchesSearch && matchesDate && matchesStatus;
    });
  }, [patients, searchTerm, selectedDate, statusFilter]);

  // -----------------------------
  // Collect Sample
  // -----------------------------
  async function handleCollectSample(patient: Patient) {
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
  }

  // -----------------------------
  // Delete Patient
  // -----------------------------
  async function handleDeletePatient(patient: Patient) {
    if (!window.confirm(`Are you sure you want to delete ${patient.name}?`)) {
      return;
    }
    try {
      const patientRef = ref(database, `patients/${patient.id}`);
      await remove(patientRef);
      alert(`${patient.name} has been deleted.`);
      if (expandedPatientId === patient.id) {
        setExpandedPatientId(null);
      }
    } catch (error) {
      console.error("Error deleting patient:", error);
      alert("Error deleting patient. Please try again.");
    }
  }

  // -----------------------------
  // Update Payment
  // -----------------------------
  async function handleUpdateAmount(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPatient) return;
    try {
      const updatedAmount = selectedPatient.amountPaid + newAmountPaid;
      // const { testTotal, discountValue } = calculateAmounts(selectedPatient);
      // const newRemaining = testTotal - discountValue - updatedAmount;
      const patientRef = ref(database, `patients/${selectedPatient.id}`);

      // Update in Firebase
      await update(patientRef, {
        amountPaid: updatedAmount,
        // push to the end of paymentHistory
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
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm flex items-center justify-between p-4 md:px-8">
        <div className="flex items-center space-x-4">
          <p className="text-3xl font-medium text-blue-600">InfiCare</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 md:p-6">
        {/* Filters */}
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-2 border rounded-md"
          >
            <option value="all">All</option>
            <option value="notCollected">Not Collected</option>
            <option value="sampleCollected">Pending</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Metrics */}
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
                  const sampleCollected = !!patient.sampleCollectedAt;
                  const allComplete = isAllTestsComplete(patient);

                  let statusLabel = "Not Collected";
                  if (sampleCollected && !allComplete) {
                    statusLabel = "Pending";
                  } else if (sampleCollected && allComplete) {
                    statusLabel = "Completed";
                  }

                  const { remaining } = calculateAmounts(patient);

                  return (
                    <React.Fragment key={patient.id}>
                      <tr className="hover:bg-gray-50">
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
                              {patient.bloodTests.map((test) => {
                                const completed = isTestFullyEntered(patient, test);
                                return (
                                  <li
                                    key={test.testId}
                                    className={
                                      completed
                                        ? "text-green-600"
                                        : "text-red-500"
                                    }
                                  >
                                    {test.testName}
                                  </li>
                                );
                              })}
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
                          {statusLabel === "Pending" && (
                            <span className="px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                              Pending
                            </span>
                          )}
                          {statusLabel === "Completed" && (
                            <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                              Completed
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {remaining > 0 ? (
                            <span className="text-red-600 font-bold">
                              ₹{remaining.toFixed(2)}
                            </span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() =>
                              setExpandedPatientId(
                                expandedPatientId === patient.id ? null : patient.id
                              )
                            }
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                          >
                            Actions
                          </button>
                        </td>
                      </tr>
                      {expandedPatientId === patient.id && (
                        <tr>
                          <td colSpan={6} className="bg-gray-50">
                            <div className="p-4 flex flex-wrap gap-2">
                              {!sampleCollected && (
                                <button
                                  onClick={() => handleCollectSample(patient)}
                                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors"
                                >
                                  Collect Sample
                                </button>
                              )}
                              {sampleCollected && !allComplete && (
                                <Link
                                  href={`/blood-values/new?patientId=${patient.id}`}
                                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                                >
                                  <DocumentPlusIcon className="h-4 w-4 mr-2" />
                                  Add/Edit Values
                                </Link>
                              )}
                              {sampleCollected && allComplete && (
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
                              )}
                              <button
                                onClick={() => {
                                  setSelectedPatient(patient);
                                  setNewAmountPaid(0);
                                }}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                              >
                                Update Payment
                              </button>
                              <Link
                                href={`/patient-detail?patientId=${patient.id}`}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 transition-colors"
                              >
                                Edit Details
                              </Link>
                              <button
                                onClick={() => handleDeletePatient(patient)}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
