"use client"

import React, { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { database, auth } from "../firebase"
import { toWords } from "number-to-words"

import { ref, onValue, update, remove } from "firebase/database"
import { ref as dbRef, onValue as onValueDb } from "firebase/database" // ← to fetch role

import {
  UserIcon,
  ChartBarIcon,
  ClockIcon,
  UserGroupIcon,
  DocumentPlusIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline"
import letterhead from "../../public/bill.png"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import FakeBill from "./component/FakeBill" // <-- Fake bill component
import { onAuthStateChanged } from "firebase/auth"

// ← adjust path if needed

/* --------------------  Types  -------------------- */
interface BloodTest {
  testId: string
  testName: string
  price: number
  testType?: string
}

interface Patient {
  id: string
  name: string
  patientId: string
  age: number
  gender: string
  contact?: string
  createdAt: string
  doctorName: string
  discountAmount: number // ₹ flat discount
  amountPaid: number
  bloodTests?: BloodTest[]
  bloodtest?: Record<string, any>
  report?: boolean
  sampleCollectedAt?: string
  paymentHistory?: { amount: number; paymentMode: string; time: string }[]
  deleteRequest?: { reason: string; requestedBy: string; requestedAt: string }
  deleted?: boolean
}

/* --------------------  Utilities  -------------------- */
const slugifyTestName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[.#$[\]]/g, "")

const isTestFullyEntered = (p: Patient, t: BloodTest): boolean => {
  if (t.testType?.toLowerCase() === "outsource") return true
  if (!p.bloodtest) return false
  const data = p.bloodtest[slugifyTestName(t.testName)]
  if (!data?.parameters) return false
  return data.parameters.every((par: any) => par.value !== "" && par.value != null)
}

const isAllTestsComplete = (p: Patient) =>
  !p.bloodTests?.length || p.bloodTests.every((bt) => isTestFullyEntered(p, bt))

const calculateAmounts = (p: Patient) => {
  const testTotal = p.bloodTests?.reduce((s, t) => s + t.price, 0) || 0
  const remaining = testTotal - Number(p.discountAmount || 0) - Number(p.amountPaid || 0)
  return { testTotal, remaining }
}

const calculateTotalsForSelected = (selectedIds: string[], patients: Patient[]) => {
  const selected = patients.filter((p) => selectedIds.includes(p.id))
  const totalAmount = selected.reduce((sum, p) => {
    const { testTotal } = calculateAmounts(p)
    return sum + testTotal
  }, 0)
  const totalPaid = selected.reduce((sum, p) => sum + Number(p.amountPaid || 0), 0)
  const totalDiscount = selected.reduce((sum, p) => sum + Number(p.discountAmount || 0), 0)
  return { totalAmount, totalPaid, totalDiscount, remaining: totalAmount - totalPaid - totalDiscount }
}

// New utility to format current local time for datetime-local input
const formatLocalDateTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are 0-based
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/* --------------------  Component  -------------------- */
export default function Dashboard() {
  /* --- state --- */
  const [patients, setPatients] = useState<Patient[]>([])
  const [metrics, setMetrics] = useState({
    totalTests: 0,
    pendingReports: 0,
    completedTests: 0,
  })
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [newAmountPaid, setNewAmountPaid] = useState<string>("")
  const [paymentMode, setPaymentMode] = useState<string>("online")
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null)
  const [fakeBillPatient, setFakeBillPatient] = useState<Patient | null>(null) // <-- NEW
  const [selectedPatients, setSelectedPatients] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [showCheckboxes, setShowCheckboxes] = useState<boolean>(false)

  // ─────────────── date range for filtering ───────────────
  const todayStr = new Date().toISOString().slice(0, 10) // "YYYY‑MM‑DD"
  const [startDate, setStartDate] = useState<string>(todayStr)
  const [endDate, setEndDate] = useState<string>(todayStr)
  // ─────────────────────────────────────────────

  const [sampleModalPatient, setSampleModalPatient] = useState<Patient | null>(null)
  const [sampleDateTime, setSampleDateTime] = useState<string>(formatLocalDateTime)

  const [deleteRequestPatients, setDeleteRequestPatients] = useState<
    Record<string, { reason: string; requestedBy: string }>
  >({})
  const [deletedPatients, setDeletedPatients] = useState<string[]>([])
  const [deleteReason, setDeleteReason] = useState<string>("")
  const [deleteRequestModalPatient, setDeleteRequestModalPatient] = useState<Patient | null>(null)

  /* --- helpers --- */
  const getRank = (p: Patient) => (!p.sampleCollectedAt ? 1 : isAllTestsComplete(p) ? 3 : 2)

  /* --- fetch patients --- */
  useEffect(() => {
    const unsub = onValue(ref(database, "patients"), (snap) => {
      if (!snap.exists()) return
      const arr: Patient[] = Object.entries<any>(snap.val()).map(([id, d]) => ({
        id,
        ...d,
        discountAmount: Number(d.discountAmount || 0),
        age: Number(d.age),
      }))

      // Extract delete requests and deleted status
      const deleteRequests: Record<string, { reason: string; requestedBy: string }> = {}
      const deleted: string[] = []

      arr.forEach((p) => {
        if (p.deleteRequest) {
          deleteRequests[p.id] = {
            reason: p.deleteRequest.reason,
            requestedBy: p.deleteRequest.requestedBy,
          }
        }

        if (p.deleted) {
          deleted.push(p.id)
        }
      })

      setDeleteRequestPatients(deleteRequests)
      setDeletedPatients(deleted)

      arr.sort((a, b) => {
        const r = getRank(a) - getRank(b)
        return r !== 0 ? r : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
      setPatients(arr)

      /* metrics */
      const total = arr.length
      const completed = arr.filter((p) => p.sampleCollectedAt && isAllTestsComplete(p)).length
      setMetrics({
        totalTests: total,
        completedTests: completed,
        pendingReports: total - completed,
      })
    })
    return unsub
  }, [])

  const [role, setRole] = useState<string>("staff")
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return
      const roleRef = dbRef(database, `user/${user.uid}/role`)
      onValueDb(roleRef, (snap) => {
        const r = snap.val()
        setRole(r || "staff")
      })
    })
    return () => unsub()
  }, [])

  /* --- filters --- */
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      // Filter out deleted patients for non-admin users
      if (deletedPatients.includes(p.id) && role !== "admin") {
        return false
      }

      const term = searchTerm.trim().toLowerCase()
      const matchesSearch = !term || p.name.toLowerCase().includes(term) || (p.contact ?? "").includes(term)

      // Filter by date range
      const created = p.createdAt.slice(0, 10) // "YYYY‑MM‑DD"
      const inRange = (!startDate || created >= startDate) && (!endDate || created <= endDate)

      // Status logic
      const sampleCollected = !!p.sampleCollectedAt
      const complete = isAllTestsComplete(p)
      let matchesStatus = true
      switch (statusFilter) {
        case "notCollected":
          matchesStatus = !sampleCollected
          break
        case "sampleCollected":
          matchesStatus = sampleCollected && !complete
          break
        case "completed":
          matchesStatus = sampleCollected && complete
          break
      }

      return matchesSearch && inRange && matchesStatus
    })
  }, [patients, searchTerm, startDate, endDate, statusFilter, deletedPatients, role])

  useEffect(() => {
    const total = filteredPatients.length
    const completed = filteredPatients.filter((p) => p.sampleCollectedAt && isAllTestsComplete(p)).length
    const pending = total - completed

    setMetrics({
      totalTests: total,
      completedTests: completed,
      pendingReports: pending,
    })
  }, [filteredPatients])
  /* --- actions --- */

  const handleSaveSampleDate = async () => {
    if (!sampleModalPatient) return
    try {
      await update(ref(database, `patients/${sampleModalPatient.id}`), {
        sampleCollectedAt: new Date(sampleDateTime).toISOString(),
      })
      alert(`Sample time updated for ${sampleModalPatient.name}`)
    } catch (e) {
      console.error(e)
      alert("Error saving sample time.")
    } finally {
      setSampleModalPatient(null)
    }
  }

  const handleCollectSample = async (p: Patient) => {
    try {
      await update(ref(database, `patients/${p.id}`), { sampleCollectedAt: new Date().toISOString() })
      alert(`Sample collected for ${p.name}!`)
    } catch (e) {
      console.error(e)
      alert("Error collecting sample.")
    }
  }

  const handleDeletePatient = async (p: Patient) => {
    if (!confirm(`Delete ${p.name}?`)) return
    try {
      await remove(ref(database, `patients/${p.id}`))
      if (expandedPatientId === p.id) setExpandedPatientId(null)
      alert("Deleted!")
    } catch (e) {
      console.error(e)
      alert("Error deleting.")
    }
  }

  const handleUpdateAmount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPatient) return
    // parse the string, default to 0 if empty or invalid
    const added = Number.parseFloat(newAmountPaid) || 0
    const updatedAmountPaid = selectedPatient.amountPaid + added

    await update(ref(database, `patients/${selectedPatient.id}`), {
      amountPaid: updatedAmountPaid,
      paymentHistory: [
        ...(selectedPatient.paymentHistory || []),
        { amount: added, paymentMode, time: new Date().toISOString() },
      ],
    })
    // reset the field back to empty string
    setNewAmountPaid("")
    setSelectedPatient(null)
    setPaymentMode("online")
    alert("Payment updated!")
  }

  const format12Hour = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })

  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedPatients([])
    } else {
      setSelectedPatients(filteredPatients.map((p) => p.id))
    }
    setSelectAll(!selectAll)
  }

  const handleToggleSelect = (patientId: string) => {
    setSelectedPatients((prev) =>
      prev.includes(patientId) ? prev.filter((id) => id !== patientId) : [...prev, patientId],
    )
  }

  /* --- download bill (real) --- */
  const handleDownloadBill = () => {
    if (!selectedPatient) return

    const img = new Image()
    img.src = (letterhead as any).src ?? (letterhead as any)
    img.onload = () => {
      // Draw letterhead into a canvas to get a data URL
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0)
      const bgDataUrl = canvas.toDataURL("image/jpeg", 0.5) // 50% quality

      // Create PDF
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()

      doc.addImage(bgDataUrl, "JPEG", 0, 0, pageW, pageH)
      doc.setFont("helvetica", "normal").setFontSize(12)

      // Patient details two‐column layout
      const margin = 14
      const colMid = pageW / 2
      const leftKeyX = margin
      const leftColonX = margin + 40
      const leftValueX = margin + 44
      const rightKeyX = colMid + margin
      const rightColonX = colMid + margin + 40
      const rightValueX = colMid + margin + 44

      let y = 70
      const drawRow = (kL: string, vL: string, kR: string, vR: string) => {
        doc.text(kL, leftKeyX, y)
        doc.text(":", leftColonX, y)
        doc.text(vL, leftValueX, y)
        doc.text(kR, rightKeyX, y)
        doc.text(":", rightColonX, y)
        doc.text(vR, rightValueX, y)
        y += 6
      }

      drawRow("Name", selectedPatient.name, "Patient ID", selectedPatient.patientId)
      drawRow(
        "Age / Gender",
        `${selectedPatient.age} y / ${selectedPatient.gender}`,
        "Registration Date",
        new Date(selectedPatient.createdAt).toLocaleDateString(),
      )
      drawRow("Ref. Doctor", selectedPatient.doctorName ?? "N/A", "Contact", selectedPatient.contact ?? "N/A")
      y += 4

      // Tests table
      const rows = selectedPatient.bloodTests?.map((t) => [t.testName, t.price.toFixed(2)]) ?? []
      autoTable(doc, {
        head: [["Test Name", "Amount"]],
        body: rows,
        startY: y,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 11 },
        headStyles: { fillColor: [30, 79, 145], fontStyle: "bold" },
        columnStyles: { 1: { fontStyle: "bold" } },
        margin: { left: margin, right: margin },
      })
      y = (doc as any).lastAutoTable.finalY + 10

      // Summary & amount in words
      const { testTotal, remaining } = calculateAmounts(selectedPatient)
      const remainingWords = toWords(Math.round(remaining))

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
      })
      y = (doc as any).lastAutoTable.finalY + 8

      // Print remaining in words, right-aligned
      doc
        .setFont("helvetica", "normal")
        .setFontSize(10)
        .text(`(${remainingWords.charAt(0).toUpperCase() + remainingWords.slice(1)} only)`, pageW - margin, y, {
          align: "right",
        })
      y += 12

      // Footer
      doc
        .setFont("helvetica", "italic")
        .setFontSize(10)
        .text("Thank you for choosing our services!", pageW / 2, y, { align: "center" })

      // Save PDF
      doc.save(`Bill_${selectedPatient.name}.pdf`)
    }

    img.onerror = () => alert("Failed to load letterhead image.")
  }

  const handleDownloadMultipleBills = () => {
    if (selectedPatients.length === 0) {
      alert("Please select at least one patient")
      return
    }

    const selectedPatientsData = patients.filter((p) => selectedPatients.includes(p.id))

    // Group patients by date
    const patientsByDate = selectedPatientsData.reduce(
      (acc, patient) => {
        const date = patient.createdAt.slice(0, 10)
        if (!acc[date]) acc[date] = []
        acc[date].push(patient)
        return acc
      },
      {} as Record<string, Patient[]>,
    )

    // Sort dates
    const sortedDates = Object.keys(patientsByDate).sort()

    // Calculate totals
    const { totalAmount, totalPaid, totalDiscount, remaining } = calculateTotalsForSelected(selectedPatients, patients)

    const img = new Image()
    img.src = (letterhead as any).src ?? (letterhead as any)
    img.onload = () => {
      // Draw letterhead into a canvas to get a data URL
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0)
      const bgDataUrl = canvas.toDataURL("image/jpeg", 0.5) // 50% quality

      // Create PDF
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()

      // Skip summary pages and go directly to individual patient bills
      sortedDates.forEach((date) => {
        const patientsOnDate = patientsByDate[date]

        // Individual patient bills
        patientsOnDate.forEach((patient) => {
          // For the first patient, use the first page
          if (date === sortedDates[0] && patient === patientsOnDate[0]) {
            doc.addImage(bgDataUrl, "JPEG", 0, 0, pageW, pageH)
          } else {
            // For subsequent patients, add a new page
            doc.addPage()
            doc.addImage(bgDataUrl, "JPEG", 0, 0, pageW, pageH)
          }

          doc.setFont("helvetica", "normal").setFontSize(12)

          // Patient details two‐column layout
          const margin = 14
          const colMid = pageW / 2
          const leftKeyX = margin
          const leftColonX = margin + 40
          const leftValueX = margin + 44
          const rightKeyX = colMid + margin
          const rightColonX = colMid + margin + 40
          const rightValueX = colMid + margin + 44

          let y = 70
          const drawRow = (kL: string, vL: string, kR: string, vR: string) => {
            doc.text(kL, leftKeyX, y)
            doc.text(":", leftColonX, y)
            doc.text(vL, leftValueX, y)
            doc.text(kR, rightKeyX, y)
            doc.text(":", rightColonX, y)
            doc.text(vR, rightValueX, y)
            y += 6
          }

          drawRow("Name", patient.name, "Patient ID", patient.patientId)
          drawRow(
            "Age / Gender",
            `${patient.age} y / ${patient.gender}`,
            "Registration Date",
            new Date(patient.createdAt).toLocaleDateString(),
          )
          drawRow("Ref. Doctor", patient.doctorName ?? "N/A", "Contact", patient.contact ?? "N/A")
          y += 4

          // Tests table
          const rows = patient.bloodTests?.map((t) => [t.testName, t.price.toFixed(2)]) ?? []
          autoTable(doc, {
            head: [["Test Name", "Amount"]],
            body: rows,
            startY: y,
            theme: "grid",
            styles: { font: "helvetica", fontSize: 11 },
            headStyles: { fillColor: [30, 79, 145], fontStyle: "bold" },
            columnStyles: { 1: { fontStyle: "bold" } },
            margin: { left: margin, right: margin },
          })
          y = (doc as any).lastAutoTable.finalY + 10

          // Summary & amount in words
          const { testTotal, remaining } = calculateAmounts(patient)
          const remainingWords = toWords(Math.round(remaining))

          autoTable(doc, {
            head: [["Description", "Amount"]],
            body: [
              ["Test Total", testTotal.toFixed(2)],
              ["Discount", patient.discountAmount.toFixed(2)],
              ["Amount Paid", patient.amountPaid.toFixed(2)],
              ["Remaining", remaining.toFixed(2)],
            ],
            startY: y,
            theme: "plain",
            styles: { font: "helvetica", fontSize: 11 },
            columnStyles: { 1: { fontStyle: "bold" } },
            margin: { left: margin, right: margin },
          })
          y = (doc as any).lastAutoTable.finalY + 8

          // Print remaining in words, right-aligned
          doc
            .setFont("helvetica", "normal")
            .setFontSize(10)
            .text(`(${remainingWords.charAt(0).toUpperCase() + remainingWords.slice(1)} only)`, pageW - margin, y, {
              align: "right",
            })
          y += 12

          // Footer
          doc
            .setFont("helvetica", "italic")
            .setFontSize(10)
            .text("Thank you for choosing our services!", pageW / 2, y, { align: "center" })
        })
      })

      // Save PDF
      doc.save(`Multiple_Bills_${new Date().toLocaleDateString().replace(/\//g, "-")}.pdf`)
    }

    img.onerror = () => alert("Failed to load letterhead image.")
  }

  const handleDeleteRequest = (patient: Patient) => {
    setDeleteRequestModalPatient(patient)
    setDeleteReason("")
  }

  const submitDeleteRequest = async () => {
    if (!deleteRequestModalPatient || !deleteReason.trim()) return

    try {
      // Get the current user's email
      const userEmail = auth.currentUser?.email || "unknown"

      // Update the deleteRequestPatients state
      setDeleteRequestPatients((prev) => ({
        ...prev,
        [deleteRequestModalPatient.id]: {
          reason: deleteReason,
          requestedBy: userEmail,
        },
      }))

      // Save to database
      await update(ref(database, `patients/${deleteRequestModalPatient.id}`), {
        deleteRequest: {
          reason: deleteReason,
          requestedBy: userEmail,
          requestedAt: new Date().toISOString(),
        },
      })

      alert("Delete request submitted")
    } catch (e) {
      console.error(e)
      alert("Error submitting delete request")
    } finally {
      setDeleteRequestModalPatient(null)
    }
  }

  const handleApproveDelete = async (patient: Patient) => {
    if (!confirm(`Permanently delete ${patient.name}?`)) return

    try {
      // Mark as deleted in the database
      await update(ref(database, `patients/${patient.id}`), {
        deleted: true,
        deletedAt: new Date().toISOString(),
        deleteRequest: null, // Clear the request
      })

      // Update local state
      setDeletedPatients((prev) => [...prev, patient.id])
      setDeleteRequestPatients((prev) => {
        const newState = { ...prev }
        delete newState[patient.id]
        return newState
      })

      if (expandedPatientId === patient.id) setExpandedPatientId(null)
      alert("Patient marked as deleted")
    } catch (e) {
      console.error(e)
      alert("Error deleting patient")
    }
  }

  const handleUndoDeleteRequest = async (patient: Patient) => {
    try {
      // Remove delete request from database
      await update(ref(database, `patients/${patient.id}`), {
        deleteRequest: null,
      })

      // Update local state
      setDeleteRequestPatients((prev) => {
        const newState = { ...prev }
        delete newState[patient.id]
        return newState
      })

      alert("Delete request removed")
    } catch (e) {
      console.error(e)
      alert("Error removing delete request")
    }
  }

  /* --------------------  RENDER  -------------------- */
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm flex items-center justify-between p-4 md:px-8">
        <p className="text-3xl font-medium text-blue-600">InfiCare</p>
      </header>

      <main className="p-4 md:p-6">
        {/* Download Bills button */}
        <div className="mb-4 flex justify-between items-center">
          <h1 className="text-2xl font-semibold">Patient Dashboard</h1>
          <button
            onClick={() => {
              // Show checkboxes when button is clicked
              setShowCheckboxes((prev) => !prev)
            }}
            className="px-6 py-2 bg-teal-600 text-white rounded-md text-sm hover:bg-teal-700 flex items-center"
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            {showCheckboxes ? "Cancel Selection" : "Download Bills"}
          </button>
        </div>
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
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="p-2 border rounded-md"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
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

        {selectedPatients.length > 0 && (
          <div className="mb-4 p-4 bg-white rounded-xl shadow-sm border">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h3 className="font-medium">Selected: {selectedPatients.length} patients</h3>
                {(() => {
                  const { totalAmount, totalPaid, totalDiscount, remaining } = calculateTotalsForSelected(
                    selectedPatients,
                    patients,
                  )
                  return (
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Total Amount</p>
                        <p className="font-semibold">₹{totalAmount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Total Paid</p>
                        <p className="font-semibold">₹{totalPaid.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Total Discount</p>
                        <p className="font-semibold">₹{totalDiscount.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Remaining</p>
                        <p className="font-semibold">₹{remaining.toFixed(2)}</p>
                      </div>
                    </div>
                  )
                })()}
              </div>
              <button
                onClick={handleDownloadMultipleBills}
                className="inline-flex items-center px-6 py-3 bg-teal-600 text-white rounded-md text-sm hover:bg-teal-700"
              >
                <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                Download Selected Bills
              </button>
            </div>
          </div>
        )}

        {/* metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
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
            <div key={i} className="bg-white p-3 rounded-lg shadow-sm border">
              <div className="flex items-center space-x-3">
                <div className={`p-2 bg-${m.bg}-50 rounded-lg`}>
                  {React.createElement(m.icon, { className: `h-5 w-5 text-${m.bg}-600` })}
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">{m.label}</p>
                  <p className="text-xl font-semibold">{m.val}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-3 border-b">
            <h2 className="text-base font-semibold flex items-center">
              <UserIcon className="h-4 w-4 mr-2 text-gray-600" />
              Recent Patients
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs">
                <tr>
                  {showCheckboxes && (
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleToggleSelectAll}
                        className="h-3 w-3 text-indigo-600 border-gray-300 rounded"
                      />
                    </th>
                  )}
                  {[".", "Patient", "Tests", "Entry Date", "Status", "Remaining", "Total Amount", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredPatients.map((p) => {
                  const sampleCollected = !!p.sampleCollectedAt
                  const complete = isAllTestsComplete(p)
                  const status = !sampleCollected ? "Not Collected" : complete ? "Completed" : "Pending"
                  const { remaining } = calculateAmounts(p)

                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`hover:bg-gray-50 ${deleteRequestPatients[p.id] ? "bg-red-100" : ""} ${deletedPatients.includes(p.id) ? "bg-red-200" : ""}`}
                      >
                        {deleteRequestPatients[p.id] && role === "admin" && (
                          <div className="absolute right-0 top-0 bg-red-100 text-xs p-1 rounded-bl-md max-w-xs overflow-hidden">
                            <span className="font-bold">Delete reason:</span> {deleteRequestPatients[p.id].reason}
                          </div>
                        )}
                        <td
                          className={`px-3 py-2 relative ${deleteRequestPatients[p.id] ? "bg-red-100 wzmoc:2px; border:1px solid black; padding:5px; margin:5px; border-radius:5px;" : ""} ${deletedPatients.includes(p.id) ? "bg-red-200" : ""}`}
                        >
                          {showCheckboxes && (
                            <input
                              type="checkbox"
                              checked={selectedPatients.includes(p.id)}
                              onChange={() => handleToggleSelect(p.id)}
                              className="h-3 w-3 text-indigo-600 border-gray-300 rounded"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-sm">{p.name}</p>
                          <p className="text-xs text-gray-500">
                            {p.age}y • {p.gender}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {p.bloodTests?.length ? (
                            <ul className="list-disc pl-3">
                              {p.bloodTests.map((t) => {
                                const done = t.testType?.toLowerCase() === "outsource" || isTestFullyEntered(p, t)
                                return (
                                  <li key={t.testId} className={done ? "text-green-600" : "text-red-500"}>
                                    {t.testName}
                                  </li>
                                )
                              })}
                            </ul>
                          ) : (
                            <span className="text-gray-400">No tests</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{new Date(p.createdAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2">
                          {status === "Not Collected" && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800">
                              Not Collected
                            </span>
                          )}
                          {status === "Pending" && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">Pending</span>
                          )}
                          {status === "Completed" && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">
                              Completed
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {remaining > 0 ? (
                            <span className="text-red-600 font-bold">₹{remaining.toFixed(2)}</span>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className="text-blue-600 font-bold">₹{calculateAmounts(p).testTotal.toFixed(2)}</span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setExpandedPatientId(expandedPatientId === p.id ? null : p.id)}
                            className="px-3 py-1 bg-indigo-600 text-white rounded-md text-xs hover:bg-indigo-700"
                          >
                            Actions
                          </button>
                        </td>
                      </tr>

                      {expandedPatientId === p.id && (
                        <tr>
                          <td colSpan={showCheckboxes ? 9 : 8} className="bg-gray-50 p-2">
                            <div className="flex flex-wrap gap-1 text-xs">
                              {deleteRequestPatients[p.id] && (
                                <div className="w-full mb-2 p-2 bg-red-100 rounded text-sm">
                                  <p className="font-bold">
                                    Delete request by: {deleteRequestPatients[p.id].requestedBy}
                                  </p>
                                  <p>Reason: {deleteRequestPatients[p.id].reason}</p>
                                </div>
                              )}

                              {sampleModalPatient && (
                                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
                                  <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 relative">
                                    <button
                                      onClick={() => setSampleModalPatient(null)}
                                      className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
                                    >
                                      ✕
                                    </button>
                                    <h3 className="text-lg font-semibold mb-4">
                                      Set Sample Collected Time for {sampleModalPatient.name}
                                    </h3>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                      Date & Time
                                    </label>
                                    <input
                                      type="datetime-local"
                                      value={sampleDateTime}
                                      onChange={(e) => setSampleDateTime(e.target.value)}
                                      max={formatLocalDateTime()} // Prevent future times
                                      className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <p className="mt-2 text-sm text-gray-600">
                                      Selected: {format12Hour(sampleDateTime)}
                                    </p>

                                    <div className="mt-6 flex justify-end space-x-2">
                                      <button
                                        onClick={() => setSampleModalPatient(null)}
                                        className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={handleSaveSampleDate}
                                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Show only Download Report button for phlebotomist role */}
                              {role === "phlebotomist" ? (
                                <>
                                  {sampleCollected && (
                                    <Link
                                      href={`/download-report?patientId=${p.id}`}
                                      className={`inline-flex items-center px-3 py-1 bg-green-600 text-white rounded-md text-xs ${
                                        deleteRequestPatients[p.id]
                                          ? "opacity-50 pointer-events-none"
                                          : "hover:bg-green-700"
                                      }`}
                                      onClick={(e) => deleteRequestPatients[p.id] && e.preventDefault()}
                                    >
                                      <ArrowDownTrayIcon className="h-3 w-3 mr-1" />
                                      Download Report
                                    </Link>
                                  )}
                                </>
                              ) : (
                                <>
                                  {/* Original buttons for other roles */}
                                  {!sampleCollected && (
                                    <button
                                      onClick={() => {
                                        setSampleModalPatient(p)
                                        setSampleDateTime(formatLocalDateTime()) // Set current local time
                                      }}
                                      className="px-3 py-1 bg-red-600 text-white rounded-md text-xs hover:bg-red-700"
                                      disabled={!!deleteRequestPatients[p.id]}
                                    >
                                      Collect Sample
                                    </button>
                                  )}

                                  {sampleCollected && (
                                    <Link
                                      href={`/download-report?patientId=${p.id}`}
                                      className={`inline-flex items-center px-3 py-1 bg-green-600 text-white rounded-md text-xs ${
                                        deleteRequestPatients[p.id]
                                          ? "opacity-50 pointer-events-none"
                                          : "hover:bg-green-700"
                                      }`}
                                      onClick={(e) => deleteRequestPatients[p.id] && e.preventDefault()}
                                    >
                                      <ArrowDownTrayIcon className="h-3 w-3 mr-1" />
                                      Download Report
                                    </Link>
                                  )}

                                  {sampleCollected && !complete && (
                                    <Link
                                      href={`/blood-values/new?patientId=${p.id}`}
                                      className={`inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded-md text-xs ${
                                        deleteRequestPatients[p.id]
                                          ? "opacity-50 pointer-events-none"
                                          : "hover:bg-blue-700"
                                      }`}
                                      onClick={(e) => deleteRequestPatients[p.id] && e.preventDefault()}
                                    >
                                      <DocumentPlusIcon className="h-3 w-3 mr-1" />
                                      Add/Edit Values
                                    </Link>
                                  )}

                                  {sampleCollected && complete && (
                                    <Link
                                      href={`/blood-values/new?patientId=${p.id}`}
                                      className={`inline-flex items-center px-3 py-1 bg-blue-500 text-white rounded-md text-xs ${
                                        deleteRequestPatients[p.id]
                                          ? "opacity-50 pointer-events-none"
                                          : "hover:bg-blue-600"
                                      }`}
                                      onClick={(e) => deleteRequestPatients[p.id] && e.preventDefault()}
                                    >
                                      Edit Test
                                    </Link>
                                  )}

                                  <button
                                    onClick={() => {
                                      setSelectedPatient(p)
                                      setNewAmountPaid("")
                                    }}
                                    className="px-3 py-1 bg-indigo-600 text-white rounded-md text-xs hover:bg-indigo-700"
                                    disabled={!!deleteRequestPatients[p.id]}
                                  >
                                    Update Payment
                                  </button>

                                  {selectedPatient?.id === p.id && (
                                    <button
                                      onClick={handleDownloadBill}
                                      className="inline-flex items-center px-3 py-1 bg-teal-600 text-white rounded-md text-xs hover:bg-teal-700"
                                      disabled={!!deleteRequestPatients[p.id]}
                                    >
                                      <ArrowDownTrayIcon className="h-3 w-3 mr-1" />
                                      Download Bill
                                    </button>
                                  )}

                                  {/* ---- Generate Fake Bill button ---- */}
                                  <button
                                    onClick={() => setFakeBillPatient(p)}
                                    className="px-3 py-1 bg-purple-600 text-white rounded-md text-xs hover:bg-purple-700"
                                    disabled={!!deleteRequestPatients[p.id]}
                                  >
                                    Generate Bill
                                  </button>

                                  <Link
                                    href={`/patient-detail?patientId=${p.id}`}
                                    className={`px-3 py-1 bg-orange-600 text-white rounded-md text-xs ${
                                      deleteRequestPatients[p.id]
                                        ? "opacity-50 pointer-events-none"
                                        : "hover:bg-orange-700"
                                    }`}
                                    onClick={(e) => deleteRequestPatients[p.id] && e.preventDefault()}
                                  >
                                    Edit Details
                                  </Link>

                                  {role === "admin" ? (
                                    <>
                                      {deleteRequestPatients[p.id] ? (
                                        <>
                                          <button
                                            onClick={() => handleApproveDelete(p)}
                                            className="px-3 py-1 bg-red-600 text-white rounded-md text-xs hover:bg-red-700"
                                          >
                                            Approve Delete
                                          </button>
                                          <button
                                            onClick={() => handleUndoDeleteRequest(p)}
                                            className="px-3 py-1 bg-gray-600 text-white rounded-md text-xs hover:bg-gray-700"
                                          >
                                            Undo Request
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => handleDeletePatient(p)}
                                          className="px-3 py-1 bg-gray-600 text-white rounded-md text-xs hover:bg-gray-700"
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {!deleteRequestPatients[p.id] && (
                                        <button
                                          onClick={() => handleDeleteRequest(p)}
                                          className="px-3 py-1 bg-yellow-600 text-white rounded-md text-xs hover:bg-yellow-700"
                                        >
                                          Request Delete
                                        </button>
                                      )}
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
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
            <h3 className="text-xl font-semibold mb-4">Update Payment for {selectedPatient.name}</h3>

            {(() => {
              const { testTotal, remaining } = calculateAmounts(selectedPatient)
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
              )
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
                <label className="block text-sm font-medium text-gray-700">Additional Payment (Rs)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newAmountPaid}
                  onChange={(e) => setNewAmountPaid(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter amount"
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

      {/* Delete Request Modal */}
      {deleteRequestModalPatient && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => setDeleteRequestModalPatient(null)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
            <h3 className="text-xl font-semibold mb-4">Request Deletion for {deleteRequestModalPatient.name}</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Reason for Deletion (Required)</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500"
                rows={4}
                placeholder="Please provide a detailed reason for this deletion request"
                required
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setDeleteRequestModalPatient(null)}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={submitDeleteRequest}
                disabled={!deleteReason.trim()}
                className={`px-4 py-2 rounded-md text-white ${
                  deleteReason.trim() ? "bg-red-600 hover:bg-red-700" : "bg-red-300 cursor-not-allowed"
                }`}
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fake Bill modal */}
      {fakeBillPatient && <FakeBill patient={fakeBillPatient} onClose={() => setFakeBillPatient(null)} />}
    </div>
  )
}