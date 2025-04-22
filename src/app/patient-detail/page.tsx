/* ------------------------------------------------------------------ */
/*  PatientDetailEdit.client.tsx                                     */
/* ------------------------------------------------------------------ */
"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  useForm,
  useFieldArray,
  SubmitHandler,
  // UseFormGetValues,
} from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { database, medfordFamilyDatabase } from "../../firebase";
import { ref, get, update } from "firebase/database";
import { UserCircleIcon, PhoneIcon } from "@heroicons/react/24/outline";

/* ─────────────────── Interfaces ─────────────────── */
interface BloodTestSelection {
  testId: string;
  testName: string;
  price: number;
}

interface IFormInput {
  name: string;
  contact: string; // 10‑digit
  age: number;
  dayType: "year" | "month" | "day";
  gender: string;
  address?: string;
  email?: string;
  doctorName: string;
  doctorId: string;
  bloodTests: BloodTestSelection[];
  discountAmount: number;              // 🔄  flat Rs. discount
  amountPaid: number;
  paymentMode: "online" | "cash";
  patientId: string;                   // exactly 6 chars
}

interface PackageType {
  id: string;
  packageName: string;
  tests: BloodTestSelection[];
  discountPercentage: number;
}

/* ─────────────────── Component ─────────────────── */
const PatientDetailEdit: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdQuery = searchParams.get("patientId") ?? "";

  /* ---- form ---- */
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IFormInput>({
    defaultValues: {
      name: "",
      contact: "",
      age: 0,
      dayType: "year",
      gender: "",
      address: "",
      email: "",
      doctorName: "",
      doctorId: "",
      bloodTests: [{ testId: "", testName: "", price: 0 }],
      discountAmount: 0,
      amountPaid: 0,
      paymentMode: "online",
      patientId: patientIdQuery,
    },
  });

  /* ---- reference data ---- */
  const [doctorList, setDoctorList] = useState<
    { id: string; doctorName: string }[]
  >([]);
  const [availableBloodTests, setAvailableBloodTests] = useState<
    { id: string; testName: string; price: number }[]
  >([]);
  const [availablePackages, setAvailablePackages] = useState<PackageType[]>([]);
  const [showDoctorSuggestions, setShowDoctorSuggestions] = useState(true);

  /* ---- fetch doctors ---- */
  useEffect(() => {
    const fn = async () => {
      const snap = await get(ref(database, "doctor"));
      if (snap.exists()) {
        setDoctorList(
          Object.entries<any>(snap.val()).map(([id, d]) => ({
            id,
            doctorName: d.doctorName,
          }))
        );
      }
    };
    fn().catch(console.error);
  }, []);

  /* ---- fetch tests ---- */
  useEffect(() => {
    const fn = async () => {
      const snap = await get(ref(database, "bloodTests"));
      if (snap.exists()) {
        setAvailableBloodTests(
          Object.entries<any>(snap.val()).map(([id, d]) => ({
            id,
            testName: d.testName,
            price: Number(d.price),
          }))
        );
      }
    };
    fn().catch(console.error);
  }, []);

  /* ---- fetch packages ---- */
  useEffect(() => {
    const fn = async () => {
      const snap = await get(ref(database, "packages"));
      if (snap.exists()) {
        setAvailablePackages(
          Object.entries<any>(snap.val()).map(([id, d]) => ({
            id,
            packageName: d.packageName,
            tests: d.tests,
            discountPercentage: Number(d.discountPercentage ?? 0),
          }))
        );
      }
    };
    fn().catch(console.error);
  }, []);

  /* ---- fetch existing patient ---- */
  useEffect(() => {
    if (!patientIdQuery) {
      alert("No patient ID provided");
      router.push("/");
      return;
    }
    const fn = async () => {
      const snap = await get(ref(database, `patients/${patientIdQuery}`));
      if (!snap.exists()) {
        alert("Patient not found");
        router.push("/");
        return;
      }
      const data = snap.val();
      if (!data.patientId) data.patientId = patientIdQuery;
      /* 🔄 migrate %‑based discount to flat if older record */
      if ("discountPercentage" in data && !("discountAmount" in data)) {
        const pct = Number(data.discountPercentage) || 0;
        const total = data.bloodTests?.reduce(
          (s: number, t: any) => s + Number(t.price || 0),
          0
        );
        data.discountAmount = (total * pct) / 100;
      }
      reset(data);
    };
    fn().catch((e) => {
      console.error(e);
      alert("Error fetching details");
    });
  }, [patientIdQuery, reset, router]);

  /* ---- autosuggest for doctors ---- */
  const watchDoctorName = watch("doctorName") ?? "";
  const filteredDoctorSuggestions = useMemo(
    () =>
      watchDoctorName.trim()
        ? doctorList.filter((d) =>
            d.doctorName.toLowerCase().startsWith(watchDoctorName.toLowerCase())
          )
        : [],
    [watchDoctorName, doctorList]
  );

  /* ---- blood‑test field‑array ---- */
  const { fields: bloodTestFields, append, remove } = useFieldArray({
    control,
    name: "bloodTests",
  });

  /* ---- realtime totals ---- */
  const bloodTests = watch("bloodTests");
  const discountAmount = watch("discountAmount");
  const amountPaid = watch("amountPaid");
  const totalAmount = bloodTests.reduce(
    (s, t) => s + Number(t.price || 0),
    0
  );
  const remainingAmount =
    totalAmount - Number(discountAmount || 0) - Number(amountPaid || 0);

  /* ---- helpers ---- */
  const hasDuplicateTests = (tests: BloodTestSelection[]) => {
    const ids = tests.map((t) => t.testId);
    return new Set(ids).size !== ids.length;
  };

  /* ---- submit ---- */
  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    try {
      /* 1️⃣ validations not covered by RHF rules */
      if (hasDuplicateTests(data.bloodTests)) {
        alert("Please remove duplicate tests before saving.");
        return;
      }
    // example: allow 6 to 12 alphanumerics
// if (!/^[A-Z0-9]{6,12}$/.test(data.patientId)) {
//   alert("Patient ID must be 6–12 uppercase letters or digits.");
//   return;
// }


      /* 2️⃣ update */
      const idToUpdate = patientIdQuery;
      await update(ref(database, `patients/${idToUpdate}`), {
        ...data,
        updatedAt: new Date().toISOString(),
      });
      await update(ref(medfordFamilyDatabase, `patients/${idToUpdate}`), {
        name: data.name,
        contact: data.contact,
        patientId: idToUpdate,
      });

      alert("Patient details updated!");
      router.push("/");
    } catch (e) {
      console.error(e);
      alert("Failed to update record.");
    }
  };

  /* ─────────────────── JSX ─────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        Edit Patient Details
      </h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ───── Patient Info ───── */}
        <div className="space-y-4 relative">
          <h3 className="text-lg font-semibold text-gray-700">
            Patient Information
          </h3>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Full Name
            </label>
            <div className="relative">
              <input
                {...register("name", { required: "Name is required" })}
                className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter full name"
              />
              <UserCircleIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
            </div>
            {errors.name && (
              <p className="text-red-500 text-sm mt-1">
                {errors.name.message}
              </p>
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
                placeholder="Enter 10‑digit number"
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
          <div className="grid grid-cols-3 gap-4">
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
                {...register("dayType", { required: "Select age unit" })}
                className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="year">Year</option>
                <option value="month">Month</option>
                <option value="day">Day</option>
              </select>
              {errors.dayType && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.dayType.message}
                </p>
              )}
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

        {/* ───── Additional Info ───── */}
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
              placeholder="123 Main St, City"
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

        {/* ───── Doctor Referral ───── */}
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
          {showDoctorSuggestions && filteredDoctorSuggestions.length > 0 && (
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

        {/* ───── Package / Tests / Payment ───── */}
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-700">
            Package / Blood Test Selection & Payment
          </h3>

          {/* Package */}
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
                const pkgAmount = pkg.tests.reduce((s, t) => s + t.price, 0);
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
                  className="relative border p-4 rounded-lg flex flex-col sm:flex-row sm:space-x-4"
                >
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>

                  {/* Test picker */}
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Test Name
                    </label>
                    <select
                      {...register(`bloodTests.${idx}.testId` as const, {
                        required: "Blood test is required",
                        validate: (value) => {
                          const tests = getValues("bloodTests");
                          const duplicate = tests.filter(
                            (t) => t.testId === value
                          ).length;
                          return (
                            duplicate <= 1 || "This test is already selected"
                          );
                        },
                      })}
                      onChange={(e) => {
                        const t = availableBloodTests.find(
                          (b) => b.id === e.target.value
                        );
                        if (t) {
                          setValue(
                            `bloodTests.${idx}.testName`,
                            t.testName
                          );
                          setValue(`bloodTests.${idx}.price`, t.price);
                        } else {
                          setValue(`bloodTests.${idx}.testName`, "");
                          setValue(`bloodTests.${idx}.price`, 0);
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

                  {/* Price – editable */}
                  <div className="flex-1 mt-4 sm:mt-0">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Price (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register(`bloodTests.${idx}.price` as const, {
                        valueAsNumber: true,
                        min: { value: 0, message: "Cannot be negative" },
                      })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter / edit price"
                    />
                    {errors.bloodTests?.[idx]?.price && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.bloodTests[idx]?.price?.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                append({ testId: "", testName: "", price: 0 })
              }
              className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Add Blood Test
            </button>
          </div>

          {/* Payment fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Discount (Rs.)
              </label>
              <input
                type="number"
                step="0.01"
                {...register("discountAmount", { valueAsNumber: true })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Flat discount in rupees"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Amount Paid (Rs.)
              </label>
              <input
                type="number"
                step="0.01"
                {...register("amountPaid", {
                  required: "Amount paid is required",
                  valueAsNumber: true,
                })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter amount paid"
              />
              {errors.amountPaid && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.amountPaid.message}
                </p>
              )}
            </div>
          </div>

          {/* Computed totals */}
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Total Amount: <strong>Rs. {totalAmount.toFixed(2)}</strong>
            </p>
            <p className="text-sm text-gray-700">
              Discount: <strong>Rs. {Number(discountAmount).toFixed(2)}</strong>
            </p>
            <p className="text-sm text-gray-700">
              Remaining Amount: <strong>{remainingAmount.toFixed(2)}</strong>
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
          {isSubmitting ? "Updating..." : "Update Patient Details"}
        </button>
      </form>
    </div>
  );
};

export default PatientDetailEdit;
