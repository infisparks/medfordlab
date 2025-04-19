/* ------------------------------------------------------------------ */
/*  PatientEntryPage.client.tsx                                       */
/* ------------------------------------------------------------------ */
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  useForm,
  useFieldArray,
  SubmitHandler,
} from "react-hook-form";
import { database, auth } from "../../firebase";
import { ref, push, set,runTransaction, get, DataSnapshot } from "firebase/database";
import { UserCircleIcon, PhoneIcon } from "@heroicons/react/24/outline";

/* ─────────────────── Interfaces ─────────────────── */
interface BloodTestSelection {
  testId: string;
  testName: string;
  price: number;
  testType: string;
}

interface IFormInput {
  hospitalName: string;
  visitType: "opd" | "ipd";
  name: string;
  contact: string;
  age: number;
  dayType: "year" | "month" | "day";
  gender: string;
  address?: string;
  email?: string;
  doctorName: string;
  doctorId: string;
  bloodTests: BloodTestSelection[];
  discountAmount: number;
  amountPaid: number;
  paymentMode: "online" | "cash";
  patientId?: string; // UHID
}

interface PackageType {
  id: string;
  packageName: string;
  tests: BloodTestSelection[];
  discountPercentage: number;
}

interface PatientSuggestion {
  id: string;
  name: string;
  contact: string;
  patientId: string;
}



async function generatePatientId(): Promise<string> {
  const counterRef = ref(database, "patientIdPattern/patientIdKey");
  const result = await runTransaction(counterRef, (current: string | null) => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    if (!current || !current.startsWith(today + "-")) {
      return `${today}-0001`;
    } else {
      const [, seq] = current.split("-");
      const nextSeq = String(parseInt(seq, 10) + 1).padStart(4, "0");
      return `${today}-${nextSeq}`;
    }
  });
  if (!result.committed || !result.snapshot.val()) {
    throw new Error("Failed to generate patient ID");
  }
  return result.snapshot.val() as string;
}
/* ─────────────────── Main Component ─────────────────── */
const PatientEntryPage: React.FC = () => {
  /* 1) Auth */
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  useEffect(() => auth.onAuthStateChanged(setCurrentUser), []);

  /* 2) Form */
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
      bloodTests: [
        { testId: "", testName: "", price: 0, testType: "inhospital" },
      ],
      discountAmount: 0,
      amountPaid: 0,
      paymentMode: "online",
      patientId: "",
    },
  });

  /* 3) Local state */
  const [doctorList, setDoctorList] = useState<
    { id: string; doctorName: string }[]
  >([]);
  const [availableBloodTests, setAvailableBloodTests] = useState<
    { id: string; testName: string; price: number; type: string }[]
  >([]);
  const [availablePackages, setAvailablePackages] = useState<PackageType[]>([]);
  const [existingPatients, setExistingPatients] = useState<PatientSuggestion[]>(
    []
  );
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(true);
  const [showDoctorSuggestions, setShowDoctorSuggestions] = useState(true);

  /* 4) Fetch doctors */
  useEffect(() => {
    (async () => {
      try {
        const snap = await get(ref(database, "doctor"));
        if (snap.exists()) {
          const arr = Object.entries<any>(snap.val()).map(([id, d]) => ({
            id,
            doctorName: d.doctorName,
          }));
          setDoctorList(arr);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  /* 5) Fetch blood tests */
  useEffect(() => {
    (async () => {
      try {
        const snap = await get(ref(database, "bloodTests"));
        if (snap.exists()) {
          const arr = Object.entries<any>(snap.val())
            .map(([id, d]) => ({
              id,
              testName: d.testName,
              price: Number(d.price),
              type: d.type || "inhospital",
            }))
            .sort((a, b) => a.testName.localeCompare(b.testName));
          setAvailableBloodTests(arr);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  /* 6) Fetch packages */
  useEffect(() => {
    (async () => {
      try {
        const snap = await get(ref(database, "packages"));
        if (snap.exists()) {
          const arr: PackageType[] = Object.entries<any>(snap.val()).map(
            ([id, d]) => ({
              id,
              packageName: d.packageName,
              tests: d.tests,
              discountPercentage: Number(d.discountPercentage ?? 0),
            })
          );
          setAvailablePackages(arr);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  /* 7) Fetch EXISTING patients for suggestions */
  useEffect(() => {
    (async () => {
      try {
        const snap = await get(ref(database, "patients"));
        if (snap.exists()) {
          const temp: Record<string, PatientSuggestion> = {};
          snap.forEach((child: DataSnapshot) => {
            const d = child.val();
            if (d?.patientId && !temp[d.patientId]) {
              temp[d.patientId] = {
                id: child.key!,
                name: (d.name as string) || "",
                contact: (d.contact as string) || "",
                patientId: d.patientId as string,
              };
            }
          });
          setExistingPatients(Object.values(temp));
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  /* 8) Suggestions */
  const watchDoctorName = watch("doctorName") ?? "";
  const watchPatientName = watch("name") ?? "";

  const filteredDoctorSuggestions = useMemo(
    () =>
      watchDoctorName.trim()
        ? doctorList.filter((d) =>
            d.doctorName.toLowerCase().startsWith(watchDoctorName.toLowerCase())
          )
        : [],
    [watchDoctorName, doctorList]
  );

  const filteredPatientSuggestions = useMemo(
    () =>
      watchPatientName.trim().length >= 2
        ? existingPatients.filter((p) =>
            p.name.toUpperCase().includes(watchPatientName.toUpperCase())
          )
        : [],
    [watchPatientName, existingPatients]
  );

  /* 9) Field array for blood tests */
  const {
    fields: bloodTestFields,
    append,
    remove,
  } = useFieldArray({ control, name: "bloodTests" });

  /* 10) Payment calculations */
  const bloodTests = watch("bloodTests");
  const discountAmount = watch("discountAmount");
  const amountPaid = watch("amountPaid");
  const totalAmount = bloodTests.reduce(
    (s, t) => s + Number(t.price || 0),
    0
  );
  const remainingAmount =
    totalAmount - Number(discountAmount || 0) - Number(amountPaid || 0);

 
  

  /* 12) Submit handler */
 /* ─────────────────── Submit handler ─────────────────── */
const onSubmit: SubmitHandler<IFormInput> = async (data) => {
  try {
    /* 1) No duplicate tests */
    const testIds = data.bloodTests.map((t) => t.testId);
    if (new Set(testIds).size !== testIds.length) {
      alert("Please remove duplicate tests before submitting.");
      return;
    }

    /* 2) Determine patientId */
    // reuse if the user picked one, otherwise generate atomically
    if (!data.patientId?.trim()) {
      data.patientId = await generatePatientId();
    }

    /* 3) Total days for age */
    const mult =
      data.dayType === "year" ? 360 :
      data.dayType === "month" ? 30 :
      1;
    const total_day = data.age * mult;

    /* 4) Store in Firebase */
    const userEmail = currentUser?.email || "Unknown User";
    await set(push(ref(database, "patients")), {
      ...data,
      total_day,
      enteredBy: userEmail,
      createdAt: new Date().toISOString(),
    });

    /* 5) Send WhatsApp confirmation */
    const totalAmount = data.bloodTests.reduce((s, t) => s + t.price, 0);
    const remainingAmount =
      totalAmount - Number(data.discountAmount || 0) - Number(data.amountPaid || 0);

    const testNames = data.bloodTests.map((t) => t.testName).join(", ");
    const msg =
      `Dear ${data.name},\n\n` +
      `We have received your request for: ${testNames}.\n\n` +
      `Total   : Rs. ${totalAmount.toFixed(2)}\n` +
      (Number(data.discountAmount) > 0
        ? `Discount: Rs. ${Number(data.discountAmount).toFixed(2)}\n`
        : "") +
      `Paid    : Rs. ${Number(data.amountPaid).toFixed(2)}\n` +
      `Balance : Rs. ${remainingAmount.toFixed(2)}\n\n` +
      `Your Lab Id: ${data.patientId}\n\n` +
      `Thank you for choosing us.\nRegards,\nMedBliss`;

    const r = await fetch("https://wa.medblisss.com/send-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "99583991573",
        number: `91${data.contact}`,
        message: msg,
      }),
    });
    if (!r.ok) throw new Error("WhatsApp send failed");

    alert("Patient saved & WhatsApp sent!");
    reset();
  } catch (e) {
    console.error(e);
    alert("Something went wrong. Please try again.");
  }
};


  /* 13) If not logged in */
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded shadow-md max-w-md w-full text-center">
          Please log in to access this page.
        </div>
      </div>
    );
  }

  /* 14) Render */
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg">
        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center mb-6">
            <UserCircleIcon className="h-8 w-8 text-blue-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Patient Entry</h2>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Patient Information */}
            <div className="space-y-4 relative">
              <h3 className="text-lg font-semibold text-gray-700">
                Patient Information
              </h3>

              {/* Hospital Name */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Hospital Name
                </label>
                <select
                  {...register("hospitalName", {
                    required: "Hospital name is required",
                  })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="MEDFORD">MEDFORD HOSPITAL </option>
                  <option value="Other">Other</option>
                </select>
                {errors.hospitalName && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.hospitalName.message}
                  </p>
                )}
              </div>

              {/* Visit Type */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Visit Type
                </label>
                <select
                  {...register("visitType", { required: true })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="opd">OPD</option>
                  <option value="ipd">IPD</option>
                </select>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <input
                    {...register("name", {
                      required: "Name is required",
                      onChange: (e) => {
                        setShowPatientSuggestions(true);
                        setValue("name", e.target.value.toUpperCase());
                      },
                    })}
                    className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="JOHN DOE"
                  />
                  <UserCircleIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
                </div>
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.name.message}
                  </p>
                )}
                {showPatientSuggestions &&
                  filteredPatientSuggestions.length > 0 && (
                    <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto">
                      {filteredPatientSuggestions.map((p) => (
                        <li
                          key={p.patientId}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                          onClick={() => {
                            setValue("name", p.name.toUpperCase());
                            setValue("contact", p.contact);
                            setValue("patientId", p.patientId); // reuse UHID
                            setShowPatientSuggestions(false);
                          }}
                        >
                          {p.name.toUpperCase()} – {p.contact}
                        </li>
                      ))}
                    </ul>
                  )}
              </div>

              {/* Contact */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Contact Number
                </label>
                <div className="relative">
                  <input
                    {...register("contact", {
                      required: "Phone number is required",
                      pattern: {
                        value: /^[0-9]{10}$/,
                        message: "Phone number must be 10 digits",
                      },
                    })}
                    className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter 10-digit mobile number"
                  />
                  <PhoneIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
                </div>
                {errors.contact && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.contact.message}
                  </p>
                )}
              </div>

              {/* Age / Unit / Gender */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Age
                  </label>
                  <input
                    type="number"
                    {...register("age", {
                      required: "Age is required",
                      min: { value: 1, message: "Age must be positive" },
                    })}
                    className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.age && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.age.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Age Unit
                  </label>
                  <select
                    {...register("dayType", { required: true })}
                    className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="year">Year</option>
                    <option value="month">Month</option>
                    <option value="day">Day</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Gender
                  </label>
                  <select
                    {...register("gender", { required: "Gender is required" })}
                    className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  {errors.gender && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.gender.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                Additional Information (Optional)
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Address
                </label>
                <input
                  {...register("address")}
                  className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="123 Main St, City, Country"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  {...register("email")}
                  className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="example@example.com"
                />
              </div>
            </div>

            {/* Doctor Referral */}
            <div className="space-y-4 relative">
              <h3 className="text-lg font-semibold text-gray-700">
                Doctor Referral
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Doctor Name
                </label>
                <input
                  {...register("doctorName", {
                    onChange: () => setShowDoctorSuggestions(true),
                  })}
                  className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Type doctor's name..."
                />
              </div>
              {showDoctorSuggestions &&
                filteredDoctorSuggestions.length > 0 && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto">
                    {filteredDoctorSuggestions.map((d) => (
                      <li
                        key={d.id}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                        onClick={() => {
                          setValue("doctorName", d.doctorName);
                          setValue("doctorId", d.id);
                          setShowDoctorSuggestions(false);
                        }}
                      >
                        {d.doctorName}
                      </li>
                    ))}
                  </ul>
                )}
            </div>

            {/* Package / Tests / Payment */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-700">
                Package / Blood Test Selection &amp; Payment Details
              </h3>

              {/* Package picker */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Select Package (Optional)
                </label>
                <select
                  onChange={(e) => {
                    const pkg = availablePackages.find(
                      (p) => p.id === e.target.value
                    );
                    if (!pkg) return;
                    setValue("bloodTests", pkg.tests);
                    const pkgAmount = pkg.tests.reduce(
                      (s, t) => s + t.price,
                      0
                    );
                    setValue(
                      "discountAmount",
                      (pkgAmount * pkg.discountPercentage) / 100
                    );
                  }}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Package Selected</option>
                  {availablePackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.packageName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Blood Tests */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Select Blood Tests
                </label>
                <div className="space-y-4">
                  {bloodTestFields.map((field, idx) => (
                    <div
                      key={field.id}
                      className="border p-4 rounded-lg relative"
                    >
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove Test
                      </button>

                      <div className="flex flex-col sm:flex-row gap-4 items-end">
                        {/* Test picker */}
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Test Name
                          </label>
                          <select
                            {...register(
                              `bloodTests.${idx}.testId` as const,
                              {
                                required: "Blood test is required",
                                validate: (value) => {
                                  const current = watch("bloodTests");
                                  const dupes = current.filter(
                                    (t) => t.testId === value
                                  ).length;
                                  return (
                                    dupes <= 1 || "This test is already selected"
                                  );
                                },
                              }
                            )}
                            onChange={(e) => {
                              const t = availableBloodTests.find(
                                (b) => b.id === e.target.value
                              );
                              if (t) {
                                setValue(
                                  `bloodTests.${idx}.testName` as const,
                                  t.testName
                                );
                                setValue(
                                  `bloodTests.${idx}.price` as const,
                                  t.price
                                );
                                setValue(
                                  `bloodTests.${idx}.testType` as const,
                                  t.type
                                );
                              } else {
                                setValue(
                                  `bloodTests.${idx}.testName` as const,
                                  ""
                                );
                                setValue(
                                  `bloodTests.${idx}.price` as const,
                                  0
                                );
                                setValue(
                                  `bloodTests.${idx}.testType` as const,
                                  "inhospital"
                                );
                              }
                            }}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select a test</option>
                            {availableBloodTests.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.testName}
                              </option>
                            ))}
                          </select>
                          {errors.bloodTests?.[idx]?.testId && (
                            <p className="text-red-500 text-xs mt-1">
                              {errors.bloodTests[idx]?.testId?.message}
                            </p>
                          )}
                        </div>

                        {/* Price */}
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Price (Rs.)
                          </label>
                          <input
                            type="number"
                            {...register(
                              `bloodTests.${idx}.price` as const,
                              {
                                valueAsNumber: true,
                                min: {
                                  value: 0,
                                  message: "Price cannot be negative",
                                },
                              }
                            )}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter price"
                          />
                          {errors.bloodTests?.[idx]?.price && (
                            <p className="text-red-500 text-xs mt-1">
                              {errors.bloodTests[idx]?.price?.message}
                            </p>
                          )}
                        </div>

                        {/* Test type */}
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Test Type
                          </label>
                          <select
                            {...register(
                              `bloodTests.${idx}.testType` as const
                            )}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="inhospital">InHome</option>
                            <option value="outsource">Outsource</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    append({
                      testId: "",
                      testName: "",
                      price: 0,
                      testType: "inhospital",
                    })
                  }
                  className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  Add Blood Test
                </button>
              </div>

              {/* Payment fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Discount (Rs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register("discountAmount", { valueAsNumber: true })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Amount Paid (Rs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register("amountPaid", { valueAsNumber: true })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-2">
                <p className="text-sm text-gray-700">
                  Total Amount:{" "}
                  <strong>Rs. {totalAmount.toFixed(2)}</strong>
                </p>
                <p className="text-sm text-gray-700">
                  Discount:{" "}
                  <strong>
                    Rs. {Number(discountAmount || 0).toFixed(2)}
                  </strong>
                </p>
                <p className="text-sm text-gray-700">
                  Remaining Amount:{" "}
                  <strong>{remainingAmount.toFixed(2)}</strong>
                </p>
              </div>

              {/* Payment mode */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Payment Mode
                </label>
                <div className="flex space-x-6">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      value="online"
                      {...register("paymentMode", { required: true })}
                      className="form-radio text-blue-600"
                      defaultChecked
                    />
                    <span className="ml-2">Online</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      value="cash"
                      {...register("paymentMode", { required: true })}
                      className="form-radio text-blue-600"
                    />
                    <span className="ml-2">Cash</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
            >
              {isSubmitting ? "Submitting..." : "Save Patient Record"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PatientEntryPage;
