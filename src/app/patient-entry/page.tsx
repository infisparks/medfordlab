"use client"

import type React from "react"
import  {  useEffect, useState, useMemo } from "react"

import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { database, auth } from "../../firebase"
import { ref, push, set, runTransaction, get, type DataSnapshot } from "firebase/database"
import {
  UserCircleIcon,
  PhoneIcon,
  CalendarIcon,
  ClockIcon,
  PlusCircleIcon,
  XCircleIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
  MapPinIcon,
  UserIcon,
} from "@heroicons/react/24/outline"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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
  age: number
  dayType: "year"|"month"|"day"
  gender: string
}


async function generatePatientId(): Promise<string> {
  const now  = new Date()
  const yyyy = now.getFullYear()
  const mm   = String(now.getMonth() + 1).padStart(2, "0")
  const dd   = String(now.getDate()).padStart(2, "0")

  // Use only YYYYMM as the key for transactional counter
  const monthKey = `${yyyy}${mm}`         // e.g. "202504"
  const counterRef = ref(database, "patientIdPattern/monthlyKey")

  const result = await runTransaction(counterRef, (current: string | null) => {
    // first run this month → start at 0001
    if (!current || !current.startsWith(monthKey + "-")) {
      return `${monthKey}-0001`
    } else {
      // bump the 4-digit sequence
      const [, seq] = current.split("-")
      const nextSeq = String(parseInt(seq, 10) + 1).padStart(4, "0")
      return `${monthKey}-${nextSeq}`
    }
  })

  if (!result.committed || !result.snapshot.val()) {
    throw new Error("Failed to generate patient ID")
  }

  // extract just the sequence portion
  const fullKey = result.snapshot.val() as string  // e.g. "202504-0023"
  const seq     = fullKey.split("-")[1]            // "0023"

  // return full-date id: YYYYMMDD-#### 
  return `${yyyy}${mm}${dd}-${seq}`               // e.g. "20250422-0023"
}

/* ─────────────────── Main Component ─────────────────── */
const PatientEntryForm: React.FC = () => {
  /* 1) Auth */
  const [currentUser, setCurrentUser] = useState(auth.currentUser)
  useEffect(() => auth.onAuthStateChanged(setCurrentUser), [])

  /* 2) Current date and time for registration */
  const now = new Date()
  const currentDate = now.toISOString().split("T")[0]

  // Format time in 12-hour format
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  const hours12 = hours % 12 || 12
  const currentTime = `${hours12.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")} ${ampm}`

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
     hospitalName: "MEDFORD HOSPITAL",
     visitType: "opd",
     name: "",
     contact: "",
     dayType: "year",
     gender: "",
     address: "",
     email: "",
     doctorName: "",
     doctorId: "",
     bloodTests: [],
     paymentMode: "online",
     patientId: "",
     registrationDate: currentDate,
     registrationTime: currentTime,
     // age, discountAmount, amountPaid are now undefined → show as blank
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
  const [selectedTest, setSelectedTest] = useState("")

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
               // if isOutsource === false → in‑hospital; otherwise (true or missing) → outsource
       type: d.isOutsource === false ? "inhospital" : "outsource",
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
      const snap = await get(ref(database, "patients"));
      if (snap.exists()) {
        const temp: Record<string, PatientSuggestion> = {};
        snap.forEach((child: DataSnapshot) => {
          const d = child.val()
          if (d?.patientId && !temp[d.patientId]) {
            temp[d.patientId] = {
              id: child.key!,
              name:     (d.name     as string) || "",
              contact:  (d.contact  as string) || "",
              patientId:(d.patientId as string),
              age:       Number(d.age)           || 0,
              dayType:   (d.dayType as any)      || "year",
              gender:    (d.gender  as string)   || "",
            }
          }
        })
        
  
        // now dedupe by name (so each patient name appears only once)
        const suggestions = Object.values(temp);
        const uniquePatients = Array.from(
          new Map(suggestions.map(p => [p.name, p])).values()
        );
  
        setExistingPatients(uniquePatients);
      }
    })();
  }, []);
  

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

/* 11.a) Filter out already‑added tests */
const unselectedBloodTests = useMemo(() => {
  return availableBloodTests.filter(
    t => !bloodTests.some(bt => bt.testId === t.id)
  )
}, [availableBloodTests, bloodTests])
  /* 12) Add selected test */
  const handleAddTest = () => {
    if (!selectedTest) return
  

   const test = unselectedBloodTests.find((t) => t.id === selectedTest)
  
    if (test) {
      append({
        testId: test.id,
        testName: test.testName,
        price: test.price,
        testType: test.type,
      })
      setSelectedTest("")
    }
  }
  /* 13) Submit handler */


// add all remaining tests
const handleAddAllTests = () => {
  unselectedBloodTests.forEach((t) =>
    append({
      testId: t.id,
      testName: t.testName,
      price: t.price,
      testType: t.type,
    })
  );
};

// remove every selected test
const handleRemoveAllTests = () => {
  // remove from end→start so indexes stay valid
  for (let i = bloodTestFields.length - 1; i >= 0; i--) {
    remove(i);
  }
};


  const onSubmit: SubmitHandler<IFormInput> = async (data) => {


    data.discountAmount = isNaN(data.discountAmount) ? 0 : data.discountAmount
    data.amountPaid     = isNaN(data.amountPaid)     ? 0 : data.amountPaid

    if (!data.bloodTests || data.bloodTests.length === 0) {
      alert("Please add at least one blood test before submitting.");
      return;
    }
    try {
      /* 1) No duplicate tests */
      const testIds = data.bloodTests.map((t) => t.testId)
      if (new Set(testIds).size !== testIds.length) {
        alert("Please remove duplicate tests before submitting.")
        return
      }
    
      /* 2) Always generate a new patient ID */
      data.patientId = await generatePatientId()

      /* 3) Total days for age */
      const mult = data.dayType === "year" ? 360 : data.dayType === "month" ? 30 : 1
      const total_day = data.age * mult

   
      /* 4) Store in Firebase */
      const userEmail = currentUser?.email || "Unknown User"

  // 4.a) Parse registrationTime ("hh:mm AM/PM")
  const [timePart, ampm] = data.registrationTime.split(" ")
  const [hoursStr, minutesStr] = timePart.split(":")
  let hours = Number(hoursStr)
  const minutes = Number(minutesStr)
  
  if (ampm === "PM" && hours < 12) hours += 12
  if (ampm === "AM" && hours === 12) hours = 0

  // 4.b) Parse registrationDate ("YYYY-MM-DD")
  const [year, month, day] = data.registrationDate.split("-").map((v) => Number(v))

  // 4.c) Build a Date in local time
  const createdAtDate = new Date(year, month - 1, day, hours, minutes)

  await set(push(ref(database, "patients")), {
    ...data,
    total_day,
    enteredBy: userEmail,
    createdAt: createdAtDate.toISOString(),
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

  /* 14) If not logged in */
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-4 rounded shadow-md max-w-md w-full text-center">
          Please log in to access this page.
        </div>
      </div>
    )
  }

  /* 15) Render */
  return (
    <div className="h-screen bg-gray-50 p-2 overflow-auto">
      <Card className="h-[calc(100vh-2rem)] overflow-auto">
        <CardContent className="p-3 h-full">
          <form onSubmit={handleSubmit(onSubmit)} className="h-full">
            {/* Header with Date/Time */}
            <div className="flex items-center justify-between mb-3">
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
                  <input
                    type="text"
                    {...register("registrationTime")}
                    className="p-1 border rounded text-xs w-24"
                    placeholder="12:00 PM"
                  />
                </div>
              </div>
            </div>

            {/* Main Form Content */}
            <div className="space-y-3">
              {/* Patient Information Section */}
              <div className="bg-gray-50 p-2 rounded-md">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Patient Information</h3>

                {/* Name and Contact in flex */}
                <div className="flex gap-2 mb-2">
                  <div className="w-1/2 relative">
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
                              setValue("name",    p.name.toUpperCase())
                              setValue("contact", p.contact)
                              setValue("age",     p.age)
                              setValue("dayType", p.dayType)
                              setValue("gender",  p.gender)
                              setShowPatientSuggestions(false)
                            }}
                            
                          >
                            {p.name.toUpperCase()} – {p.contact}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="w-1/2">
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
                </div>

                {/* Age, Age Unit, Gender in flex */}
                <div className="flex gap-2 mb-2">
                  <div className="w-1/4">
                  <Label className="text-xs">Age</Label>
<Input
  type="number"
  {...register("age", {
    required: "Age is required",
    min: { value: 1, message: "Age must be positive" },
  })}
  onWheel={e => e.currentTarget.blur()}
  className="h-8 text-xs"
  placeholder=""
/>
                    {errors.age && <p className="text-red-500 text-[10px] mt-0.5">{errors.age.message}</p>}
                  </div>

                  <div className="w-1/4">
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

                  <div className="w-1/2">
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
                </div>
              </div>

              {/* Hospital Information Section */}
              <div className="bg-gray-50 p-2 rounded-md">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Hospital Information</h3>

                {/* Hospital, Visit Type, Email in flex */}
                <div className="flex gap-2 mb-2">
                  <div className="w-1/3">
                    <Label className="text-xs">Hospital</Label>
                    <div className="relative">
                      <Select defaultValue="MEDFORD HOSPITAL" onValueChange={(value) => setValue("hospitalName", value)}>
                        <SelectTrigger className="h-8 text-xs pl-7">
                          <SelectValue placeholder="Select hospital" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEDFORD HOSPITAL">MEDFORD HOSPITAL</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <BuildingOfficeIcon className="h-3.5 w-3.5 absolute left-2 top-[7px] text-gray-400 z-10" />
                    </div>
                  </div>

                  <div className="w-1/3">
                    <Label className="text-xs">Visit Type</Label>
                    <div className="relative">
                      <Select
                        defaultValue="opd"
                        onValueChange={(value) => setValue("visitType", value as "opd" | "ipd")}
                      >
                        <SelectTrigger className="h-8 text-xs pl-7">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="opd">OPD</SelectItem>
                          <SelectItem value="ipd">IPD</SelectItem>
                        </SelectContent>
                      </Select>
                      <UserIcon className="h-3.5 w-3.5 absolute left-2 top-[7px] text-gray-400 z-10" />
                    </div>
                  </div>

                  <div className="w-1/3">
                    <Label className="text-xs">Email (Optional)</Label>
                    <div className="relative">
                      <Input
                        type="email"
                        {...register("email")}
                        className="h-8 text-xs pl-7"
                        placeholder="example@example.com"
                      />
                      <EnvelopeIcon className="h-3.5 w-3.5 absolute left-2 top-[7px] text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Address and Doctor Section */}
              <div className="bg-gray-50 p-2 rounded-md">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Address & Doctor</h3>

                {/* Address and Doctor in flex */}
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <Label className="text-xs">Address</Label>
                    <div className="relative">
                      <Textarea
                        {...register("address")}
                        className="text-xs min-h-[60px] resize-none pl-7 pt-6"
                        placeholder="123 Main St, City, Country"
                      />
                      <MapPinIcon className="h-3.5 w-3.5 absolute left-2 top-[7px] text-gray-400" />
                    </div>
                  </div>

                  <div className="w-1/2 relative">
                    <Label className="text-xs">Doctor Name</Label>
                    <div className="relative">
                    <Input
  {...register("doctorName", {
    required: "Referring doctor is required",
    onChange: () => setShowDoctorSuggestions(true),
  })}
/>
{errors.doctorName && (
  <p className="text-red-500 text-[10px] mt-0.5">
    {errors.doctorName.message}
  </p>
)}

                      <UserIcon className="h-3.5 w-3.5 absolute left-2 top-[7px] text-gray-400" />
                    </div>
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

                    {/* Package Selection */}
                    <div className="mt-2">
                      <Label className="text-xs">Package Selection</Label>
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
                  </div>
                </div>
              </div>

              {/* Blood Tests Section */}
              <div className="bg-gray-50 p-2 rounded-md">
              <div className="flex items-center justify-between mb-2">
  <h3 className="text-sm font-semibold text-gray-700">Blood Tests</h3>

  <div className="flex items-center space-x-1">
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={handleAddAllTests}
    >
      Add All
    </Button>
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={handleRemoveAllTests}
    >
      Remove All
    </Button>

    <Select value={selectedTest} onValueChange={setSelectedTest}>
      <SelectTrigger className="h-7 text-xs w-40">
        <SelectValue placeholder="Select a test" />
      </SelectTrigger>
      <SelectContent>
        {unselectedBloodTests.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.testName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>

    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={handleAddTest}
    >
      <PlusCircleIcon className="h-3.5 w-3.5 mr-1" />
      Add
    </Button>
  </div>
</div>



                {/* Blood Tests Table */}
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] py-1 px-2 w-[50%]">Test Name</TableHead>
                        <TableHead className="text-[10px] py-1 px-2 w-[20%]">Price (Rs.)</TableHead>
                        <TableHead className="text-[10px] py-1 px-2 w-[20%]">Type</TableHead>
                        <TableHead className="text-[10px] py-1 px-2 w-[10%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bloodTestFields.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-xs py-2">
                            No tests selected
                          </TableCell>
                        </TableRow>
                      ) : (
                        bloodTestFields.map((field, idx) => (
                          <TableRow key={field.id}>
                            <TableCell className="text-xs py-1 px-2">{watch(`bloodTests.${idx}.testName`)}</TableCell>
                            <TableCell className="text-xs py-1 px-2">
  <Input
    type="number"
    {...register(`bloodTests.${idx}.price` as const, {
      valueAsNumber: true,
    })}
    disabled
    className="h-6 text-xs p-1 bg-gray-100 cursor-not-allowed"
  />
</TableCell>

                            <TableCell className="text-xs py-1 px-2">
                              <Select
                                defaultValue={watch(`bloodTests.${idx}.testType`)}
                                onValueChange={(value) => setValue(`bloodTests.${idx}.testType` as const, value)}
                              >
                                <SelectTrigger className="h-6 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="inhospital">InHouse</SelectItem>
                                  <SelectItem value="outsource">Outsource</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-xs py-1 px-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => remove(idx)}
                              >
                                <XCircleIcon className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Payment Section */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 p-2 rounded-md">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Payment Details</h3>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <Label className="text-xs">Discount (Rs.)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register("discountAmount", { valueAsNumber: true })}
                        onWheel={e => e.currentTarget.blur()}
                        placeholder="0"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Amount Paid (Rs.)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register("amountPaid", { valueAsNumber: true })}
                        onWheel={e => e.currentTarget.blur()}
                        placeholder="0"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

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

                <div className="bg-gray-50 p-2 rounded-md">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Payment Summary</h3>

                  <div className="grid grid-cols-2 gap-y-1 text-xs mb-4">
                    <div>Total Amount:</div>
                    <div className="font-medium text-right">Rs. {totalAmount.toFixed(2)}</div>
                    <div>Discount:</div>
                    <div className="font-medium text-right">Rs. {Number(discountAmount || 0).toFixed(2)}</div>
                    <div>Amount Paid:</div>
                    <div className="font-medium text-right">Rs. {Number(amountPaid || 0).toFixed(2)}</div>
                    <div className="font-semibold">Remaining Amount:</div>
                    <div className="font-semibold text-right">Rs. {remainingAmount.toFixed(2)}</div>
                  </div>

                  <Button type="submit" disabled={isSubmitting} className="w-full h-8 text-xs">
                    {isSubmitting ? "Submitting..." : "Save Patient Record"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default PatientEntryForm
