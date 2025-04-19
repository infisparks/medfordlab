"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { database } from "../firebase";
import { toWords } from 'number-to-words';

import { ref, onValue, update, remove } from "firebase/database";
import {
  UserIcon,
  ChartBarIcon,
  ClockIcon,
  UserGroupIcon,
  DocumentPlusIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import letterhead from "../../public/bill.png";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import FakeBill from "./component/FakeBill";   // <-- Fake bill component

/* --------------------  Types  -------------------- */
interface BloodTest {
  testId: string;
  testName: string;
  price: number;
  testType?: string;
}

interface Patient {
  id: string;
  name: string;
  patientId: string;
  age: number;
  gender: string;
  contact?: string;
  createdAt: string;
  doctorName: string;
  discountAmount: number; // ₹ flat discount
  amountPaid: number;
  bloodTests?: BloodTest[];
  bloodtest?: Record<string, any>;
  report?: boolean;
  sampleCollectedAt?: string;
  paymentHistory?: { amount: number; paymentMode: string; time: string }[];
}

/* --------------------  Utilities  -------------------- */
const slugifyTestName = (name: string) =>
  name.toLowerCase().replace(/\s+/g, "_").replace(/[.#$[\]]/g, "");

const isTestFullyEntered = (p: Patient, t: BloodTest): boolean => {
  if (t.testType?.toLowerCase() === "outsource") return true;
  if (!p.bloodtest) return false;
  const data = p.bloodtest[slugifyTestName(t.testName)];
  if (!data?.parameters) return false;
  return data.parameters.every((par: any) => par.value !== "" && par.value != null);
};

const isAllTestsComplete = (p: Patient) =>
  !p.bloodTests?.length || p.bloodTests.every((bt) => isTestFullyEntered(p, bt));

const calculateAmounts = (p: Patient) => {
  const testTotal = p.bloodTests?.reduce((s, t) => s + t.price, 0) || 0;
  const remaining = testTotal - Number(p.discountAmount || 0) - Number(p.amountPaid || 0);
  return { testTotal, remaining };
};

/* --------------------  Component  -------------------- */
export default function Dashboard() {
  /* --- state --- */
  const [patients, setPatients] = useState<Patient[]>([]);
  const [metrics, setMetrics] = useState({
    totalTests: 0,
    pendingReports: 0,
    completedTests: 0,
  });
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newAmountPaid, setNewAmountPaid] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<string>("online");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [fakeBillPatient, setFakeBillPatient] = useState<Patient | null>(null); // <-- NEW

  /* --- helpers --- */
  const getRank = (p: Patient) => (!p.sampleCollectedAt ? 1 : isAllTestsComplete(p) ? 3 : 2);

  /* --- fetch patients --- */
  useEffect(() => {
    const unsub = onValue(ref(database, "patients"), (snap) => {
      if (!snap.exists()) return;
      const arr: Patient[] = Object.entries<any>(snap.val()).map(([id, d]) => ({
        id,
        ...d,
        discountAmount: Number(d.discountAmount || 0),
        age: Number(d.age),
      }));
      arr.sort((a, b) => {
        const r = getRank(a) - getRank(b);
        return r !== 0 ? r : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setPatients(arr);

      /* metrics */
      const total = arr.length;
      const completed = arr.filter((p) => p.sampleCollectedAt && isAllTestsComplete(p)).length;
      setMetrics({
        totalTests: total,
        completedTests: completed,
        pendingReports: total - completed,
      });
    });
    return unsub;
  }, []);

  /* --- filters --- */
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      const term = searchTerm.trim().toLowerCase();
const matchesSearch =
  !term ||
  p.name.toLowerCase().includes(term) ||
  (p.contact ?? "").includes(term);

      const matchesDate = selectedDate ? p.createdAt.startsWith(selectedDate) : true;
      const sampleCollected = !!p.sampleCollectedAt;
      const complete = isAllTestsComplete(p);
      let matchesStatus = true;
      switch (statusFilter) {
        case "notCollected":
          matchesStatus = !sampleCollected;
          break;
        case "sampleCollected":
          matchesStatus = sampleCollected && !complete;
          break;
        case "completed":
          matchesStatus = sampleCollected && complete;
          break;
      }
      return matchesSearch && matchesDate && matchesStatus;
    });
  }, [patients, searchTerm, selectedDate, statusFilter]);

  /* --- actions --- */
  const handleCollectSample = async (p: Patient) => {
    try {
      await update(ref(database, `patients/${p.id}`), { sampleCollectedAt: new Date().toISOString() });
      alert(`Sample collected for ${p.name}!`);
    } catch (e) {
      console.error(e);
      alert("Error collecting sample.");
    }
  };

  const handleDeletePatient = async (p: Patient) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    try {
      await remove(ref(database, `patients/${p.id}`));
      if (expandedPatientId === p.id) setExpandedPatientId(null);
      alert("Deleted!");
    } catch (e) {
      console.error(e);
      alert("Error deleting.");
    }
  };

  const handleUpdateAmount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    // parse the string, default to 0 if empty or invalid
    const added = parseFloat(newAmountPaid) || 0;
    const updatedAmountPaid = selectedPatient.amountPaid + added;
  
    await update(ref(database, `patients/${selectedPatient.id}`), {
      amountPaid: updatedAmountPaid,
      paymentHistory: [
        ...(selectedPatient.paymentHistory || []),
        { amount: added, paymentMode, time: new Date().toISOString() },
      ],
    });
    // reset the field back to empty string
    setNewAmountPaid("");
    setSelectedPatient(null);
    setPaymentMode("online");
    alert("Payment updated!");
  };
  

  /* --- download bill (real) --- */
  const handleDownloadBill = () => {
    if (!selectedPatient) return;
  
    const img = new Image();
    img.src = (letterhead as any).src ?? (letterhead as any);
    img.onload = () => {
      // Draw letterhead into a canvas to get a data URL
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const bgDataUrl = canvas.toDataURL("image/jpeg", 0.5); // 50% quality
  
      // Create PDF
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
  
      doc.addImage(bgDataUrl, "JPEG", 0, 0, pageW, pageH);
      doc.setFont("helvetica", "normal").setFontSize(12);
  
      // Patient details two‐column layout
      const margin = 14;
      const colMid = pageW / 2;
      const leftKeyX = margin;
      const leftColonX = margin + 40;
      const leftValueX = margin + 44;
      const rightKeyX = colMid + margin;
      const rightColonX = colMid + margin + 40;
      const rightValueX = colMid + margin + 44;
  
      let y = 70;
      const drawRow = (kL: string, vL: string, kR: string, vR: string) => {
        doc.text(kL, leftKeyX, y);
        doc.text(":", leftColonX, y);
        doc.text(vL, leftValueX, y);
        doc.text(kR, rightKeyX, y);
        doc.text(":", rightColonX, y);
        doc.text(vR, rightValueX, y);
        y += 6;
      };
  
      drawRow("Name", selectedPatient.name, "Patient ID", selectedPatient.patientId);
      drawRow(
        "Age / Gender",
        `${selectedPatient.age} y / ${selectedPatient.gender}`,
        "Registration Date",
        new Date(selectedPatient.createdAt).toLocaleDateString()
      );
      drawRow(
        "Ref. Doctor",
        selectedPatient.doctorName ?? "N/A",
        "Contact",
        selectedPatient.contact ?? "N/A"
      );
      y += 4;
  
      // Tests table
      const rows = selectedPatient.bloodTests?.map(t => [t.testName, t.price.toFixed(2)]) ?? [];
      autoTable(doc, {
        head: [["Test Name", "Amount"]],
        body: rows,
        startY: y,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 11 },
        headStyles: { fillColor: [30, 79, 145], fontStyle: "bold" },
        columnStyles: { 1: { fontStyle: "bold" } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
  
      // Summary & amount in words
      const { testTotal, remaining } = calculateAmounts(selectedPatient);
      const remainingWords = toWords(Math.round(remaining));
  
      autoTable(doc, {
        head: [["Description", "Amount"]],
        body: [
          ["Test Total", testTotal.toFixed(2)],
          ["Discount", selectedPatient.discountAmount.toFixed(2)],
          ["Amount Paid", selectedPatient.amountPaid.toFixed(2)],
          ["Remaining", remaining.toFixed(2)],
        ],
        startY: y,
        theme: "plain",
        styles: { font: "helvetica", fontSize: 11 },
        columnStyles: { 1: { fontStyle: "bold" } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
  
      // Print remaining in words, right-aligned
      doc
        .setFont("helvetica", "normal")
        .setFontSize(10)
        .text(
          `(${remainingWords.charAt(0).toUpperCase() + remainingWords.slice(1)} only)`,
          pageW - margin,
          y,
          { align: "right" }
        );
      y += 12;
  
      // Footer
      doc
        .setFont("helvetica", "italic")
        .setFontSize(10)
        .text("Thank you for choosing our services!", pageW / 2, y, { align: "center" });
  
      // Save PDF
      doc.save(`Bill_${selectedPatient.name}.pdf`);
    };
  
    img.onerror = () => alert("Failed to load letterhead image.");
  };

  /* --------------------  RENDER  -------------------- */
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm flex items-center justify-between p-4 md:px-8">
        <p className="text-3xl font-medium text-blue-600">InfiCare</p>
      </header>

      <main className="p-4 md:p-6">
        {/* filters */}
        <div className="mb-4 flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Search name or phone..."
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

        {/* metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[
            { icon: ChartBarIcon, label: "Total Tests", val: metrics.totalTests, bg: "blue" },
            {
              icon: ClockIcon,
              label: "Pending Reports",
              val: metrics.pendingReports,
              bg: "yellow",
            },
            {
              icon: UserGroupIcon,
              label: "Completed Tests",
              val: metrics.completedTests,
              bg: "green",
            },
          ].map((m, i) => (
            <div key={i} className="bg-white p-6 rounded-xl shadow-sm border">
              <div className="flex items-center space-x-4">
                <div className={`p-3 bg-${m.bg}-50 rounded-lg`}>
                  {React.createElement(m.icon, { className: `h-6 w-6 text-${m.bg}-600` })}
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">{m.label}</p>
                  <p className="text-2xl font-semibold">{m.val}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* patient table */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold flex items-center">
              <UserIcon className="h-5 w-5 mr-2 text-gray-600" />
              Recent Patients
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                {["Patient", "Tests", "Entry Date", "Status", "Remaining", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-sm font-medium text-gray-500"
                    >
                      {h}
                    </th>
                  ),
                )}
              </thead>
              <tbody className="divide-y">
                {filteredPatients.map((p) => {
                  const sampleCollected = !!p.sampleCollectedAt;
                  const complete = isAllTestsComplete(p);
                  const status = !sampleCollected
                    ? "Not Collected"
                    : complete
                    ? "Completed"
                    : "Pending";
                  const { remaining } = calculateAmounts(p);

                  return (
                    <React.Fragment key={p.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-sm text-gray-500">
                            {p.age}y • {p.gender}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {p.bloodTests?.length ? (
                            <ul className="list-disc pl-4">
                              {p.bloodTests.map((t) => {
                                const done =
                                  t.testType?.toLowerCase() === "outsource" ||
                                  isTestFullyEntered(p, t);
                                return (
                                  <li
                                    key={t.testId}
                                    className={done ? "text-green-600" : "text-red-500"}
                                  >
                                    {t.testName}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <span className="text-gray-400">No tests</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          {status === "Not Collected" && (
                            <span className="px-3 py-1 text-xs rounded-full bg-red-100 text-red-800">
                              Not Collected
                            </span>
                          )}
                          {status === "Pending" && (
                            <span className="px-3 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                              Pending
                            </span>
                          )}
                          {status === "Completed" && (
                            <span className="px-3 py-1 text-xs rounded-full bg-green-100 text-green-800">
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
                              setExpandedPatientId(expandedPatientId === p.id ? null : p.id)
                            }
                            className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700"
                          >
                            Actions
                          </button>
                        </td>
                      </tr>

                      {expandedPatientId === p.id && (
                        <tr>
                          <td colSpan={6} className="bg-gray-50">
                            <div className="p-4 flex flex-wrap gap-2">
                              {!sampleCollected && (
                                <button
                                  onClick={() => handleCollectSample(p)}
                                  className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                                >
                                  Collect Sample
                                </button>
                              )}

                              {sampleCollected && (
                                <Link
                                  href={`/download-report?patientId=${p.id}`}
                                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                                >
                                  <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                                  Download Report
                                </Link>
                              )}

                              {sampleCollected && !complete && (
                                <Link
                                  href={`/blood-values/new?patientId=${p.id}`}
                                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                                >
                                  <DocumentPlusIcon className="h-4 w-4 mr-2" />
                                  Add/Edit Values
                                </Link>
                              )}

                              {sampleCollected && complete && (
                                <Link
                                  href={`/blood-values/new?patientId=${p.id}`}
                                  className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
                                >
                                  Edit Test
                                </Link>
                              )}

                              <button
                                onClick={() => {
                                  setSelectedPatient(p);
                                  setNewAmountPaid("");
                                }}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700"
                              >
                                Update Payment
                              </button>

                              {selectedPatient?.id === p.id && (
                                <button
                                  onClick={handleDownloadBill}
                                  className="inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-md text-sm hover:bg-teal-700"
                                >
                                  <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                                  Download Bill
                                </button>
                              )}

                              {/* ---- Generate Fake Bill button ---- */}
                              <button
                                onClick={() => setFakeBillPatient(p)}
                                className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700"
                              >
                                Generate  Bill
                              </button>

                              <Link
                                href={`/patient-detail?patientId=${p.id}`}
                                className="px-4 py-2 bg-orange-600 text-white rounded-md text-sm hover:bg-orange-700"
                              >
                                Edit Details
                              </Link>

                              <button
                                onClick={() => handleDeletePatient(p)}
                                className="px-4 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700"
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
              <div className="p-6 text-center text-gray-500">No recent patients found</div>
            )}
          </div>
        </div>
      </main>

      {/* Payment modal */}
      {selectedPatient && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
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
              const { testTotal, remaining } = calculateAmounts(selectedPatient);
              return (
                <div className="mb-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Test Total:</span>
                    <span>₹{testTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>₹{selectedPatient.discountAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current Paid:</span>
                    <span>₹{selectedPatient.amountPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Remaining:</span>
                    <span>₹{remaining.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            <div className="mb-4">
              <button
                onClick={handleDownloadBill}
                className="w-full bg-teal-600 text-white py-3 rounded-lg font-medium hover:bg-teal-700"
              >
                Download Bill
              </button>
            </div>

            <form onSubmit={handleUpdateAmount}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Additional Payment (Rs)
                </label>
                <input
       type="number"
       step="0.01"
       // now a string, so you can clear it
       value={newAmountPaid}
       onChange={(e) => setNewAmountPaid(e.target.value)}
       className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
       placeholder="Enter amount"   // removes the forced 0
     required
     />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700">Payment Mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="cash">Cash</option>
                  <option value="online">Online</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700"
              >
                Update Payment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Fake Bill modal */}
      {fakeBillPatient && (
        <FakeBill patient={fakeBillPatient} onClose={() => setFakeBillPatient(null)} />
      )}
    </div>
  );
}
