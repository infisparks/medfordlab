"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  ref,
  query,
  orderByChild,
  startAt,
  endAt,
  limitToFirst,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  get,
  off,
  type DataSnapshot,
} from "firebase/database"
import { database } from "../../../firebase"

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
  id?: string
  name: string
  gender: string
  age: number | string
  contact: string
  discountAmount: number
  amountPaid: number
  bloodTests: BloodTest[]
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
  doctorId?: string
  status?: string
}

interface UsePatientDataProps {
  fromDate: string
  toDate: string
  pageSize: number
}

export function usePatientData({ fromDate, toDate, pageSize }: UsePatientDataProps) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)

  // Use refs to store listeners and cached data
  const listenersRef = useRef<{ [key: string]: boolean }>({})
  const lastKeyRef = useRef<string | null>(null)
  const patientsMapRef = useRef<Map<string, Patient>>(new Map())

  const fetchPatients = useCallback(() => {
    setIsLoading(true)

    // Clear existing listeners
    Object.keys(listenersRef.current).forEach((path) => {
      off(ref(database, path))
    })
    listenersRef.current = {}

    // Reset pagination
    lastKeyRef.current = null

    // Create a query with date filters
    const patientsRef = ref(database, "patients")
    const patientsQuery = query(
      patientsRef,
      orderByChild("createdAt"),
      startAt(fromDate),
      endAt(toDate ? toDate + "\uf8ff" : "\uf8ff"),
      limitToFirst(pageSize),
    )

    // Initialize a new Map for this query
    patientsMapRef.current = new Map()

    // Set up listeners for real-time updates
    const childAddedListener = onChildAdded(patientsQuery, (snapshot) => {
      const patientId = snapshot.key
      const patientData = snapshot.val()

      if (patientId && patientData) {
        const patient: Patient = {
          id: patientId,
          ...patientData,
          age: Number(patientData.age),
          discountAmount: Number(patientData.discountAmount) || 0,
        }

        // Store in our Map
        patientsMapRef.current.set(patientId, patient)

        // Update state with all patients from the Map
        setPatients(Array.from(patientsMapRef.current.values()))

        // Track the last key for pagination
        if (!lastKeyRef.current || patientId > lastKeyRef.current) {
          lastKeyRef.current = patientId
        }
      }
    })

    const childChangedListener = onChildChanged(patientsQuery, (snapshot) => {
      const patientId = snapshot.key
      const patientData = snapshot.val()

      if (patientId && patientData && patientsMapRef.current.has(patientId)) {
        const patient: Patient = {
          id: patientId,
          ...patientData,
          age: Number(patientData.age),
          discountAmount: Number(patientData.discountAmount) || 0,
        }

        // Update in our Map
        patientsMapRef.current.set(patientId, patient)

        // Update state with all patients from the Map
        setPatients(Array.from(patientsMapRef.current.values()))
      }
    })

    const childRemovedListener = onChildRemoved(patientsQuery, (snapshot) => {
      const patientId = snapshot.key

      if (patientId && patientsMapRef.current.has(patientId)) {
        // Remove from our Map
        patientsMapRef.current.delete(patientId)

        // Update state with all patients from the Map
        setPatients(Array.from(patientsMapRef.current.values()))
      }
    })

    // Store listeners for cleanup
    listenersRef.current = {
      childAdded: true,
      childChanged: true,
      childRemoved: true,
    }

    // Check if we have more data to load
    get(patientsQuery)
      .then((snapshot) => {
        setIsLoading(false)
        setHasMore(snapshot.size >= pageSize)
      })
      .catch((err) => {
        console.error("Error checking pagination:", err)
        setIsLoading(false)
      })

    // Cleanup function
    return () => {
      off(patientsRef, "child_added", childAddedListener)
      off(patientsRef, "child_changed", childChangedListener)
      off(patientsRef, "child_removed", childRemovedListener)
    }
  }, [fromDate, toDate, pageSize])

  // Load more data for pagination
  const loadMorePatients = useCallback(() => {
    if (!lastKeyRef.current || !hasMore) return

    setIsLoading(true)

    const patientsRef = ref(database, "patients")
    const nextQuery = query(
      patientsRef,
      orderByChild("createdAt"),
      startAt(fromDate),
      endAt(toDate ? toDate + "\uf8ff" : "\uf8ff"),
      limitToFirst(pageSize),
    )

    get(nextQuery)
      .then((snapshot) => {
        let newItems = 0

        snapshot.forEach((childSnapshot: DataSnapshot) => {
          const patientId = childSnapshot.key
          const patientData = childSnapshot.val()

          if (patientId && patientData && !patientsMapRef.current.has(patientId)) {
            const patient: Patient = {
              id: patientId,
              ...patientData,
              age: Number(patientData.age),
              discountAmount: Number(patientData.discountAmount) || 0,
            }

            // Store in our Map
            patientsMapRef.current.set(patientId, patient)
            newItems++

            // Track the last key for pagination
            if (!lastKeyRef.current || patientId > lastKeyRef.current) {
              lastKeyRef.current = patientId
            }
          }
        })

        // Update state with all patients from the Map
        setPatients(Array.from(patientsMapRef.current.values()))
        setHasMore(newItems >= pageSize)
        setIsLoading(false)
      })
      .catch((err) => {
        console.error("Error loading more patients:", err)
        setIsLoading(false)
      })
  }, [fromDate, toDate, pageSize, hasMore])

  // Initial data fetch
  useEffect(() => {
    const cleanup = fetchPatients()
    return cleanup
  }, [fetchPatients])

  return {
    patients,
    isLoading,
    hasMore,
    loadMorePatients,
    fetchPatients,
  }
}
