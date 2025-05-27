"use client"

import type React from "react"
import { useEffect, useState, useMemo } from "react"

import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form"
import { database, medfordFamilyDatabase } from "../../firebase"
import { ref, get, update } from "firebase/database"
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
import { useRouter, useSearchParams } from "next/navigation"
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
  title: string 
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
  patientId: string
  registrationDate: string
  registrationTime: string
}

interface PackageType {
  id: string
  packageName: string
  tests: BloodTestSelection[]
  discountPercentage: number
}

/* ─────────────────── Main Component ─────────────────── */
const PatientEditForm: React.FC = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const patientIdQuery = searchParams.get("patientId") ?? ""

  // 🔍 search box states
const [searchText, setSearchText] = useState("");
const [showTestSuggestions, setShowTestSuggestions] = useState(false);

  /* 1) Form */
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
    watch,
    setValue,
    reset,
    getValues,
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
      patientId: patientIdQuery,
      registrationDate: "",
      registrationTime: "",
      // age, discountAmount, amountPaid are now undefined → show as blank
    },
  })

  /* 2) Local state */
  const [doctorList, setDoctorList] = useState<{ id: string; doctorName: string }[]>([])
  const [availableBloodTests, setAvailableBloodTests] = useState<
    { id: string; testName: string; price: number; type: string }[]
  >([])
  const [availablePackages, setAvailablePackages] = useState<PackageType[]>([])
  const [showDoctorSuggestions, setShowDoctorSuggestions] = useState(false)
  const [selectedTest, setSelectedTest] = useState("")
  const [initialBloodtest, setInitialBloodtest] = useState<Record<string, any>>({})

  /* 3) Fetch doctors */
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

  /* 4) Fetch blood tests */
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

  /* 5) Fetch packages */
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

  /* 6) Fetch existing patient data */
  useEffect(() => {
    if (!patientIdQuery) {
      alert("No patient ID provided")
      router.push("/")
      return
    }
    ;(async () => {
      try {
        const snap = await get(ref(database, `patients/${patientIdQuery}`))
        if (!snap.exists()) {
          alert("Patient not found")
          router.push("/")
          return
        }

        const data = snap.val()
        if (!data.patientId) data.patientId = patientIdQuery

        /* Migrate %‑based discount to flat if older record */
        if ("discountPercentage" in data && !("discountAmount" in data)) {
          const pct = Number(data.discountPercentage) || 0
          const total = data.bloodTests?.reduce((s: number, t: any) => s + Number(t.price || 0), 0)
          data.discountAmount = (total * pct) / 100
        }

       // parse existing createdAt into form fields
if (data.createdAt) {
  const dt = new Date(data.createdAt)
  data.registrationDate = dt.toISOString().slice(0, 10)      // "YYYY-MM-DD"
  data.registrationTime = dt.toTimeString().slice(0, 5)      // "HH:MM"
}
reset(data)
setInitialBloodtest(data.bloodtest ?? {})

      } catch (e) {
        console.error(e)
        alert("Error fetching patient details")
      }
    })()
  }, [patientIdQuery, reset, router])

  /* 7) Suggestions */
  const watchDoctorName = watch("doctorName") ?? ""

  const filteredDoctorSuggestions = useMemo(
    () =>
      watchDoctorName.trim()
        ? doctorList.filter((d) => d.doctorName.toLowerCase().startsWith(watchDoctorName.toLowerCase()))
        : [],
    [watchDoctorName, doctorList],
  )

  /* 8) Field array for blood tests */
  const { fields: bloodTestFields, append, remove } = useFieldArray({ control, name: "bloodTests" })

  /* 9) Payment calculations */
  const bloodTests = watch("bloodTests")
  const discountAmount = watch("discountAmount")
  const amountPaid = watch("amountPaid")
  const totalAmount = bloodTests.reduce((s, t) => s + Number(t.price || 0), 0)
  const remainingAmount = totalAmount - Number(discountAmount || 0) - Number(amountPaid || 0)

  /* 10) Filter out already‑added tests */
  const unselectedBloodTests = useMemo(() => {
    return availableBloodTests.filter((t) => !bloodTests.some((bt) => bt.testId === t.id))
  }, [availableBloodTests, bloodTests])

  /* 11) Add selected test */
  const handleAddTest = () => {
    if (!selectedTest) return;
  
    const test = unselectedBloodTests.find((t) => t.id === selectedTest);
    if (test) {
      append({
        testId:   test.id,
        testName: test.testName,
        price:    test.price,
        testType: test.type,
      });
      setSelectedTest("");
      setSearchText("");          // 🆕 clear input
      setShowTestSuggestions(false);
    }
  };
  
  /* 12) Add/Remove all tests */
  const handleAddAllTests = () => {
    unselectedBloodTests.forEach((t) =>
      append({
        testId: t.id,
        testName: t.testName,
        price: t.price,
        testType: t.type,
      }),
    )
  }

  const handleRemoveAllTests = () => {
    // remove from end→start so indexes stay valid
    for (let i = bloodTestFields.length - 1; i >= 0; i--) {
      remove(i)
    }
  }

  /* 13) Submit handler */
  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    data.discountAmount = isNaN(data.discountAmount) ? 0 : data.discountAmount
    data.amountPaid = isNaN(data.amountPaid) ? 0 : data.amountPaid

    if (!data.bloodTests || data.bloodTests.length === 0) {
      alert("Please add at least one blood test before submitting.")
      return
    }
    const keepIds = new Set(data.bloodTests.map((t) => t.testId));

    const prunedBloodtest: Record<string, any> = {};
    Object.entries(initialBloodtest).forEach(([key, val]: any) => {
      // every saved report has val.testId; keep only the ones still present
      if (val && keepIds.has(val.testId)) {
        prunedBloodtest[key] = val;
      }
    });
    try {
      /* 1) No duplicate tests */
      const testIds = data.bloodTests.map((t) => t.testId)
      if (new Set(testIds).size !== testIds.length) {
        alert("Please remove duplicate tests before submitting.")
        return
      }

      /* 2) Total days for age */
      const mult = data.dayType === "year" ? 360 : data.dayType === "month" ? 30 : 1
      const total_day = data.age * mult

      /* 3) Update in Firebase */
      // recombine date + time into ISO
const createdAtIso = new Date(
  `${data.registrationDate}T${data.registrationTime}`
).toISOString()

await update(ref(database, `patients/${patientIdQuery}`), {
  ...data,
  bloodtest: prunedBloodtest,   // 🔽 add this line
  total_day,
  updatedAt: new Date().toISOString(),
  createdAt: createdAtIso,
});



      /* 4) Update in MedfordFamily database */
      await update(ref(medfordFamilyDatabase, `patients/${patientIdQuery}`), {
        name: data.name,
        contact: data.contact,
        patientId: patientIdQuery,
      })

      alert("Patient details updated successfully!")
      router.push("/")
    } catch (e) {
      console.error(e)
      alert("Something went wrong. Please try again.")
    }
  }

  /* 14) Render */
  return (
    <div className="h-screen bg-gray-50 p-2 overflow-auto">
      <Card className="h-[calc(100vh-2rem)] overflow-auto">
        <CardContent className="p-3 h-full">
          <form onSubmit={handleSubmit(onSubmit)} className="h-full">
            {/* Header with Date/Time */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <UserCircleIcon className="h-5 w-5 text-gray-600 mr-2" />
                <h2 className="text-lg font-bold text-gray-800">Edit Patient Details</h2>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center text-xs">
                  <CalendarIcon className="h-3.5 w-3.5 text-gray-500 mr-1" />
                  <input type="date" {...register("registrationDate")} className="p-1 border rounded text-xs w-32" />
                </div>
                <div className="flex items-center text-xs">
                  <ClockIcon className="h-3.5 w-3.5 text-gray-500 mr-1" />
                  <input
  type="time"
  {...register("registrationTime")}
  className="p-1 border rounded text-xs w-24"
/>

                </div>
              </div>
            </div>

            {/* Main Form Content */}
            <div className="space-y-3">
              {/* Patient Information Section */}
              <div className="bg-gray-50 p-2 rounded-md">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Patient Information</h3>

   {/* ← TITLE dropdown */}
                 <div className="mb-2 w-1/4">
                <Label className="text-xs">Title</Label>
                <Select
                  value={watch("title")}
                  onValueChange={(v) => setValue("title", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select title" />
                  </SelectTrigger>
                  <SelectContent>
                  <SelectItem value=".">NoTitle</SelectItem>
                  <SelectItem value="MR">MR</SelectItem>
                    <SelectItem value="MRS">MRS</SelectItem>
                    <SelectItem value="MAST">MAST</SelectItem>
                    <SelectItem value="BABA">BABA</SelectItem>
                    <SelectItem value="MISS">MISS</SelectItem>
                    <SelectItem value="MS">MS</SelectItem>
                    <SelectItem value="BABY">BABY</SelectItem>
                    <SelectItem value="SMT">SMT</SelectItem>
                    <SelectItem value="BABY OF">BABY OF</SelectItem>
                    <SelectItem value="DR">DR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

                {/* Name and Contact in flex */}
                <div className="flex gap-2 mb-2">
                  <div className="w-1/2 relative">
                    <Label className="text-xs">Full Name</Label>
                    <div className="relative">
                      <Input
                        {...register("name", {
                          required: "Name is required",
                          onChange: (e) => {
                            setValue("name", e.target.value.toUpperCase())
                          },
                        })}
                        className="h-8 text-xs pl-7"
                        placeholder="JOHN DOE"
                      />
                      <UserCircleIcon className="h-3.5 w-3.5 absolute left-2 top-[7px] text-gray-400" />
                    </div>
                    {errors.name && <p className="text-red-500 text-[10px] mt-0.5">{errors.name.message}</p>}
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
                      onWheel={(e) => e.currentTarget.blur()}
                      className="h-8 text-xs"
                      placeholder=""
                    />
                    {errors.age && <p className="text-red-500 text-[10px] mt-0.5">{errors.age.message}</p>}
                  </div>

                  <div className="w-1/4">
                    <Label className="text-xs">Age Unit</Label>
                    <Select
                      value={watch("dayType")}
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
                    <Select value={watch("gender")} onValueChange={(value) => setValue("gender", value)}>
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
                      <Select value={watch("hospitalName")} onValueChange={(value) => setValue("hospitalName", value)}>
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
                        value={watch("visitType")}
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
                        className="h-8 text-xs pl-7"
                      />
                      {errors.doctorName && (
                        <p className="text-red-500 text-[10px] mt-0.5">{errors.doctorName.message}</p>
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

                    {/* 🔍 Search & add test */}
<div className="relative">
  <Input
    type="text"
    placeholder="Search tests..."
    className="h-7 text-xs"
    value={searchText}
    onChange={(e) => {
      const v = e.target.value;
      setSearchText(v);
      setSelectedTest("");             // clear previous selection
      setShowTestSuggestions(v.trim().length > 0);
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddTest();
      }
    }}
  />

  {showTestSuggestions && (
    <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-0.5 rounded-md max-h-32 overflow-y-auto text-xs">
      {unselectedBloodTests
        .filter((t) =>
          t.testName.toLowerCase().includes(searchText.toLowerCase())
        )
        .map((t) => (
          <li
            key={t.id}
            className="px-2 py-1 hover:bg-gray-100 cursor-pointer"
            onClick={() => {
              setSelectedTest(t.id);
              setSearchText(t.testName);
              setShowTestSuggestions(false);
            }}
          >
            {t.testName}
          </li>
        ))}
    </ul>
  )}
</div>

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
                                className="h-6 text-xs p-1"
                              />
                            </TableCell>

                            <TableCell className="text-xs py-1 px-2">
                              <Select
                                value={watch(`bloodTests.${idx}.testType`) || "inhospital"}
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
                        onWheel={(e) => e.currentTarget.blur()}
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
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Payment Mode</Label>
                    <RadioGroup
                      value={watch("paymentMode")}
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
                    {isSubmitting ? "Updating..." : "Update Patient Record"}
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

export default PatientEditForm
