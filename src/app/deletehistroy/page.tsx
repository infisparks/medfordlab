"use client"

import type React from "react"
import { useEffect, useState, useMemo } from "react"
import { ref, get } from "firebase/database"
import { database } from "../../firebase"
import Link from "next/link"
import {
  CalendarIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  ArrowLeftIcon,
  ClipboardDocumentListIcon,
  FunnelIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline"

/* ─────────────────── Types ─────────────────── */
interface BloodTest {
  price: number
  testId?: string
  testName: string
  testType: string
}

interface Payment {
  amount: number
  paymentMode: string
  time: string
}

interface Patient {
  id?: string // Firebase key
  name: string
  gender: string
  age: number | string
  contact: string
  /** Flat discount in Indian Rupees (₹) */
  discountAmount: number
  amountPaid: number
  bloodTests: BloodTest[]
  /** ISO string (or YYYY-MM-DD) used for the date filter */
  registrationDate: string
  createdAt: string
  paymentHistory?: Payment[]
  deleted?: boolean
  deletedAt?: string
  deleteRequest?: {
    reason: string
    requestedBy: string
    requestedAt: string
  }
  sampleCollectedAt?: string
  doctorName?: string
}

/* ------------------------------------------------------------------ */
const DeletedAppointments: React.FC = () => {
  /* ─────────────────── State ─────────────────── */
  const [patients, setPatients] = useState<Patient[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  /* ─────────────────── Initialize date filters ─────────────────── */
  useEffect(() => {
    // Set default date range to last 3 months
    const today = new Date()
    const threeMonthsAgo = new Date(today)
    threeMonthsAgo.setMonth(today.getMonth() - 3)

    setFromDate(formatDate(threeMonthsAgo))
    setToDate(formatDate(today))
  }, [])

  const formatDate = (date: Date): string => {
    return date.toISOString().split("T")[0]
  }

  /* ─────────────────── Derived ─────────────────── */
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      // Only include deleted patients
      if (!patient.deleted) return false

      // Search filter
      const matchesSearch =
        patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (patient.contact && patient.contact.includes(searchTerm))

      // Date range filter
      let matchesDate = true
      // Use deletedAt date for filtering if available, otherwise fall back to registration date
      const patientDate = patient.deletedAt
        ? patient.deletedAt.split("T")[0]
        : patient.registrationDate || (patient.createdAt ? patient.createdAt.split("T")[0] : "")

      if (fromDate && patientDate) {
        matchesDate = matchesDate && patientDate >= fromDate
      }

      if (toDate && patientDate) {
        matchesDate = matchesDate && patientDate <= toDate
      }

      return matchesSearch && matchesDate
    })
  }, [patients, searchTerm, fromDate, toDate])

  /* ─────────────────── Effects ─────────────────── */
  useEffect(() => {
    const patientsRef = ref(database, "patients")

    get(patientsRef)
      .then((snapshot) => {
        if (snapshot.exists()) {
          const dataObj = snapshot.val()
          /* Convert the object keyed by Firebase IDs into an array */
          const dataArray: Patient[] = Object.keys(dataObj).map((key) => ({
            id: key,
            ...dataObj[key],
            age: Number(dataObj[key].age),
            discountAmount: Number(dataObj[key].discountAmount) || 0,
          }))
          setPatients(dataArray)
        }
      })
      .catch((err) => console.error("Error fetching patients:", err))
  }, [])

  /* ─────────────────── Render ─────────────────── */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ───── Header ───── */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <UserCircleIcon className="h-8 w-8 text-red-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Deleted Appointments</h1>
                <p className="text-sm text-gray-500">View and manage deleted patient records</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/admin" className="flex items-center space-x-2 text-blue-600 hover:text-blue-700">
                <ArrowLeftIcon className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </Link>
              <div className="h-10 w-10 bg-red-50 rounded-full flex items-center justify-center">
                <ClipboardDocumentListIcon className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* ───── Basic Filters ───── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or contact..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-colors"
            />
          </div>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-colors"
              placeholder="From Date"
            />
          </div>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-colors"
              placeholder="To Date"
            />
          </div>
        </div>

        {/* ───── Advanced Filters ───── */}
        <div className="mb-8">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex items-center space-x-2 text-red-600 mb-4"
          >
            <FunnelIcon className="h-5 w-5" />
            <span>{isFilterOpen ? "Hide Advanced Filters" : "Show Advanced Filters"}</span>
          </button>

          {isFilterOpen && (
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Deletion Date Range</label>
                  <p className="text-sm text-gray-500">Filter by when appointments were deleted from the system</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ───── Deleted Patients Notice ───── */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8 flex items-start space-x-3">
          <ExclamationTriangleIcon className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-800">Deleted Appointments</h3>
            <p className="text-sm text-red-700 mt-1">
              These appointments have been marked as deleted and are not included in financial calculations or reports.
              Click on any appointment to view its details.
            </p>
          </div>
        </div>

        {/* ───── Deleted Patients Table ───── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-base font-semibold text-gray-900">Deleted Appointment Records</h3>
            <p className="text-sm text-gray-500">
              {filteredPatients.length} {filteredPatients.length === 1 ? "record" : "records"} found
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["Date Deleted", "Patient", "Contact", "Tests", "Reason for Deletion", "Deleted By"].map((head) => (
                    <th
                      key={head}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPatients.length > 0 ? (
                  filteredPatients.map((patient) => {
                    const testNames = patient.bloodTests?.map((bt) => bt.testName).join(", ") || "No tests"
                    const deletedDate = patient.deletedAt ? new Date(patient.deletedAt).toLocaleDateString() : "Unknown"
                    const deleteReason = patient.deleteRequest?.reason || "No reason provided"
                    const deletedBy = patient.deleteRequest?.requestedBy || "Admin"

                    return (
                      <tr
                        key={patient.id}
                        className="hover:bg-red-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedPatient(patient)}
                      >
                        <td className="px-6 py-4 text-sm text-gray-700">{deletedDate}</td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                          <div className="text-sm text-gray-500">
                            {patient.gender}, {patient.age}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{patient.contact}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{testNames}</td>
                        <td className="px-6 py-4 text-sm text-gray-700 max-w-xs truncate">{deleteReason}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">{deletedBy}</td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No deleted appointments found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ───── Deleted Patient Detail Modal ───── */}
      {selectedPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-11/12 md:w-2/3 lg:w-1/2 max-h-[90vh] overflow-y-auto shadow-lg">
            <div className="flex justify-between items-center mb-4 sticky top-0 bg-white pb-2">
              <h2 className="text-xl font-bold">Deleted Appointment Details</h2>
              <button onClick={() => setSelectedPatient(null)} className="text-red-600 font-bold">
                Close
              </button>
            </div>

            {/* Deletion Info */}
            <div className="bg-red-50 p-4 rounded-lg mb-6">
              <h3 className="font-medium text-red-800 mb-2">Deletion Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Deleted On:</p>
                  <p className="font-medium">
                    {selectedPatient.deletedAt ? new Date(selectedPatient.deletedAt).toLocaleString() : "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Deleted By:</p>
                  <p className="font-medium">{selectedPatient.deleteRequest?.requestedBy || "Admin"}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-gray-600">Reason for Deletion:</p>
                  <p className="font-medium">{selectedPatient.deleteRequest?.reason || "No reason provided"}</p>
                </div>
              </div>
            </div>

            {/* Patient Info */}
            <div className="mb-6">
              <h3 className="font-medium text-gray-800 mb-2">Patient Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Name:</p>
                  <p className="font-medium">{selectedPatient.name}</p>
                </div>
                <div>
                  <p className="text-gray-600">Contact:</p>
                  <p className="font-medium">{selectedPatient.contact || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-gray-600">Age/Gender:</p>
                  <p className="font-medium">
                    {selectedPatient.age} years, {selectedPatient.gender}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Doctor:</p>
                  <p className="font-medium">{selectedPatient.doctorName || "Not provided"}</p>
                </div>
                <div>
                  <p className="text-gray-600">Registration Date:</p>
                  <p className="font-medium">
                    {selectedPatient.createdAt ? new Date(selectedPatient.createdAt).toLocaleDateString() : "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Sample Collected:</p>
                  <p className="font-medium">
                    {selectedPatient.sampleCollectedAt
                      ? new Date(selectedPatient.sampleCollectedAt).toLocaleString()
                      : "Not collected"}
                  </p>
                </div>
              </div>
            </div>

            {/* Tests Info */}
            <div className="mb-6">
              <h3 className="font-medium text-gray-800 mb-2">Test Information</h3>
              {selectedPatient.bloodTests && selectedPatient.bloodTests.length > 0 ? (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Test Name</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPatient.bloodTests.map((test, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-4 py-2">{test.testName}</td>
                        <td className="px-4 py-2">{test.testType || "Standard"}</td>
                        <td className="px-4 py-2 text-right">₹{test.price.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="border-t font-medium">
                      <td colSpan={2} className="px-4 py-2 text-right">
                        Total:
                      </td>
                      <td className="px-4 py-2 text-right">
                        ₹{selectedPatient.bloodTests.reduce((sum, test) => sum + test.price, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-600">No tests were ordered for this patient.</p>
              )}
            </div>

            {/* Payment Info */}
            <div>
              <h3 className="font-medium text-gray-800 mb-2">Payment Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                <div>
                  <p className="text-gray-600">Total Amount:</p>
                  <p className="font-medium">
                    ₹{selectedPatient.bloodTests?.reduce((sum, test) => sum + test.price, 0).toFixed(2) || "0.00"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Discount:</p>
                  <p className="font-medium text-red-600">-₹{selectedPatient.discountAmount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Amount Paid:</p>
                  <p className="font-medium text-green-600">₹{(selectedPatient.amountPaid || 0).toFixed(2)}</p>
                </div>
              </div>

              {/* Payment History */}
              {selectedPatient.paymentHistory && selectedPatient.paymentHistory.length > 0 ? (
                <>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Payment History</h4>
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Date & Time</th>
                        <th className="px-4 py-2 text-left">Method</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPatient.paymentHistory.map((payment, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-4 py-2">{new Date(payment.time).toLocaleString()}</td>
                          <td className="px-4 py-2 capitalize">{payment.paymentMode}</td>
                          <td className="px-4 py-2 text-right">₹{payment.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="text-gray-600">No payment history available.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeletedAppointments
