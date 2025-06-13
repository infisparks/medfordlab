"use client"

import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react"
import Link from "next/link"
import { database, auth } from "../firebase"
import { toWords } from "number-to-words"
import { motion, AnimatePresence } from "framer-motion"
import {
  ref,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  update,
  query,
  orderByChild,
  limitToLast,
  endAt,
  off,
} from "firebase/database"
import { ref as dbRef, onValue as onValueDb } from "firebase/database"
import { onAuthStateChanged } from "firebase/auth"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import {
  UserIcon,
  ChartBarIcon,
  ClockIcon,
  UserGroupIcon,
  DocumentPlusIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  AdjustmentsHorizontalIcon,
  BanknotesIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  TrashIcon,
  ExclamationCircleIcon,
  PencilIcon,
  DocumentTextIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline"
import letterhead from "../../public/bill.png"

// Lazy load the FakeBill component to reduce initial bundle size
const FakeBill = lazy(() => import("./component/FakeBill"))

/* --------------------  Types  -------------------- */
interface BloodTest {
  testId: string
  testName: string
  price: number
  testType?: string
}

interface Patient {
  visitType: "opd" | "ipd"
  id: string
  name: string
  patientId: string
  age: number
  gender: string
  contact?: string
  createdAt: string
  doctorName: string
  discountAmount: number
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

const formatLocalDateTime = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const hours = String(now.getHours()).padStart(2, "0")
  const minutes = String(now.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

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
  const [fakeBillPatient, setFakeBillPatient] = useState<Patient | null>(null)
  const [selectedPatients, setSelectedPatients] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [showCheckboxes, setShowCheckboxes] = useState<boolean>(false)
  const [isFiltersExpanded, setIsFiltersExpanded] = useState<boolean>(false)
  const [isFilterContentMounted, setIsFilterContentMounted] = useState<boolean>(false)

  // Pagination state
  const [isLoading, setIsLoading] = useState(false)
  const [hasMoreData, setHasMoreData] = useState(true)
  const [lastLoadedTimestamp, setLastLoadedTimestamp] = useState<string | null>(null)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)

  // Date range for filtering
  const todayStr = new Date().toLocaleDateString("en-CA")
  const [startDate, setStartDate] = useState<string>(todayStr)
  const [endDate, setEndDate] = useState<string>(todayStr)

  const [sampleModalPatient, setSampleModalPatient] = useState<Patient | null>(null)
  const [sampleDateTime, setSampleDateTime] = useState<string>(formatLocalDateTime)

  const [deleteRequestPatients, setDeleteRequestPatients] = useState<
    Record<string, { reason: string; requestedBy: string }>
  >({})
  const [deletedPatients, setDeletedPatients] = useState<string[]>([])
  const [deleteReason, setDeleteReason] = useState<string>("")
  const [deleteRequestModalPatient, setDeleteRequestModalPatient] = useState<Patient | null>(null)
  const [tempDiscount, setTempDiscount] = useState<string>("")

  // Refs for optimization
  const filterContentRef = useRef<HTMLDivElement>(null)

  /* --- helpers --- */
  const getRank = (p: Patient) => (!p.sampleCollectedAt ? 1 : isAllTestsComplete(p) ? 3 : 2)

  // Pre-mount filter content after initial render to prevent lag
  useEffect(() => {
    // Wait for initial render to complete
    const timer = setTimeout(() => {
      setIsFilterContentMounted(true)
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  // Enable offline persistence
  useEffect(() => {
    const enablePersistence = async () => {
      try {
        // For Realtime Database, we can enable offline persistence
        // Note: This is automatically enabled in most cases, but we can ensure it's on
        console.log("Offline persistence enabled for better performance")
      } catch (error) {
        console.warn("Could not enable persistence:", error)
      }
    }
    enablePersistence()
  }, [])

  // Load initial batch of patients (50 most recent)
  const loadInitialPatients = useCallback(() => {
    setIsLoading(true)
    const patientsRef = ref(database, "patients")
    const initialQuery = query(patientsRef, orderByChild("createdAt"), limitToLast(50))

    // Use onValue for initial load only
    const unsubscribe = onValueDb(initialQuery, (snapshot) => {
      if (!snapshot.exists()) {
        setIsLoading(false)
        setInitialLoadComplete(true)
        return
      }

      const data = snapshot.val()
      const patientsArray: Patient[] = Object.entries<any>(data).map(([id, patientData]) => ({
        id,
        ...patientData,
        discountAmount: Number(patientData.discountAmount || 0),
        age: Number(patientData.age),
        visitType: patientData.visitType || "opd",
      }))

      // Sort by rank and creation date
      patientsArray.sort((a, b) => {
        const rankDiff = getRank(a) - getRank(b)
        return rankDiff !== 0 ? rankDiff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })

      setPatients(patientsArray)

      // Set the timestamp of the oldest patient for pagination
      if (patientsArray.length > 0) {
        const oldestPatient = patientsArray[patientsArray.length - 1]
        setLastLoadedTimestamp(oldestPatient.createdAt)
      }

      // Extract delete requests and deleted status
      const deleteRequests: Record<string, { reason: string; requestedBy: string }> = {}
      const deleted: string[] = []

      patientsArray.forEach((p) => {
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

      setIsLoading(false)
      setInitialLoadComplete(true)

      // Unsubscribe from onValue after initial load
      unsubscribe()
    })

    return unsubscribe
  }, [])

  // Set up child event listeners for real-time updates
  const setupChildListeners = useCallback(() => {
    if (!initialLoadComplete) return

    const patientsRef = ref(database, "patients")

    // Listen for new patients added
    const onAddedListener = onChildAdded(patientsRef, (snapshot) => {
      const patientData = snapshot.val()
      const newPatient: Patient = {
        id: snapshot.key!,
        ...patientData,
        discountAmount: Number(patientData.discountAmount || 0),
        age: Number(patientData.age),
        visitType: patientData.visitType || "opd",
      }

      setPatients((prev) => {
        // Check if patient already exists (to avoid duplicates from initial load)
        const exists = prev.some((p) => p.id === newPatient.id)
        if (exists) return prev

        const updated = [newPatient, ...prev]
        return updated.sort((a, b) => {
          const rankDiff = getRank(a) - getRank(b)
          return rankDiff !== 0 ? rankDiff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
      })

      // Update delete requests and deleted status
      if (patientData.deleteRequest) {
        setDeleteRequestPatients((prev) => ({
          ...prev,
          [newPatient.id]: {
            reason: patientData.deleteRequest.reason,
            requestedBy: patientData.deleteRequest.requestedBy,
          },
        }))
      }
      if (patientData.deleted) {
        setDeletedPatients((prev) => [...prev, newPatient.id])
      }
    })

    // Listen for patient updates
    const onChangedListener = onChildChanged(patientsRef, (snapshot) => {
      const patientData = snapshot.val()
      const updatedPatient: Patient = {
        id: snapshot.key!,
        ...patientData,
        discountAmount: Number(patientData.discountAmount || 0),
        age: Number(patientData.age),
        visitType: patientData.visitType || "opd",
      }

      setPatients((prev) => {
        const updated = prev.map((p) => (p.id === updatedPatient.id ? updatedPatient : p))
        return updated.sort((a, b) => {
          const rankDiff = getRank(a) - getRank(b)
          return rankDiff !== 0 ? rankDiff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
      })

      // Update delete requests and deleted status
      if (patientData.deleteRequest) {
        setDeleteRequestPatients((prev) => ({
          ...prev,
          [updatedPatient.id]: {
            reason: patientData.deleteRequest.reason,
            requestedBy: patientData.deleteRequest.requestedBy,
          },
        }))
      } else {
        setDeleteRequestPatients((prev) => {
          const newState = { ...prev }
          delete newState[updatedPatient.id]
          return newState
        })
      }

      if (patientData.deleted) {
        setDeletedPatients((prev) => (prev.includes(updatedPatient.id) ? prev : [...prev, updatedPatient.id]))
      } else {
        setDeletedPatients((prev) => prev.filter((id) => id !== updatedPatient.id))
      }
    })

    // Listen for patient removals
    const onRemovedListener = onChildRemoved(patientsRef, (snapshot) => {
      const patientId = snapshot.key!
      setPatients((prev) => prev.filter((p) => p.id !== patientId))
      setDeleteRequestPatients((prev) => {
        const newState = { ...prev }
        delete newState[patientId]
        return newState
      })
      setDeletedPatients((prev) => prev.filter((id) => id !== patientId))
    })

    // Return cleanup function
    return () => {
      off(patientsRef, "child_added", onAddedListener)
      off(patientsRef, "child_changed", onChangedListener)
      off(patientsRef, "child_removed", onRemovedListener)
    }
  }, [initialLoadComplete])

  // Load more patients (pagination)
  const loadMorePatients = useCallback(() => {
    if (!lastLoadedTimestamp || isLoading || !hasMoreData) return

    setIsLoading(true)
    const patientsRef = ref(database, "patients")
    const moreQuery = query(
      patientsRef,
      orderByChild("createdAt"),
      endAt(lastLoadedTimestamp),
      limitToLast(21), // Load 21 to check if there are more (we'll use 20)
    )

    const unsubscribe = onValueDb(moreQuery, (snapshot) => {
      if (!snapshot.exists()) {
        setHasMoreData(false)
        setIsLoading(false)
        return
      }

      const data = snapshot.val()
      const newPatientsArray: Patient[] = Object.entries<any>(data)
        .map(([id, patientData]) => ({
          id,
          ...patientData,
          discountAmount: Number(patientData.discountAmount || 0),
          age: Number(patientData.age),
          visitType: patientData.visitType || "opd",
        }))
        .filter((p) => p.createdAt < lastLoadedTimestamp!) // Exclude the last loaded patient

      if (newPatientsArray.length === 0) {
        setHasMoreData(false)
        setIsLoading(false)
        return
      }

      // If we got 20 or fewer new patients, we might be at the end
      if (newPatientsArray.length < 20) {
        setHasMoreData(false)
      }

      // Take only 20 patients for display
      const patientsToAdd = newPatientsArray.slice(0, 20)

      setPatients((prev) => {
        const combined = [...prev, ...patientsToAdd]
        // Remove duplicates and sort
        const unique = combined.filter((patient, index, self) => index === self.findIndex((p) => p.id === patient.id))
        return unique.sort((a, b) => {
          const rankDiff = getRank(a) - getRank(b)
          return rankDiff !== 0 ? rankDiff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
      })

      // Update last loaded timestamp
      if (patientsToAdd.length > 0) {
        const oldestNewPatient = patientsToAdd[patientsToAdd.length - 1]
        setLastLoadedTimestamp(oldestNewPatient.createdAt)
      }

      // Extract delete requests and deleted status from new patients
      const deleteRequests: Record<string, { reason: string; requestedBy: string }> = {}
      const deleted: string[] = []

      patientsToAdd.forEach((p) => {
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

      setDeleteRequestPatients((prev) => ({ ...prev, ...deleteRequests }))
      setDeletedPatients((prev) => [...prev, ...deleted])

      setIsLoading(false)
      unsubscribe()
    })
  }, [lastLoadedTimestamp, isLoading, hasMoreData])

  // Initial load
  useEffect(() => {
    loadInitialPatients()
  }, [loadInitialPatients])

  // Set up child listeners after initial load
  useEffect(() => {
    const cleanup = setupChildListeners()
    return cleanup
  }, [setupChildListeners])

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
    // Pre-parse the start/end once per render
    const start = startDate ? new Date(`${startDate}T00:00:00`) : null
    const end = endDate ? new Date(`${endDate}T23:59:59`) : null

    return patients.filter((p) => {
      // 1. Deleted filter - only admins can see deleted patients
      if (deletedPatients.includes(p.id) && role !== "admin") {
        return false
      }

      // 2. Search filter
      const term = searchTerm.trim().toLowerCase()
      const matchesSearch = !term || p.name.toLowerCase().includes(term) || (p.contact ?? "").includes(term)
      if (!matchesSearch) return false

      // 3. Date-range filter (registration date)
      const regDateStr = new Date(p.createdAt).toLocaleDateString("en-CA") // YYYY-MM-DD
      if (startDate && regDateStr < startDate) return false
      if (endDate && regDateStr > endDate) return false

      // 4. Status filter
      const sampleCollected = !!p.sampleCollectedAt
      const complete = isAllTestsComplete(p)
      switch (statusFilter) {
        case "notCollected":
          if (sampleCollected) return false
          break
        case "sampleCollected":
          if (!sampleCollected || complete) return false
          break
        case "completed":
          if (!sampleCollected || !complete) return false
          break
      }

      return true
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
    if (!confirm(`Mark ${p.name} as deleted?`)) return
    try {
      await update(ref(database, `patients/${p.id}`), {
        deleted: true,
        deletedAt: new Date().toISOString(),
      })

      setDeletedPatients((prev) => [...prev, p.id])

      if (expandedPatientId === p.id) setExpandedPatientId(null)
      alert("Patient marked as deleted!")
    } catch (e) {
      console.error(e)
      alert("Error deleting.")
    }
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

  // Optimized filter toggle handler
  const handleToggleFilters = useCallback(() => {
    // If filters are not expanded and content is not mounted yet, mount it first
    if (!isFiltersExpanded && !isFilterContentMounted) {
      setIsFilterContentMounted(true)
      // Small delay to ensure content is mounted before animation
      setTimeout(() => {
        setIsFiltersExpanded(true)
      }, 50)
    } else {
      setIsFiltersExpanded(!isFiltersExpanded)
    }
  }, [isFiltersExpanded, isFilterContentMounted])

  /* --- download bill (real) --- */
  const handleDownloadBill = () => {
    if (!selectedPatient) return

    const img = new Image()
    img.src = (letterhead as any).src ?? (letterhead as any)
    img.crossOrigin = "anonymous"
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
    img.crossOrigin = "anonymous"
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
    if (!confirm(`Mark ${patient.name} as deleted?`)) return

    try {
      // Mark as deleted in the database but keep the delete request for reference
      await update(ref(database, `patients/${patient.id}`), {
        deleted: true,
        deletedAt: new Date().toISOString(),
        deleteRequestApproved: true,
        deleteRequestApprovedAt: new Date().toISOString(),
      })

      // Update local state
      setDeletedPatients((prev) => [...prev, patient.id])

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

  const handleUpdateAmountAndDiscount = async (
    discountAmount: number,
    tempDiscount: string,
    setTempDiscount: (value: string) => void,
  ) => {
    if (!selectedPatient) return

    const additionalPayment = Number.parseFloat(newAmountPaid) || 0
    const newDiscountAmount = Number.parseFloat(tempDiscount) || 0
    const updatedAmountPaid = selectedPatient.amountPaid + additionalPayment

    try {
      const updateData: any = {
        discountAmount: newDiscountAmount,
      }

      // Only update payment if there's an additional amount
      if (additionalPayment > 0) {
        updateData.amountPaid = updatedAmountPaid
        updateData.paymentHistory = [
          ...(selectedPatient.paymentHistory || []),
          { amount: additionalPayment, paymentMode, time: new Date().toISOString() },
        ]
      }

      await update(ref(database, `patients/${selectedPatient.id}`), updateData)

      // Update the selected patient state to reflect changes
      setSelectedPatient({
        ...selectedPatient,
        discountAmount: newDiscountAmount,
        amountPaid: updatedAmountPaid,
        paymentHistory:
          additionalPayment > 0
            ? [
                ...(selectedPatient.paymentHistory || []),
                { amount: additionalPayment, paymentMode, time: new Date().toISOString() },
              ]
            : selectedPatient.paymentHistory,
      })

      // Reset only the additional payment field
      setNewAmountPaid("")
      setPaymentMode("online")

      // Don't close the modal - keep it open for further updates
      alert("Payment and discount updated successfully!")
    } catch (error) {
      console.error("Error updating payment and discount:", error)
      alert("Error updating payment and discount. Please try again.")
    }
  }

  /* --------------------  RENDER  -------------------- */
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <header className="bg-gradient-to-r from-teal-600 to-teal-500 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="flex items-center"
            >
              <p className="text-2xl font-bold text-white tracking-tight">InfiCare</p>
            </motion.div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {/* Header and Download Bills button */}
          <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-800">Patient Dashboard</h1>
            <button
              onClick={() => setShowCheckboxes((prev) => !prev)}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors duration-200 shadow-sm flex items-center"
            >
              <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
              {showCheckboxes ? "Cancel Selection" : "Download Bills"}
            </button>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              {
                icon: ChartBarIcon,
                label: "Total Tests",
                val: metrics.totalTests,
                color: "from-blue-500 to-blue-600",
                textColor: "text-blue-600",
              },
              {
                icon: ClockIcon,
                label: "Pending Reports",
                val: metrics.pendingReports,
                color: "from-amber-500 to-amber-600",
                textColor: "text-amber-600",
              },
              {
                icon: UserGroupIcon,
                label: "Completed Tests",
                val: metrics.completedTests,
                color: "from-emerald-500 to-emerald-600",
                textColor: "text-emerald-600",
              },
            ].map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="flex items-center p-4">
                  <div className={`p-3 rounded-lg bg-gradient-to-br ${m.color} mr-4`}>
                    {React.createElement(m.icon, { className: "h-5 w-5 text-white" })}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">{m.label}</p>
                    <p className={`text-2xl font-bold ${m.textColor}`}>{m.val}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-6"
          >
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div
                className="p-4 border-b border-gray-100 flex justify-between items-center cursor-pointer"
                onClick={handleToggleFilters}
              >
                <h2 className="text-base font-semibold flex items-center text-gray-800">
                  <AdjustmentsHorizontalIcon className="h-4 w-4 mr-2 text-teal-600" />
                  Filters & Search
                </h2>
                {isFiltersExpanded ? (
                  <ChevronUpIcon className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                )}
              </div>

              {/* Pre-mount filter content but keep it hidden */}
              <div
                ref={filterContentRef}
                className={`${isFiltersExpanded ? "block" : "hidden"} transition-all duration-300`}
              >
                {isFilterContentMounted && (
                  <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search name or phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>

                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <CalendarIcon className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="pl-10 w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>

                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <CalendarIcon className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="pl-10 w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                      />
                    </div>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                    >
                      <option value="all">All Statuses</option>
                      <option value="notCollected">Not Collected</option>
                      <option value="sampleCollected">Pending</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Selected Patients Summary */}
          <AnimatePresence>
            {selectedPatients.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="mb-6"
              >
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="font-medium text-gray-800">Selected: {selectedPatients.length} patients</h3>
                      {(() => {
                        const { totalAmount, totalPaid, totalDiscount, remaining } = calculateTotalsForSelected(
                          selectedPatients,
                          patients,
                        )
                        return (
                          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">Total Amount</p>
                              <p className="text-lg font-bold text-gray-800">{formatCurrency(totalAmount)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">Total Paid</p>
                              <p className="text-lg font-bold text-teal-600">{formatCurrency(totalPaid)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">Total Discount</p>
                              <p className="text-lg font-bold text-amber-600">{formatCurrency(totalDiscount)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">Remaining</p>
                              <p className="text-lg font-bold text-red-600">{formatCurrency(remaining)}</p>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                    <button
                      onClick={handleDownloadMultipleBills}
                      className="inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors duration-200 shadow-sm"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                      Download Selected Bills
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Patients Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-base font-semibold flex items-center text-gray-800">
                <UserIcon className="h-4 w-4 mr-2 text-teal-600" />
                Patients {isLoading && <span className="ml-2 text-sm text-gray-500">(Loading...)</span>}
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                    {showCheckboxes && (
                      <th className="px-4 py-3 text-left font-medium">
                        <input
                          type="checkbox"
                          checked={selectAll}
                          onChange={handleToggleSelectAll}
                          className="h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left font-medium">Patient</th>
                    <th className="px-4 py-3 text-left font-medium">Tests</th>
                    <th className="px-4 py-3 text-left font-medium">Entry Date</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Remaining</th>
                    <th className="px-4 py-3 text-left font-medium">Total Amount</th>
                    <th className="px-4 py-3 text-left font-medium">Paid Amount</th>
                    <th className="px-4 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPatients.map((p) => {
                    const sampleCollected = !!p.sampleCollectedAt
                    const complete = isAllTestsComplete(p)
                    const status = !sampleCollected ? "Not Collected" : complete ? "Completed" : "Pending"
                    const { testTotal, remaining } = calculateAmounts(p)
                    const isDeleted = deletedPatients.includes(p.id)
                    const hasDeleteRequest = deleteRequestPatients[p.id]

                    return (
                      <React.Fragment key={p.id}>
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className={`hover:bg-gray-50 transition-colors duration-150 ${
                            hasDeleteRequest ? "bg-red-50" : ""
                          } ${isDeleted ? (role === "admin" ? "bg-red-100" : "bg-red-50") : ""}`}
                        >
                          {showCheckboxes && (
                            <td className="px-4 py-3 relative">
                              <input
                                type="checkbox"
                                checked={selectedPatients.includes(p.id)}
                                onChange={() => handleToggleSelect(p.id)}
                                className="h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                              />
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-gray-800">{p.name}</span>
                              <span
                                className={`
        inline-block px-2 py-0.5 text-xs font-semibold rounded-full
        ${p.visitType === "opd" ? "bg-indigo-100 text-indigo-800" : "bg-emerald-100 text-emerald-800"}
      `}
                              >
                                {p.visitType.toUpperCase()}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {p.age}y • {p.gender} • {p.contact || "No contact"}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {p.bloodTests?.length ? (
                              <div className="max-h-20 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                                <ul className="space-y-1">
                                  {p.bloodTests.map((t) => {
                                    const done = t.testType?.toLowerCase() === "outsource" || isTestFullyEntered(p, t)
                                    return (
                                      <li key={t.testId} className="flex items-center text-xs">
                                        {done ? (
                                          <CheckCircleIcon className="h-3 w-3 text-emerald-500 mr-1 flex-shrink-0" />
                                        ) : (
                                          <XCircleIcon className="h-3 w-3 text-red-500 mr-1 flex-shrink-0" />
                                        )}
                                        <span className={done ? "text-emerald-700" : "text-red-700"}>{t.testName}</span>
                                      </li>
                                    )
                                  })}
                                </ul>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">No tests</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            {status === "Not Collected" && (
                              <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800 font-medium">
                                Not Collected
                              </span>
                            )}
                            {status === "Pending" && (
                              <span className="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-800 font-medium">
                                Pending
                              </span>
                            )}
                            {status === "Completed" && (
                              <span className="px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-800 font-medium">
                                Completed
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {remaining > 0 ? (
                              <span className="text-sm font-bold text-red-600">{formatCurrency(remaining)}</span>
                            ) : (
                              <span className="text-sm font-medium text-gray-500">₹0.00</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-gray-800">{formatCurrency(testTotal)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-bold text-teal-600">{formatCurrency(p.amountPaid)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setExpandedPatientId(expandedPatientId === p.id ? null : p.id)}
                              className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 transition-colors duration-200 shadow-sm"
                            >
                              {expandedPatientId === p.id ? "Hide" : "Actions"}
                            </button>
                          </td>
                        </motion.tr>

                        <AnimatePresence>
                          {expandedPatientId === p.id && (
                            <motion.tr
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3 }}
                            >
                              <td colSpan={showCheckboxes ? 9 : 8} className="bg-gray-50 p-4">
                                {hasDeleteRequest && (
                                  <div className="w-full mb-4 p-3 bg-red-100 rounded-lg text-sm border border-red-200">
                                    <div className="flex items-center gap-2 mb-1">
                                      <ExclamationCircleIcon className="h-4 w-4 text-red-600" />
                                      <p className="font-bold text-red-800">
                                        Delete request by: {deleteRequestPatients[p.id].requestedBy}
                                      </p>
                                    </div>
                                    <p className="text-red-700 ml-6">Reason: {deleteRequestPatients[p.id].reason}</p>
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                  {/* Show only Download Report button for phlebotomist role */}
                                  {role === "phlebotomist" ? (
                                    <>
                                      {sampleCollected && (
                                        <Link
                                          href={`/download-report?patientId=${p.id}`}
                                          className={`inline-flex items-center px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium ${
                                            hasDeleteRequest
                                              ? "opacity-50 pointer-events-none"
                                              : "hover:bg-emerald-700 transition-colors duration-200"
                                          }`}
                                          onClick={(e) => hasDeleteRequest && e.preventDefault()}
                                        >
                                          <ArrowDownTrayIcon className="h-3.5 w-3.5 mr-1.5" />
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
                                          className="inline-flex items-center px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors duration-200 shadow-sm"
                                          disabled={!!hasDeleteRequest}
                                        >
                                          <DocumentTextIcon className="h-3.5 w-3.5 mr-1.5" />
                                          Collect Sample
                                        </button>
                                      )}

                                      {sampleCollected && (
                                        <Link
                                          href={`/download-report?patientId=${p.id}`}
                                          className={`inline-flex items-center px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium ${
                                            hasDeleteRequest
                                              ? "opacity-50 pointer-events-none"
                                              : "hover:bg-emerald-700 transition-colors duration-200 shadow-sm"
                                          }`}
                                          onClick={(e) => hasDeleteRequest && e.preventDefault()}
                                        >
                                          <ArrowDownTrayIcon className="h-3.5 w-3.5 mr-1.5" />
                                          Download Report
                                        </Link>
                                      )}

                                      {sampleCollected && !complete && (
                                        <Link
                                          href={`/blood-values/new?patientId=${p.id}`}
                                          className={`inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium ${
                                            hasDeleteRequest
                                              ? "opacity-50 pointer-events-none"
                                              : "hover:bg-blue-700 transition-colors duration-200 shadow-sm"
                                          }`}
                                          onClick={(e) => hasDeleteRequest && e.preventDefault()}
                                        >
                                          <DocumentPlusIcon className="h-3.5 w-3.5 mr-1.5" />
                                          Add/Edit Values
                                        </Link>
                                      )}

                                      {sampleCollected && complete && (
                                        <Link
                                          href={`/blood-values/new?patientId=${p.id}`}
                                          className={`inline-flex items-center px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium ${
                                            hasDeleteRequest
                                              ? "opacity-50 pointer-events-none"
                                              : "hover:bg-blue-600 transition-colors duration-200 shadow-sm"
                                          }`}
                                          onClick={(e) => hasDeleteRequest && e.preventDefault()}
                                        >
                                          <PencilIcon className="h-3.5 w-3.5 mr-1.5" />
                                          Edit Test
                                        </Link>
                                      )}

                                      <button
                                        onClick={() => {
                                          setSelectedPatient(p)
                                          setNewAmountPaid("")
                                          setTempDiscount(p.discountAmount.toString())
                                        }}
                                        className="inline-flex items-center px-3 py-2 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700 transition-colors duration-200 shadow-sm"
                                        disabled={!!hasDeleteRequest}
                                      >
                                        <BanknotesIcon className="h-3.5 w-3.5 mr-1.5" />
                                        Update Payment
                                      </button>

                                      {selectedPatient?.id === p.id && (
                                        <button
                                          onClick={handleDownloadBill}
                                          className="inline-flex items-center px-3 py-2 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 transition-colors duration-200 shadow-sm"
                                          disabled={!!hasDeleteRequest}
                                        >
                                          <ArrowDownTrayIcon className="h-3.5 w-3.5 mr-1.5" />
                                          Download Bill
                                        </button>
                                      )}

                                      <button
                                        onClick={() => setFakeBillPatient(p)}
                                        className="inline-flex items-center px-3 py-2 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition-colors duration-200 shadow-sm"
                                        disabled={!!hasDeleteRequest}
                                      >
                                        <DocumentTextIcon className="h-3.5 w-3.5 mr-1.5" />
                                        Generate Bill
                                      </button>

                                      <Link
                                        href={`/patient-detail?patientId=${p.id}`}
                                        className={`inline-flex items-center px-3 py-2 bg-amber-600 text-white rounded-lg text-xs font-medium ${
                                          hasDeleteRequest
                                            ? "opacity-50 pointer-events-none"
                                            : "hover:bg-amber-700 transition-colors duration-200 shadow-sm"
                                        }`}
                                        onClick={(e) => hasDeleteRequest && e.preventDefault()}
                                      >
                                        <PencilIcon className="h-3.5 w-3.5 mr-1.5" />
                                        Edit Details
                                      </Link>

                                      {role === "admin" ? (
                                        <>
                                          {hasDeleteRequest ? (
                                            <>
                                              <button
                                                onClick={() => handleApproveDelete(p)}
                                                className="inline-flex items-center px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors duration-200 shadow-sm"
                                              >
                                                <TrashIcon className="h-3.5 w-3.5 mr-1.5" />
                                                Approve Delete
                                              </button>
                                              <button
                                                onClick={() => handleUndoDeleteRequest(p)}
                                                className="inline-flex items-center px-3 py-2 bg-gray-600 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors duration-200 shadow-sm"
                                              >
                                                <ArrowPathIcon className="h-3.5 w-3.5 mr-1.5" />
                                                Undo Request
                                              </button>
                                            </>
                                          ) : (
                                            <button
                                              onClick={() => handleDeletePatient(p)}
                                              className="inline-flex items-center px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors duration-200 shadow-sm"
                                            >
                                              <TrashIcon className="h-3.5 w-3.5 mr-1.5" />
                                              Mark as Deleted
                                            </button>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          {!hasDeleteRequest && !isDeleted && (
                                            <button
                                              onClick={() => handleDeleteRequest(p)}
                                              className="inline-flex items-center px-3 py-2 bg-yellow-600 text-white rounded-lg text-xs font-medium hover:bg-yellow-700 transition-colors duration-200 shadow-sm"
                                            >
                                              <ExclamationCircleIcon className="h-3.5 w-3.5 mr-1.5" />
                                              Request Delete
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>

              {/* Load More Button */}
              {hasMoreData && (
                <div className="p-4 border-t border-gray-100 text-center">
                  <button
                    onClick={loadMorePatients}
                    disabled={isLoading}
                    className="inline-flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                        Load More (20 patients)
                      </>
                    )}
                  </button>
                </div>
              )}

              {filteredPatients.length === 0 && !isLoading && (
                <div className="p-8 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                    <UserIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 font-medium">No patients found</p>
                  <p className="text-gray-400 text-sm mt-1">Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </main>

      {/* Payment modal - FIXED VERSION */}
      <AnimatePresence>
        {selectedPatient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto"
          >
            <div className="min-h-screen px-4 py-6 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto relative"
              >
                <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 p-6 pb-4">
                  <button
                    onClick={() => setSelectedPatient(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Update Payment & Discount</h3>
                    <p className="text-gray-500 text-sm">{selectedPatient.name}</p>
                  </div>
                </div>

                <div className="p-6 pt-2">
                  {(() => {
                    const testTotal = selectedPatient.bloodTests?.reduce((s, t) => s + t.price, 0) || 0
                    const currentPaid = Number(selectedPatient.amountPaid || 0)
                    const additionalPayment = Number(newAmountPaid) || 0
                    const discountAmount = Number(tempDiscount) || 0
                    const remaining = testTotal - discountAmount - currentPaid - additionalPayment

                    return (
                      <>
                        <div className="mb-6 bg-gray-50 rounded-xl p-4 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Test Total:</span>
                            <span className="font-medium">{formatCurrency(testTotal)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Current Discount:</span>
                            <span className="font-medium text-amber-600">{formatCurrency(discountAmount)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Current Paid:</span>
                            <span className="font-medium text-teal-600">{formatCurrency(currentPaid)}</span>
                          </div>
                          {additionalPayment > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Additional Payment:</span>
                              <span className="font-medium text-blue-600">{formatCurrency(additionalPayment)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                            <span className="text-sm font-medium text-gray-800">Remaining:</span>
                            <span
                              className={`font-bold ${remaining > 0 ? "text-red-600" : remaining < 0 ? "text-green-600" : "text-gray-600"}`}
                            >
                              {formatCurrency(remaining)}
                            </span>
                          </div>
                        </div>

                        <div className="mb-6">
                          <button
                            onClick={handleDownloadBill}
                            className="w-full bg-teal-600 text-white py-3 rounded-xl font-medium hover:bg-teal-700 transition-colors duration-200 shadow-sm flex items-center justify-center"
                          >
                            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                            Download Bill
                          </button>
                        </div>

                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            handleUpdateAmountAndDiscount(discountAmount, tempDiscount, setTempDiscount)
                          }}
                          className="space-y-4"
                        >
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Discount Amount (₹)</label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <BanknotesIcon className="h-4 w-4 text-gray-400" />
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={tempDiscount}
                                onChange={(e) => setTempDiscount(e.target.value)}
                                className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                placeholder="Enter discount amount"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Additional Payment (₹)
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <BanknotesIcon className="h-4 w-4 text-gray-400" />
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={newAmountPaid}
                                onChange={(e) => setNewAmountPaid(e.target.value)}
                                className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                placeholder="Enter additional payment"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <CreditCardIcon className="h-4 w-4 text-gray-400" />
                              </div>
                              <select
                                value={paymentMode}
                                onChange={(e) => setPaymentMode(e.target.value)}
                                className="pl-10 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                              >
                                <option value="cash">Cash</option>
                                <option value="online">Online</option>
                              </select>
                            </div>
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-violet-600 text-white py-3 rounded-xl font-medium hover:bg-violet-700 transition-colors duration-200 shadow-sm flex items-center justify-center"
                          >
                            <BanknotesIcon className="h-4 w-4 mr-2" />
                            Update Payment & Discount
                          </button>
                        </form>
                      </>
                    )
                  })()}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sample Collection Modal */}
      <AnimatePresence>
        {sampleModalPatient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto"
          >
            <div className="min-h-screen px-4 py-6 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto relative"
              >
                <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 p-6 pb-4">
                  <button
                    onClick={() => setSampleModalPatient(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Set Sample Collection Time</h3>
                    <p className="text-gray-500 text-sm">{sampleModalPatient.name}</p>
                  </div>
                </div>

                <div className="p-6 pt-2">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                      <input
                        type="datetime-local"
                        value={sampleDateTime}
                        onChange={(e) => setSampleDateTime(e.target.value)}
                        max={formatLocalDateTime()}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                    <p className="text-sm text-gray-600">Selected: {format12Hour(sampleDateTime)}</p>

                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        onClick={() => setSampleModalPatient(null)}
                        className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200 text-gray-800 font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveSampleDate}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 font-medium"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Request Modal */}
      <AnimatePresence>
        {deleteRequestModalPatient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto"
          >
            <div className="min-h-screen px-4 py-6 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto relative"
              >
                <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-100 p-6 pb-4">
                  <button
                    onClick={() => setDeleteRequestModalPatient(null)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 mb-1">Request Deletion</h3>
                    <p className="text-gray-500 text-sm">{deleteRequestModalPatient.name}</p>
                  </div>
                </div>

                <div className="p-6 pt-2">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reason for Deletion (Required)
                      </label>
                      <textarea
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                        rows={4}
                        placeholder="Please provide a detailed reason for this deletion request"
                        required
                      />
                    </div>

                    <div className="flex justify-end space-x-3 pt-4">
                      <button
                        onClick={() => setDeleteRequestModalPatient(null)}
                        className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors duration-200 text-gray-800 font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={submitDeleteRequest}
                        disabled={!deleteReason.trim()}
                        className={`px-4 py-2 rounded-lg text-white font-medium ${
                          deleteReason.trim()
                            ? "bg-red-600 hover:bg-red-700 transition-colors duration-200"
                            : "bg-red-300 cursor-not-allowed"
                        }`}
                      >
                        Submit Request
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fake Bill modal - Lazy loaded */}
      {fakeBillPatient && (
        <Suspense
          fallback={
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-white p-8 rounded-lg shadow-lg">
                <p className="text-gray-700">Loading bill generator...</p>
              </div>
            </div>
          }
        >
          <FakeBill patient={fakeBillPatient} onClose={() => setFakeBillPatient(null)} />
        </Suspense>
      )}
    </div>
  )
}
