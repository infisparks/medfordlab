"use client"

import type React from "react"
import { useState, useMemo, useCallback } from "react"
import Link from "next/link"
import {
  CalendarIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  CurrencyDollarIcon,
  TagIcon,
  ScaleIcon,
  ReceiptRefundIcon,
  ClipboardDocumentListIcon,
  FunnelIcon,
  TrashIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline"
import { usePatientData } from "./hooks/use-patient-data"

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
}

type PaymentStatus = "all" | "paid" | "unpaid" | "partial"

/* ------------------------------------------------------------------ */
const AdminPanel: React.FC = () => {
  /* ─────────────────── State ─────────────────── */
  const [searchTerm, setSearchTerm] = useState("")
  const [fromDate, setFromDate] = useState(formatDate(new Date())) // Default to today
  const [toDate, setToDate] = useState(formatDate(new Date())) // Default to today
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("all")
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [pageSize, setPageSize] = useState(50)
  const [userChangedDates, setUserChangedDates] = useState(false)

  const { patients, isLoading, hasMore, loadMorePatients, fetchPatients } = usePatientData({
    fromDate,
    toDate,
    pageSize,
  })

  /* ─────────────────── Helper functions ─────────────────── */
  function formatDate(date: Date): string {
    return date.toISOString().split("T")[0]
  }

  /* ─────────────────── Event handlers ─────────────────── */
  const handleFromDateChange = (newDate: string) => {
    setFromDate(newDate)
    setUserChangedDates(true)

    // Ensure toDate is not more than 30 days after fromDate
    if (newDate) {
      const from = new Date(newDate)
      const maxToDate = new Date(from)
      maxToDate.setDate(from.getDate() + 30)

      const currentTo = toDate ? new Date(toDate) : null
      if (currentTo && currentTo > maxToDate) {
        setToDate(formatDate(maxToDate))
      }
    }
  }

  const handleToDateChange = (newDate: string) => {
    setToDate(newDate)
    setUserChangedDates(true)
  }

  const resetToToday = useCallback(() => {
    const today = new Date()
    const formattedToday = formatDate(today)
    setFromDate(formattedToday)
    setToDate(formattedToday)
    setUserChangedDates(false)
    fetchPatients()
  }, [fetchPatients])

  /* ─────────────────── Derived ─────────────────── */
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      // Exclude deleted patients
      if (patient.deleted) return false

      // Search filter
      const matchesSearch = patient.name.toLowerCase().includes(searchTerm.toLowerCase())

      // Payment status filter
      let matchesPaymentStatus = true
      if (paymentStatus !== "all") {
        const testTotal = patient.bloodTests.reduce((acc, bt) => acc + (Number(bt.price) || 0), 0)
        const discountValue = Number(patient.discountAmount) || 0
        const amountPaid = Number(patient.amountPaid) || 0
        const remaining = testTotal - discountValue - amountPaid

        if (paymentStatus === "paid") {
          matchesPaymentStatus = remaining <= 0
        } else if (paymentStatus === "unpaid") {
          matchesPaymentStatus = amountPaid <= 0
        } else if (paymentStatus === "partial") {
          matchesPaymentStatus = amountPaid > 0 && remaining > 0
        }
      }

      return matchesSearch && matchesPaymentStatus
    })
  }, [patients, searchTerm, paymentStatus])

  const summary = useMemo(() => {
    let totalDiscount = 0
    let totalPaid = 0
    let totalRemaining = 0
    let netBilling = 0
    let totalOnline = 0
    let totalCash = 0

    filteredPatients.forEach((patient) => {
      // Skip deleted patients in calculations
      if (patient.deleted) return

      const testTotal = patient.bloodTests.reduce((acc, bt) => acc + (Number(bt.price) || 0), 0)
      const discountValue = Number(patient.discountAmount) || 0
      const remaining = testTotal - discountValue - (patient.amountPaid || 0)

      totalDiscount += discountValue
      totalPaid += patient.amountPaid || 0
      totalRemaining += remaining
      netBilling += testTotal - discountValue

      if (Array.isArray(patient.paymentHistory)) {
        patient.paymentHistory.forEach((payment) => {
          if (payment.paymentMode === "online") totalOnline += payment.amount
          else if (payment.paymentMode === "cash") totalCash += payment.amount
        })
      }
    })

    return {
      totalDiscount,
      netBilling,
      totalPaid,
      totalRemaining,
      totalOnline,
      totalCash,
    }
  }, [filteredPatients])

  /* ─────────────────── Render ─────────────────── */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ───── Header ───── */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <UserCircleIcon className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Patient Billing Portal</h1>
                <p className="text-sm text-gray-500">Administrative Dashboard</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/deletehistroy"
                className="flex items-center space-x-2 text-red-600 hover:text-red-700"
              >
                <TrashIcon className="h-5 w-5" />
                <span>View Deleted Appointments</span>
              </Link>
              <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center">
                <ClipboardDocumentListIcon className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* ───── Basic Filters ───── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
            />
          </div>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleFromDateChange(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
              placeholder="From Date"
            />
          </div>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleToDateChange(e.target.value)}
              max={
                fromDate
                  ? (() => {
                      const maxDate = new Date(fromDate)
                      maxDate.setDate(maxDate.getDate() + 30)
                      return formatDate(maxDate)
                    })()
                  : undefined
              }
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
              placeholder="To Date"
            />
          </div>
        </div>

        {/* Date range indicator */}
        <div className="col-span-1 md:col-span-3 text-sm text-gray-500 mb-4">
          {!userChangedDates ? (
            <div className="flex items-center">
              <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                Todays data only
              </span>
              <span className="ml-2">Change dates to view historical data</span>
            </div>
          ) : (
            <div className="flex items-center">
              <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2.5 py-0.5 rounded">
                Custom date range
              </span>
              <button onClick={resetToToday} className="ml-2 text-blue-600 hover:text-blue-800 flex items-center">
                <ArrowPathIcon className="h-3 w-3 mr-1" />
                Reset to today
              </button>
            </div>
          )}
        </div>

        {/* ───── Advanced Filters ───── */}
        <div className="mb-8">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex items-center space-x-2 text-blue-600 mb-4"
          >
            <FunnelIcon className="h-5 w-5" />
            <span>{isFilterOpen ? "Hide Advanced Filters" : "Show Advanced Filters"}</span>
          </button>

          {isFilterOpen && (
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                  >
                    <option value="all">All Patients</option>
                    <option value="paid">Fully Paid</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partially Paid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Records Per Page</label>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      // Reset and refetch when page size changes
                      fetchPatients()
                    }}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                  >
                    <option value={25}>25 records</option>
                    <option value={50}>50 records</option>
                    <option value={100}>100 records</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ───── Summary Cards ───── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {isLoading && filteredPatients.length === 0 ? (
            <div className="col-span-1 md:col-span-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center">
              <p className="text-gray-500">Loading patient data...</p>
            </div>
          ) : (
            <>
              {/* Net Billing */}
              <SummaryCard
                label="Net Billing"
                value={summary.netBilling}
                Icon={ScaleIcon}
                iconBg="bg-green-100"
                iconColor="text-green-600"
              />
              {/* Total Discount */}
              <SummaryCard
                label="Total Discount"
                value={summary.totalDiscount}
                Icon={TagIcon}
                iconBg="bg-purple-100"
                iconColor="text-purple-600"
              />
              {/* Amount Paid (with breakdown) */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex flex-col items-start">
                  <div className="flex items-center justify-between w-full">
                    <SummaryHeader label="Amount Paid" Icon={CurrencyDollarIcon} />
                    <p className="text-2xl font-semibold text-gray-900">₹{summary.totalPaid.toFixed(2)}</p>
                  </div>
                  <div className="mt-2 text-sm text-gray-700">
                    <p>Online: ₹{summary.totalOnline.toFixed(2)}</p>
                    <p>Cash:&nbsp;&nbsp; ₹{summary.totalCash.toFixed(2)}</p>
                  </div>
                </div>
              </div>
              {/* Remaining Amount */}
              <SummaryCard
                label="Remaining Amount"
                value={summary.totalRemaining}
                Icon={ReceiptRefundIcon}
                iconBg="bg-red-100"
                iconColor="text-red-600"
              />
            </>
          )}
        </div>

        {/* ───── Patients Table ───── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-base font-semibold text-gray-900">Patient Records</h3>
            <div className="flex items-center">
              {isLoading && (
                <span className="inline-flex items-center mr-3 text-sm text-gray-500">
                  <ArrowPathIcon className="h-4 w-4 mr-1 animate-spin" />
                  Loading...
                </span>
              )}
              <p className="text-sm text-gray-500">
                {filteredPatients.length} {filteredPatients.length === 1 ? "patient" : "patients"} found
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHeader />
              <tbody className="divide-y divide-gray-100">
                {filteredPatients.length > 0 ? (
                  filteredPatients.map((patient) => {
                    const testTotal = patient.bloodTests.reduce((acc, bt) => acc + (Number(bt.price) || 0), 0)
                    const discountValue = Number(patient.discountAmount) || 0
                    const remaining = testTotal - discountValue - (patient.amountPaid || 0)
                    const testNames = patient.bloodTests.map((bt) => bt.testName).join(", ")

                    // Use registrationDate as primary date, fallback to createdAt
                    const displayDate =
                      patient.registrationDate || (patient.createdAt ? patient.createdAt.split("T")[0] : "N/A")

                    return (
                      <tr
                        key={patient.id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedPatient(patient)}
                      >
                        <td className="px-6 py-4 text-sm text-gray-700">{displayDate}</td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                          <div className="text-sm text-gray-500">
                            {patient.gender}, {patient.age}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{patient.contact}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{testNames}</td>
                        <td className="px-6 py-4 text-sm text-gray-700 text-right">₹{testTotal.toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm text-red-600 text-right">-₹{discountValue.toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm text-green-600 text-right">
                          ₹{(patient.amountPaid || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-orange-600 text-right">₹{remaining.toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {remaining <= 0 ? (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Paid</span>
                          ) : patient.amountPaid > 0 ? (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                              Partial
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">Unpaid</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                      {isLoading ? "Loading patient data..." : "No patients found matching your filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="flex justify-center p-4 border-t border-gray-100">
              <button
                onClick={loadMorePatients}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {isLoading ? "Loading..." : "Load More Patients"}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ───── Payment History Modal ───── */}
      {selectedPatient && <PaymentHistoryModal patient={selectedPatient} onClose={() => setSelectedPatient(null)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Reusable Sub-components                                             */
/* ------------------------------------------------------------------ */
interface SummaryCardProps {
  label: string
  value: number
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  iconBg: string
  iconColor: string
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, Icon, iconBg, iconColor }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600 mb-1">{label}</p>
        <p className="text-2xl font-semibold text-gray-900">₹{value.toFixed(2)}</p>
      </div>
      <div className={`${iconBg} p-3 rounded-lg`}>
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </div>
    </div>
  </div>
)

const SummaryHeader: React.FC<{
  label: string
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
}> = ({ label, Icon }) => (
  <div className="flex items-center space-x-2">
    <p className="text-sm font-medium text-gray-600 mb-1">{label}</p>
    <Icon className="h-5 w-5 text-blue-600" />
  </div>
)

const TableHeader: React.FC = () => (
  <thead className="bg-gray-50">
    <tr>
      {["Date", "Patient", "Contact", "Tests", "Total", "Discount", "Paid", "Due", "Status"].map((head) => (
        <th key={head} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          {head}
        </th>
      ))}
    </tr>
  </thead>
)

interface PaymentHistoryModalProps {
  patient: Patient
  onClose: () => void
}

const PaymentHistoryModal: React.FC<PaymentHistoryModalProps> = ({ patient, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-lg w-11/12 md:w-1/2 lg:w-1/3 shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Payment History for {patient.name}</h2>
        <button onClick={onClose} className="text-red-600 font-bold">
          Close
        </button>
      </div>
      {Array.isArray(patient.paymentHistory) && patient.paymentHistory.length > 0 ? (
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Time</th>
              <th className="px-4 py-2 text-left">Method</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {patient.paymentHistory.map((payment, idx) => (
              <tr key={idx} className="border-t last:border-b">
                <td className="px-4 py-2">{new Date(payment.time).toLocaleString()}</td>
                <td className="px-4 py-2 capitalize">{payment.paymentMode}</td>
                <td className="px-4 py-2 text-right">₹{payment.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-gray-600">No payment history available.</p>
      )}
    </div>
  </div>
)

export default AdminPanel
