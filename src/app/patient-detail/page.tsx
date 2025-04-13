"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import { database, medfordFamilyDatabase } from "../../firebase";
import { ref, get, update } from "firebase/database";
import { UserCircleIcon, PhoneIcon } from "@heroicons/react/24/outline";

interface BloodTestSelection {
  testId: string;
  testName: string;
  price: number;
}

interface IFormInput {
  name: string;
  contact: string; // 10-digit
  age: number;
  dayType: "year" | "month" | "day";
  gender: string;
  address?: string;
  email?: string;
  doctorName: string;
  doctorId: string;
  bloodTests: BloodTestSelection[];
  discountPercentage: number;
  amountPaid: number;
  paymentMode: "online" | "cash";
  patientId: string;
}

interface PackageType {
  id: string;
  packageName: string;
  tests: BloodTestSelection[];
  discountPercentage: number;
}

const PatientDetailEdit: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdQuery = searchParams.get("patientId");

  // Initialize the form with default values.
  const {
    register,
    handleSubmit,
    watch,
    setValue,
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
      discountPercentage: 0,
      amountPaid: 0,
      paymentMode: "online",
      patientId: patientIdQuery || "",
    },
  });

  // Supporting data states.
  const [doctorList, setDoctorList] = useState<{ id: string; doctorName: string }[]>([]);
  const [availableBloodTests, setAvailableBloodTests] = useState<
    { id: string; testName: string; price: number }[]
  >([]);
  const [availablePackages, setAvailablePackages] = useState<PackageType[]>([]);
  const [showDoctorSuggestions, setShowDoctorSuggestions] = useState(true);

  // Fetch doctor list.
  useEffect(() => {
    const fetchDoctorList = async () => {
      try {
        const doctorRef = ref(database, "doctor");
        const snapshot = await get(doctorRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const doctors = Object.keys(data).map(key => ({
            id: key,
            doctorName: data[key].doctorName,
          }));
          setDoctorList(doctors);
        }
      } catch (error) {
        console.error("Error fetching doctor list:", error);
      }
    };
    fetchDoctorList();
  }, []);

  // Fetch available blood tests.
  useEffect(() => {
    const fetchBloodTests = async () => {
      try {
        const testsRef = ref(database, "bloodTests");
        const snapshot = await get(testsRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const tests = Object.keys(data).map(key => ({
            id: key,
            testName: data[key].testName,
            price: Number(data[key].price),
          }));
          setAvailableBloodTests(tests);
        }
      } catch (error) {
        console.error("Error fetching blood tests:", error);
      }
    };
    fetchBloodTests();
  }, []);

  // Fetch available packages.
  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const packagesRef = ref(database, "packages");
        const snapshot = await get(packagesRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const packages = Object.keys(data).map(key => ({
            id: key,
            packageName: data[key].packageName,
            tests: data[key].tests,
            discountPercentage: Number(data[key].discountPercentage),
          }));
          setAvailablePackages(packages);
        }
      } catch (error) {
        console.error("Error fetching packages:", error);
      }
    };
    fetchPackages();
  }, []);

  // Fetch existing patient data and prefill the form.
  useEffect(() => {
    if (!patientIdQuery) {
      alert("No patient ID provided.");
      router.push("/");
      return;
    }
    const fetchPatient = async () => {
      try {
        const patientRef = ref(database, `patients/${patientIdQuery}`);
        const snapshot = await get(patientRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          // If the record does not include patientId, set it manually.
          if (!data.patientId) data.patientId = patientIdQuery;
          reset(data);
        } else {
          alert("Patient not found.");
          router.push("/");
        }
      } catch (error) {
        console.error("Error fetching patient:", error);
        alert("Error fetching patient details.");
      }
    };
    fetchPatient();
  }, [patientIdQuery, reset, router]);

  // Doctor referral autosuggest.
  const watchDoctorName = watch("doctorName") || "";
  const filteredDoctorSuggestions = useMemo(() => {
    if (!watchDoctorName.trim()) return [];
    return doctorList.filter(doctor =>
      doctor.doctorName.toLowerCase().startsWith(watchDoctorName.toLowerCase())
    );
  }, [watchDoctorName, doctorList]);

  // Setup field array for blood tests.
  const { fields: bloodTestFields, append, remove } = useFieldArray({
    control,
    name: "bloodTests",
  });

  // Payment calculations.
  const bloodTests = watch("bloodTests");
  const discountPercentage = watch("discountPercentage");
  const amountPaid = watch("amountPaid");
  const totalAmount = bloodTests.reduce((sum, test) => sum + Number(test.price || 0), 0);
  const discountValue = totalAmount * (Number(discountPercentage) / 100);
  const remainingAmount = totalAmount - discountValue - Number(amountPaid);

  // onSubmit: update patient details.
  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    try {
      // Use the query param patientId (idToUpdate) for updating.
      const idToUpdate = patientIdQuery as string;
      const patientRef = ref(database, `patients/${idToUpdate}`);
      await update(patientRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
      // Also update minimal details in the MedfordFamily database.
      await update(ref(medfordFamilyDatabase, `patients/${idToUpdate}`), {
        name: data.name,
        contact: data.contact,
        patientId: idToUpdate,
      });
      alert("Patient details updated successfully!");
      router.push("/");
    } catch (error) {
      console.error("Error updating patient details:", error);
      alert("Failed to update patient details.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Edit Patient Details</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Patient Information */}
        <div className="space-y-4 relative">
          <h3 className="text-lg font-semibold text-gray-700">Patient Information</h3>
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Full Name</label>
            <div className="relative">
              <input
                {...register("name", { required: "Name is required" })}
                className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter full name"
              />
              <UserCircleIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
            </div>
            {errors.name && (
              <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
            )}
          </div>
          {/* Contact Number */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Contact Number</label>
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
              <p className="text-red-500 text-sm mt-1">{errors.contact.message}</p>
            )}
          </div>
          {/* Age, Age Unit & Gender */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Age</label>
              <input
                type="number"
                {...register("age", {
                  required: "Age is required",
                  min: { value: 1, message: "Age must be positive" },
                })}
                className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {errors.age && (
                <p className="text-red-500 text-sm mt-1">{errors.age.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Age Unit</label>
              <select
                {...register("dayType", { required: "Select age unit" })}
                className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="year">Year</option>
                <option value="month">Month</option>
                <option value="day">Day</option>
              </select>
              {errors.dayType && (
                <p className="text-red-500 text-sm mt-1">{errors.dayType.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Gender</label>
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
                <p className="text-red-500 text-sm mt-1">{errors.gender.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-700">Additional Information (Optional)</h3>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Address</label>
            <input
              {...register("address")}
              className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="123 Main St, City, Country"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
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
          <h3 className="text-lg font-semibold text-gray-700">Doctor Referral</h3>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Doctor Name</label>
            <input
              {...register("doctorName", { onChange: () => setShowDoctorSuggestions(true) })}
              className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Type doctor's name..."
            />
          </div>
          {showDoctorSuggestions && filteredDoctorSuggestions.length > 0 && (
            <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto">
              {filteredDoctorSuggestions.map((doctor, index) => (
                <li
                  key={index}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                  onClick={() => {
                    setValue("doctorName", doctor.doctorName);
                    setValue("doctorId", doctor.id);
                    setShowDoctorSuggestions(false);
                  }}
                >
                  {doctor.doctorName}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Package, Blood Test & Payment Details */}
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-700">
            Package / Blood Test Selection & Payment Details
          </h3>

          {/* Package Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Select Package (Optional)
            </label>
            <select
              onChange={(e) => {
                const selectedPackageId = e.target.value;
                if (!selectedPackageId) return;
                const selectedPackage = availablePackages.find(pkg => pkg.id === selectedPackageId);
                if (selectedPackage) {
                  setValue("bloodTests", selectedPackage.tests);
                  setValue("discountPercentage", selectedPackage.discountPercentage);
                }
              }}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No Package Selected</option>
              {availablePackages.map(pkg => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.packageName}
                </option>
              ))}
            </select>
          </div>

          {/* Blood Test Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Select Blood Tests
            </label>
            <div className="space-y-4">
              {bloodTestFields.map((field, index) => (
                <div
                  key={field.id}
                  className="relative border p-4 rounded-lg flex flex-col sm:flex-row sm:space-x-4 items-start sm:items-end"
                >
                  {/* Remove button positioned at the top-right */}
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Test Name
                    </label>
                    <select
                      {...register(`bloodTests.${index}.testId` as const, { required: "Blood test is required" })}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const selectedTest = availableBloodTests.find(t => t.id === selectedId);
                        if (selectedTest) {
                          setValue(`bloodTests.${index}.testName`, selectedTest.testName);
                          setValue(`bloodTests.${index}.price`, selectedTest.price);
                        } else {
                          setValue(`bloodTests.${index}.testName`, "");
                          setValue(`bloodTests.${index}.price`, 0);
                        }
                      }}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a test</option>
                      {availableBloodTests.map(test => (
                        <option key={test.id} value={test.id}>
                          {test.testName}
                        </option>
                      ))}
                    </select>
                    {errors.bloodTests?.[index]?.testId && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.bloodTests[index]?.testId?.message}
                      </p>
                    )}
                  </div>
                  <div className="flex-1 mt-4 sm:mt-0">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Price (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register(`bloodTests.${index}.price` as const, { required: "Price is required", valueAsNumber: true })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Auto-filled"
                      readOnly
                    />
                    {errors.bloodTests?.[index]?.price && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.bloodTests[index]?.price?.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => append({ testId: "", testName: "", price: 0 })}
              className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Add Blood Test
            </button>
          </div>

          {/* Payment Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Discount (%)</label>
              <input
                type="number"
                step="0.01"
                {...register("discountPercentage", { required: "Discount is required", valueAsNumber: true })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter discount percentage"
              />
              {errors.discountPercentage && (
                <p className="text-red-500 text-sm mt-1">{errors.discountPercentage.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Amount Paid (Rs.)</label>
              <input
                type="number"
                step="0.01"
                {...register("amountPaid", { required: "Amount paid is required", valueAsNumber: true })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter amount paid"
              />
              {errors.amountPaid && (
                <p className="text-red-500 text-sm mt-1">{errors.amountPaid.message}</p>
              )}
            </div>
          </div>

          {/* Computed Totals */}
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              Total Amount: <strong>Rs. {totalAmount.toFixed(2)}</strong>
            </p>
            <p className="text-sm text-gray-700">
              Discount: <strong>Rs. {discountValue.toFixed(2)}</strong>
            </p>
            <p className="text-sm text-gray-700">
              Remaining Amount: <strong>Rs. {remainingAmount.toFixed(2)}</strong>
            </p>
          </div>

          {/* Payment Mode */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-600 mb-1">Payment Mode</label>
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

        {/* Submit Button */}
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
