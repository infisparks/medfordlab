"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { database, auth } from "../../firebase"
import { ref, push, set, runTransaction, get, type DataSnapshot } from "firebase/database"
import { UserCircleIcon, PhoneIcon, CalendarIcon, ClockIcon } from "@heroicons/react/24/outline"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

/* ─────────────────── Interfaces ─────────────────── */
interface BloodTestSelection {
  testId: string
  testName: string
  price: number
  testType: string
}

interface IFormInput {
  hospitalName: string
  visitType: "opd" | "ipd"
  name: string
  contact: string
  age: number
  dayType: "year" | "month" | "day"
  gender: string
  address?: string
  email?: string
  doctorName: string
  doctorId: string
  bloodTests: BloodTestSelection[]
  discountAmount: number
  amountPaid: number
  paymentMode: "online" | "cash"
  patientId?: string // UHID
  registrationDate: string
  registrationTime: string
}

interface PackageType {
  id: string
  packageName: string
  tests: BloodTestSelection[]
  discountPercentage: number
}

interface PatientSuggestion {
  id: string
  name: string
  contact: string
  patientId: string
}

async function generatePatientId(): Promise<string> {
  const counterRef = ref(database, "patientIdPattern/patientIdKey")
  const result = await runTransaction(counterRef, (current: string | null) => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    if (!current || !current.startsWith(today + "-")) {
      return `${today}-0001`
    } else {
      const [, seq] = current.split("-")
      const nextSeq = String(Number.parseInt(seq, 10) + 1).padStart(4, "0")
      return `${today}-${nextSeq}`
    }
  })
  if (!result.committed || !result.snapshot.val()) {
    throw new Error("Failed to generate patient ID")
  }
  return result.snapshot.val() as string
}

/* ─────────────────── Main Component ─────────────────── */
const PatientEntryForm: React.FC = () => {
  /* 1) Auth */
  const [currentUser, setCurrentUser] = useState(auth.currentUser)
  useEffect(() => auth.onAuthStateChanged(setCurrentUser), [])

  /* 2) Current date and time for registration */
  const now = new Date()
  const currentDate = now.toISOString().split("T")[0]
  const currentTime = now.toTimeString().split(" ")[0].substring(0, 5)

  /* 3) Form */
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    watch,
    setValue,
    reset,
  } = useForm<IFormInput>({
    defaultValues: {
      hospitalName: "MEDFORD",
      visitType: "opd",
      name: "",
      contact: "",
      age: 0,
      dayType: "year",
      gender: "",
      address: "",
      email: "",
      doctorName: "",
      doctorId: "",
      bloodTests: [{ testId: "", testName: "", price: 0, testType: "inhospital" }],
      discountAmount: 0,
      amountPaid: 0,
      paymentMode: "online",
      patientId: "",
      registrationDate: currentDate,
      registrationTime: currentTime,
    },
  })

  /* 4) Local state */
  const [doctorList, setDoctorList] = useState<{ id: string; doctorName: string }[]>([])
  const [availableBloodTests, setAvailableBloodTests] = useState<
    { id: string; testName: string; price: number; type: string }[]
  >([])
  const [availablePackages, setAvailablePackages] = useState<PackageType[]>([])
  const [existingPatients, setExistingPatients] = useState<PatientSuggestion[]>([])
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false)
  const [showDoctorSuggestions, setShowDoctorSuggestions] = useState(false)
  const [activeTab, setActiveTab] = useState("patient")

  /* 5) Fetch doctors */
  useEffect(() => {
    ;(async () => {
      try {
        const snap = await get(ref(database, "doctor"))
        if (snap.exists()) {
          const arr = Object.entries<any>(snap.val()).map(([id, d]) => ({
            id,
            doctorName: d.doctorName,
          }))
          setDoctorList(arr)
        }
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  /* 6) Fetch blood tests */
  useEffect(() => {
    ;(async () => {
      try {
        const snap = await get(ref(database, "bloodTests"))
        if (snap.exists()) {
          const arr = Object.entries<any>(snap.val())
            .map(([id, d]) => ({
              id,
              testName: d.testName,
              price: Number(d.price),
              type: d.type || "inhospital",
            }))
            .sort((a, b) => a.testName.localeCompare(b.testName))
          setAvailableBloodTests(arr)
        }
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  /* 7) Fetch packages */
  useEffect(() => {
    ;(async () => {
      try {
        const snap = await get(ref(database, "packages"))
        if (snap.exists()) {
          const arr: PackageType[] = Object.entries<any>(snap.val()).map(([id, d]) => ({
            id,
            packageName: d.packageName,
            tests: d.tests,
            discountPercentage: Number(d.discountPercentage ?? 0),
          }))
          setAvailablePackages(arr)
        }
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  /* 8) Fetch EXISTING patients for suggestions */
  useEffect(() => {
    ;(async () => {
      try {
        const snap = await get(ref(database, "patients"))
        if (snap.exists()) {
          const temp: Record<string, PatientSuggestion> = {}
          snap.forEach((child: DataSnapshot) => {
            const d = child.val()
            if (d?.patientId && !temp[d.patientId]) {
              temp[d.patientId] = {
                id: child.key!,
                name: (d.name as string) || "",
                contact: (d.contact as string) || "",
                patientId: d.patientId as string,
              }
            }
          })
          setExistingPatients(Object.values(temp))
        }
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  /* 9) Suggestions */
  const watchDoctorName = watch("doctorName") ?? ""
  const watchPatientName = watch("name") ?? ""

  const filteredDoctorSuggestions = useMemo(
    () =>
      watchDoctorName.trim()
        ? doctorList.filter((d) => d.doctorName.toLowerCase().startsWith(watchDoctorName.toLowerCase()))
        : [],
    [watchDoctorName, doctorList],
  )

  const filteredPatientSuggestions = useMemo(
    () =>
      watchPatientName.trim().length >= 2
        ? existingPatients.filter((p) => p.name.toUpperCase().includes(watchPatientName.toUpperCase()))
        : [],
    [watchPatientName, existingPatients],
  )

  /* 10) Field array for blood tests */
  const { fields: bloodTestFields, append, remove } = useFieldArray({ control, name: "bloodTests" })

  /* 11) Payment calculations */
  const bloodTests = watch("bloodTests")
  const discountAmount = watch("discountAmount")
  const amountPaid = watch("amountPaid")
  const totalAmount = bloodTests.reduce((s, t) => s + Number(t.price || 0), 0)
  const remainingAmount = totalAmount - Number(discountAmount || 0) - Number(amountPaid || 0)

  /* 12) Submit handler */
  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    try {
      /* 1) No duplicate tests */
      const testIds = data.bloodTests.map((t) => t.testId)
      if (new Set(testIds).size !== testIds.length) {
        alert("Please remove duplicate tests before submitting.")
        return
      }

      /* 2) Determine patientId */
      // reuse if the user picked one, otherwise generate atomically
      if (!data.patientId?.trim()) {
        data.patientId = await generatePatientId()
      }

      /* 3) Total days for age */
      const mult = data.dayType === "year" ? 360 : data.dayType === "month" ? 30 : 1
      const total_day = data.age * mult

      /* 4) Store in Firebase */
      const userEmail = currentUser?.email || "Unknown User"
      await set(push(ref(database, "patients")), {
        ...data,
        total_day,
        enteredBy: userEmail,
        createdAt: new Date().toISOString(),
      })

      /* 5) Send WhatsApp confirmation */
      const totalAmount = data.bloodTests.reduce((s, t) => s + t.price, 0)
      const remainingAmount = totalAmount - Number(data.discountAmount || 0) - Number(data.amountPaid || 0)

      const testNames = data.bloodTests.map((t) => t.testName).join(", ")
      const msg =
        `Dear ${data.name},\n\n` +
        `We have received your request for: ${testNames}.\n\n` +
        `Total   : Rs. ${totalAmount.toFixed(2)}\n` +
        (Number(data.discountAmount) > 0 ? `Discount: Rs. ${Number(data.discountAmount).toFixed(2)}\n` : "") +
        `Paid    : Rs. ${Number(data.amountPaid).toFixed(2)}\n` +
        `Balance : Rs. ${remainingAmount.toFixed(2)}\n\n` +
        `Your Lab Id: ${data.patientId}\n\n` +
        `Thank you for choosing us.\nRegards,\nMedBliss`

      const r = await fetch("https://wa.medblisss.com/send-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "99583991573",
          number: `91${data.contact}`,
          message: msg,
        }),
      })
      if (!r.ok) throw new Error("WhatsApp send failed")

      alert("Patient saved & WhatsApp sent!")
      reset()
    } catch (e) {
      console.error(e)
      alert("Something went wrong. Please try again.")
    }
  }

  /* 13) If not logged in */
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-4 rounded shadow-md max-w-md w-full text-center">
          Please log in to access this page.
        </div>
      </div>
    )
  }

  /* 14) Render */
  return (
    <div className="h-screen bg-gray-50 p-2 overflow-hidden">
      <Card className="h-full">
        <CardContent className="p-3 h-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <UserCircleIcon className="h-5 w-5 text-gray-600 mr-2" />
              <h2 className="text-lg font-bold text-gray-800">Patient Entry</h2>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center text-xs">
                <CalendarIcon className="h-3.5 w-3.5 text-gray-500 mr-1" />
                <input type="date" {...register("registrationDate")} className="p-1 border rounded text-xs w-32" />
              </div>
              <div className="flex items-center text-xs">
                <ClockIcon className="h-3.5 w-3.5 text-gray-500 mr-1" />
                <input type="time" {...register("registrationTime")} className="p-1 border rounded text-xs w-24" />
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="h-[calc(100%-40px)]">
            <Tabs defaultValue="patient" className="h-full" onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-3 mb-2">
                <TabsTrigger value="patient">Patient Info</TabsTrigger>
                <TabsTrigger value="tests">Tests & Packages</TabsTrigger>
                <TabsTrigger value="payment">Payment</TabsTrigger>
              </TabsList>

              <div className="h-[calc(100%-40px)]">
                <TabsContent value="patient" className="h-full m-0">
                  <ScrollArea className="h-full pr-3">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {/* Hospital Name */}
                      <div>
                        <Label className="text-xs">Hospital</Label>
                        <Select defaultValue="MEDFORD" onValueChange={(value) => setValue("hospitalName", value)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select hospital" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MEDFORD">MEDFORD HOSPITAL</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Visit Type */}
                      <div>
                        <Label className="text-xs">Visit Type</Label>
                        <Select
                          defaultValue="opd"
                          onValueChange={(value) => setValue("visitType", value as "opd" | "ipd")}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="opd">OPD</SelectItem>
                            <SelectItem value="ipd">IPD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Full Name */}
                      <div className="relative col-span-2">
                        <Label className="text-xs">Full Name</Label>
                        <div className="relative">
                          <Input
                            {...register("name", {
                              required: "Name is required",
                              onChange: (e) => {
                                setShowPatientSuggestions(true)
                                setValue("name", e.target.value.toUpperCase())
                              },
                            })}
                            className="h-8 text-xs pl-7"
                            placeholder="JOHN DOE"
                          />
                          <UserCircleIcon className="h-3.5 w-3.5 absolute left-2 top-[7px] text-gray-400" />
                        </div>
                        {errors.name && <p className="text-red-500 text-[10px] mt-0.5">{errors.name.message}</p>}
                        {showPatientSuggestions && filteredPatientSuggestions.length > 0 && (
                          <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-0.5 rounded-md max-h-32 overflow-y-auto text-xs">
                            {filteredPatientSuggestions.map((p) => (
                              <li
                                key={p.patientId}
                                className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                                onClick={() => {
                                  setValue("name", p.name.toUpperCase())
                                  setValue("contact", p.contact)
                                  setValue("patientId", p.patientId) // reuse UHID
                                  setShowPatientSuggestions(false)
                                }}
                              >
                                {p.name.toUpperCase()} – {p.contact}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Contact */}
                      <div className="col-span-2">
                        <Label className="text-xs">Contact Number</Label>
                        <div className="relative">
                          <Input
                            {...register("contact", {
                              required: "Phone number is required",
                              pattern: {
                                value: /^[0-9]{10}$/,
                                message: "Phone number must be 10 digits",
                              },
                            })}
                            className="h-8 text-xs pl-7"
                            placeholder="Enter 10-digit mobile number"
                          />
                          <PhoneIcon className="h-3.5 w-3.5 absolute left-2 top-[7px] text-gray-400" />
                        </div>
                        {errors.contact && <p className="text-red-500 text-[10px] mt-0.5">{errors.contact.message}</p>}
                      </div>

                      {/* Age */}
                      <div>
                        <Label className="text-xs">Age</Label>
                        <Input
                          type="number"
                          {...register("age", {
                            required: "Age is required",
                            min: { value: 1, message: "Age must be positive" },
                          })}
                          className="h-8 text-xs"
                        />
                        {errors.age && <p className="text-red-500 text-[10px] mt-0.5">{errors.age.message}</p>}
                      </div>

                      {/* Age Unit */}
                      <div>
                        <Label className="text-xs">Age Unit</Label>
                        <Select
                          defaultValue="year"
                          onValueChange={(value) => setValue("dayType", value as "year" | "month" | "day")}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="year">Year</SelectItem>
                            <SelectItem value="month">Month</SelectItem>
                            <SelectItem value="day">Day</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Gender */}
                      <div className="col-span-2">
                        <Label className="text-xs">Gender</Label>
                        <Select onValueChange={(value) => setValue("gender", value)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        {errors.gender && <p className="text-red-500 text-[10px] mt-0.5">{errors.gender.message}</p>}
                      </div>

                      {/* Address */}
                      <div className="col-span-2">
                        <Label className="text-xs">Address (Optional)</Label>
                        <Input
                          {...register("address")}
                          className="h-8 text-xs"
                          placeholder="123 Main St, City, Country"
                        />
                      </div>

                      {/* Email */}
                      <div className="col-span-2">
                        <Label className="text-xs">Email (Optional)</Label>
                        <Input
                          type="email"
                          {...register("email")}
                          className="h-8 text-xs"
                          placeholder="example@example.com"
                        />
                      </div>

                      {/* Doctor Name */}
                      <div className="col-span-2 relative">
                        <Label className="text-xs">Doctor Name</Label>
                        <Input
                          {...register("doctorName", {
                            onChange: () => setShowDoctorSuggestions(true),
                          })}
                          className="h-8 text-xs"
                          placeholder="Type doctor's name..."
                        />
                        {showDoctorSuggestions && filteredDoctorSuggestions.length > 0 && (
                          <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-0.5 rounded-md max-h-32 overflow-y-auto text-xs">
                            {filteredDoctorSuggestions.map((d) => (
                              <li
                                key={d.id}
                                className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
                                onClick={() => {
                                  setValue("doctorName", d.doctorName)
                                  setValue("doctorId", d.id)
                                  setShowDoctorSuggestions(false)
                                }}
                              >
                                {d.doctorName}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="tests" className="h-full m-0">
                  <ScrollArea className="h-full pr-3">
                    <div className="space-y-2">
                      {/* Package picker */}
                      <div>
                        <Label className="text-xs">Select Package (Optional)</Label>
                        <Select
                          onValueChange={(value) => {
                            const pkg = availablePackages.find((p) => p.id === value)
                            if (!pkg) return
                            setValue("bloodTests", pkg.tests)
                            const pkgAmount = pkg.tests.reduce((s, t) => s + t.price, 0)
                            setValue("discountAmount", (pkgAmount * pkg.discountPercentage) / 100)
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="No Package Selected" />
                          </SelectTrigger>
                          <SelectContent>
                            {availablePackages.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.packageName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Blood Tests */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs">Blood Tests</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] py-0"
                            onClick={() =>
                              append({
                                testId: "",
                                testName: "",
                                price: 0,
                                testType: "inhospital",
                              })
                            }
                          >
                            Add Test
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {bloodTestFields.map((field, idx) => (
                            <div key={field.id} className="border p-2 rounded-md relative">
                              <button
                                type="button"
                                onClick={() => remove(idx)}
                                className="absolute top-1 right-1 text-red-500 hover:text-red-700 text-[10px]"
                              >
                                ✕
                              </button>

                              <div className="grid grid-cols-2 gap-2">
                                {/* Test picker */}
                                <div className="col-span-2">
                                  <Label className="text-[10px]">Test Name</Label>
                                  <Select
                                    onValueChange={(value) => {
                                      const t = availableBloodTests.find((b) => b.id === value)
                                      if (t) {
                                        setValue(`bloodTests.${idx}.testId` as const, t.id)
                                        setValue(`bloodTests.${idx}.testName` as const, t.testName)
                                        setValue(`bloodTests.${idx}.price` as const, t.price)
                                        setValue(`bloodTests.${idx}.testType` as const, t.type)
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-[10px]">
                                      <SelectValue placeholder="Select a test" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableBloodTests.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                          {t.testName}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {errors.bloodTests?.[idx]?.testId && (
                                    <p className="text-red-500 text-[10px] mt-0.5">
                                      {errors.bloodTests[idx]?.testId?.message}
                                    </p>
                                  )}
                                </div>

                                {/* Price */}
                                <div>
                                  <Label className="text-[10px]">Price (Rs.)</Label>
                                  <Input
                                    type="number"
                                    {...register(`bloodTests.${idx}.price` as const, {
                                      valueAsNumber: true,
                                      min: {
                                        value: 0,
                                        message: "Price cannot be negative",
                                      },
                                    })}
                                    className="h-7 text-[10px]"
                                    placeholder="Price"
                                  />
                                </div>

                                {/* Test type */}
                                <div>
                                  <Label className="text-[10px]">Test Type</Label>
                                  <Select
                                    defaultValue="inhospital"
                                    onValueChange={(value) => setValue(`bloodTests.${idx}.testType` as const, value)}
                                  >
                                    <SelectTrigger className="h-7 text-[10px]">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="inhospital">InHome</SelectItem>
                                      <SelectItem value="outsource">Outsource</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="payment" className="h-full m-0">
                  <ScrollArea className="h-full pr-3">
                    <div className="space-y-3">
                      {/* Payment Summary */}
                      <div className="bg-gray-50 p-3 rounded-md">
                        <h3 className="text-xs font-medium mb-2">Payment Summary</h3>
                        <div className="grid grid-cols-2 gap-y-1 text-xs">
                          <div>Total Amount:</div>
                          <div className="font-medium text-right">Rs. {totalAmount.toFixed(2)}</div>
                          <div>Discount:</div>
                          <div className="font-medium text-right">Rs. {Number(discountAmount || 0).toFixed(2)}</div>
                          <div>Amount Paid:</div>
                          <div className="font-medium text-right">Rs. {Number(amountPaid || 0).toFixed(2)}</div>
                          <div>Remaining Amount:</div>
                          <div className="font-medium text-right">Rs. {remainingAmount.toFixed(2)}</div>
                        </div>
                      </div>

                      {/* Payment fields */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Discount (Rs.)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            {...register("discountAmount", { valueAsNumber: true })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Amount Paid (Rs.)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            {...register("amountPaid", { valueAsNumber: true })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      {/* Payment mode */}
                      <div>
                        <Label className="text-xs">Payment Mode</Label>
                        <RadioGroup
                          defaultValue="online"
                          className="flex space-x-4 mt-1"
                          onValueChange={(value) => setValue("paymentMode", value as "online" | "cash")}
                        >
                          <div className="flex items-center space-x-1">
                            <RadioGroupItem value="online" id="online" className="h-3 w-3" />
                            <Label htmlFor="online" className="text-xs">
                              Online
                            </Label>
                          </div>
                          <div className="flex items-center space-x-1">
                            <RadioGroupItem value="cash" id="cash" className="h-3 w-3" />
                            <Label htmlFor="cash" className="text-xs">
                              Cash
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </div>

              {/* Submit Button - Fixed at bottom */}
              <div className="mt-2 flex justify-between items-center">
                <div className="flex items-center space-x-1">
                  {activeTab === "tests" && bloodTests.length > 0 && (
                    <Badge variant="outline" className="text-[10px] py-0 h-5">
                      {bloodTests.length} test{bloodTests.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {activeTab === "payment" && (
                    <Badge variant="outline" className="text-[10px] py-0 h-5">
                      Balance: Rs. {remainingAmount.toFixed(2)}
                    </Badge>
                  )}
                </div>
                <Button type="submit" disabled={isSubmitting} className="h-8 text-xs">
                  {isSubmitting ? "Submitting..." : "Save Patient Record"}
                </Button>
              </div>
            </Tabs>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default PatientEntryForm
