"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { database, auth, medfordFamilyDatabase } from "../../firebase";
import { ref, push, set, get } from "firebase/database";
import { UserCircleIcon, PhoneIcon } from "@heroicons/react/24/outline";

// -------------------------
// Interfaces
// -------------------------
interface BloodTestSelection {
  testId: string;
  testName: string;
  price: number;
  testType: string;
}

interface IFormInput {
  hospitalName: string; // new field for hospital name
  name: string;
  contact: string; // 10-digit
  age: number;
  dayType: "year" | "month" | "day"; // the age unit
  gender: string;
  address?: string;
  email?: string;
  doctorName: string;
  doctorId: string;
  bloodTests: BloodTestSelection[];
  discountPercentage: number;
  amountPaid: number;
  paymentMode: "online" | "cash";
  patientId?: string;
}

interface PackageType {
  id: string;
  packageName: string;
  tests: BloodTestSelection[];
  discountPercentage: number;
}

interface FamilyPatient {
  id: string;
  name: string;
  contact: string;
  patientId: string;
}

// -------------------------
// Main Patient Entry Page
// -------------------------
const PatientEntryPage: React.FC = () => {
  // 1) Auth State
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // 2) Form Setup
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
      hospitalName: "MEDFORD", // default hospital name
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
      discountPercentage: 0,
      amountPaid: 0,
      paymentMode: "online",
      patientId: "", // will be set if a family patient is selected
    },
  });

  // 3) Data & States
  const [doctorList, setDoctorList] = useState<
    { id: string; doctorName: string }[]
  >([]);
  const [availableBloodTests, setAvailableBloodTests] = useState<
    { id: string; testName: string; price: number; type: string }[]
  >([]);
  const [availablePackages, setAvailablePackages] = useState<PackageType[]>([]);
  const [familyPatients, setFamilyPatients] = useState<FamilyPatient[]>([]);

  // Suggestions toggle
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(true);
  const [showDoctorSuggestions, setShowDoctorSuggestions] = useState(true);

  // 4) Fetch Doctors
  useEffect(() => {
    const fetchDoctorList = async () => {
      try {
        const doctorRef = ref(database, "doctor");
        const snapshot = await get(doctorRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const doctorsArray = Object.keys(data).map((key) => ({
            id: key,
            doctorName: data[key].doctorName,
          }));
          setDoctorList(doctorsArray);
        }
      } catch (error) {
        console.error("Error fetching doctor list:", error);
      }
    };
    fetchDoctorList();
  }, []);

  // 5) Fetch Blood Tests (noting the DB property is "type")
  useEffect(() => {
    const fetchBloodTests = async () => {
      try {
        const testsRef = ref(database, "bloodTests");
        const snapshot = await get(testsRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const testsArray = Object.keys(data).map((key) => ({
            id: key,
            testName: data[key].testName,
            price: Number(data[key].price),
            type: data[key].type || "inhospital",
          }));
          // Sort the tests alphabetically by testName
          const sortedTestsArray = testsArray.sort((a, b) =>
            a.testName.localeCompare(b.testName)
          );
          setAvailableBloodTests(sortedTestsArray);
        }
      } catch (error) {
        console.error("Error fetching blood tests:", error);
      }
    };
    fetchBloodTests();
  }, []);

  // 6) Fetch Packages
  useEffect(() => {
    const fetchPackages = async () => {
      try {
        const packagesRef = ref(database, "packages");
        const snapshot = await get(packagesRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const packagesArray: PackageType[] = Object.keys(data).map((key) => ({
            id: key,
            packageName: data[key].packageName,
            tests: data[key].tests,
            discountPercentage: Number(data[key].discountPercentage),
          }));
          setAvailablePackages(packagesArray);
        }
      } catch (error) {
        console.error("Error fetching packages:", error);
      }
    };
    fetchPackages();
  }, []);

  // 7) Fetch Family Patients
  useEffect(() => {
    const fetchFamilyPatients = async () => {
      try {
        const familyPatientsRef = ref(medfordFamilyDatabase, "patients");
        const snapshot = await get(familyPatientsRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const patientsArray: FamilyPatient[] = Object.keys(data).map((key) => ({
            id: key,
            name: data[key].name,
            contact: data[key].contact,
            patientId: data[key].patientId,
          }));
          setFamilyPatients(patientsArray);
        }
      } catch (error) {
        console.error("Error fetching family patients:", error);
      }
    };
    fetchFamilyPatients();
  }, []);

  // 8) Filtered Suggestions for Doctor & Patient
  const watchDoctorName = watch("doctorName") ?? "";
  const filteredDoctorSuggestions = useMemo(() => {
    if (!watchDoctorName.trim()) return [];
    return doctorList.filter((doctor) =>
      doctor.doctorName.toLowerCase().startsWith(watchDoctorName.toLowerCase())
    );
  }, [watchDoctorName, doctorList]);

  const watchPatientName = watch("name") ?? "";
  const filteredPatientSuggestions = useMemo(() => {
    // Only show suggestions when at least 2 characters are entered
    if (watchPatientName.trim().length < 2) return [];
    const searchQuery = watchPatientName.toUpperCase();
    return familyPatients.filter((patient) =>
      patient.name.toUpperCase().includes(searchQuery)
    );
  }, [watchPatientName, familyPatients]);

  // 9) Field Array for Blood Tests
  const { fields: bloodTestFields, append, remove } = useFieldArray({
    control,
    name: "bloodTests",
  });

  // 10) Payment Calculations
  const bloodTests = watch("bloodTests");
  const discountPercentage = watch("discountPercentage");
  const amountPaid = watch("amountPaid");

  const totalAmount = bloodTests.reduce(
    (sum, test) => sum + Number(test.price || 0),
    0
  );
  const discountValue = totalAmount * (Number(discountPercentage) / 100);
  const remainingAmount = totalAmount - discountValue - Number(amountPaid);

  // 11) Generate Patient ID
  const generatePatientId = (length: number = 8): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // 12) onSubmit
  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    try {
      const userEmail = currentUser?.email || "Unknown User";
      let patientId = data.patientId;
      // If no patientId is set (i.e. no family patient selected), generate one.
      if (!patientId || patientId.trim() === "") {
        patientId = generatePatientId();
        data.patientId = patientId;
      }

      const multiplier =
        data.dayType === "year" ? 360 : data.dayType === "month" ? 30 : 1;
      const total_day = data.age * multiplier;

      // Insert new patient record into main database
      const patientsRef = ref(database, "patients");
      const newPatientRef = push(patientsRef);
      await set(newPatientRef, {
        ...data,
        patientId,
        total_day,
        enteredBy: userEmail,
        createdAt: new Date().toISOString(),
      });

      // Calculate DOB from age using the dayType
      const today = new Date();
      let dob: Date;
      if (data.dayType === "year") {
        dob = new Date(
          today.getFullYear() - data.age,
          today.getMonth(),
          today.getDate()
        );
      } else if (data.dayType === "month") {
        const years = Math.floor(data.age / 12);
        const months = data.age % 12;
        dob = new Date(
          today.getFullYear() - years,
          today.getMonth() - months,
          today.getDate()
        );
      } else {
        // For days
        dob = new Date(today.getTime() - data.age * 24 * 60 * 60 * 1000);
      }

      // Only create a new record in medfordFamilyDatabase if this patient wasn't selected from the dropdown.
      const familyExists = familyPatients.some(
        (fp) => fp.patientId === patientId
      );
      if (!familyExists) {
        await set(ref(medfordFamilyDatabase, "patients/" + patientId), {
          name: data.name,
          contact: data.contact,
          patientId: patientId,
          dob: dob.toISOString(),
          gender: data.gender,
          hospitalName: data.hospitalName,
        });
      }

      // Construct WhatsApp message
      const testNames = data.bloodTests.map((test) => test.testName).join(", ");
      const discountLine =
        data.discountPercentage > 0
          ? `Discount: ${data.discountPercentage}%\n`
          : "";
      const message = `Dear ${data.name},\n
Thank you for choosing our services. We have received your request for the following test(s): ${testNames}.\n
Total Amount: Rs. ${totalAmount.toFixed(2)}
${discountLine}Amount Paid: Rs. ${data.amountPaid.toFixed(2)}
Remaining Amount: Rs. ${remainingAmount.toFixed(2)}\n
We appreciate your trust in us. If you have any questions, please reach out to our support team.\n
Regards,
MedBliss`;

      // Example: sending to your custom WhatsApp endpoint
      const response = await fetch("https://wa.medblisss.com/send-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "99583991573", // removed trailing space
          number: `91${data.contact}`,
          message,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to send WhatsApp message");
      }

      alert("Patient information saved and WhatsApp message sent successfully!");
      reset();
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to save patient information or send WhatsApp message.");
    }
  };

  // If user not logged in
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded shadow-md max-w-md w-full">
          <p className="text-center text-gray-700">
            Please log in to access this page.
          </p>
        </div>
      </div>
    );
  }

  // 13) Render
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg">
        <div className="p-6 sm:p-8">
          <div className="flex items-center mb-6">
            <UserCircleIcon className="h-8 w-8 text-blue-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Patient Entry</h2>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Patient Info */}
            <div className="space-y-4 relative">
              <h3 className="text-lg font-semibold text-gray-700">
                Patient Information
              </h3>
              {/* Hospital Name Field */}
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
                  <option value="MEDFORD">MEDFORD</option>
                  <option value="Other">Other</option>
                </select>
                {errors.hospitalName && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.hospitalName.message}
                  </p>
                )}
              </div>
              {/* Name */}
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
                  <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                )}
                {showPatientSuggestions &&
                  filteredPatientSuggestions.length > 0 && (
                    <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto">
                      {filteredPatientSuggestions.map((patient) => (
                        <li
                          key={patient.patientId}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                          onClick={() => {
                            setValue("name", patient.name.toUpperCase());
                            setValue("contact", patient.contact);
                            setValue("patientId", patient.patientId);
                            setShowPatientSuggestions(false);
                          }}
                        >
                          {patient.name.toUpperCase()} – {patient.contact}
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
                  <p className="text-red-500 text-sm mt-1">{errors.contact.message}</p>
                )}
              </div>

              {/* Age, Age Unit, Gender */}
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
                    <p className="text-red-500 text-sm mt-1">{errors.age.message}</p>
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
                    <p className="text-red-500 text-sm mt-1">{errors.dayType.message}</p>
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
                    <p className="text-red-500 text-sm mt-1">{errors.gender.message}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Info */}
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

            {/* Package & Blood Test */}
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
                    const selectedPackage = availablePackages.find(
                      (pkg) => pkg.id === selectedPackageId
                    );
                    if (selectedPackage) {
                      setValue("bloodTests", selectedPackage.tests);
                      setValue("discountPercentage", selectedPackage.discountPercentage);
                    }
                  }}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Package Selected</option>
                  {availablePackages.map((pkg) => (
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
                    <div key={field.id} className="border p-4 rounded-lg relative">
                      {/* Remove button at top right */}
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove Test
                      </button>
                      <div className="flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Test Name
                          </label>
                          <select
                            {...register(`bloodTests.${index}.testId`, {
                              required: "Blood test is required",
                            })}
                            onChange={(e) => {
                              const selectedId = e.target.value;
                              const selectedTest = availableBloodTests.find(
                                (t) => t.id === selectedId
                              );
                              if (selectedTest) {
                                setValue(
                                  `bloodTests.${index}.testName`,
                                  selectedTest.testName
                                );
                                setValue(
                                  `bloodTests.${index}.price`,
                                  selectedTest.price
                                );
                                setValue(
                                  `bloodTests.${index}.testType`,
                                  selectedTest.type
                                );
                              } else {
                                setValue(`bloodTests.${index}.testName`, "");
                                setValue(`bloodTests.${index}.price`, 0);
                                setValue(`bloodTests.${index}.testType`, "inhospital");
                              }
                            }}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select a test</option>
                            {availableBloodTests.map((test) => (
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
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Price (Rs.)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            {...register(`bloodTests.${index}.price`, {
                              required: "Price is required",
                              valueAsNumber: true,
                            })}
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
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Test Type
                          </label>
                          <select
                            {...register(`bloodTests.${index}.testType`)}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="inhospital">In Hospital</option>
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

              {/* Payment Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Discount (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register("discountPercentage", {
                      required: "Discount is required",
                      valueAsNumber: true,
                    })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.discountPercentage && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.discountPercentage.message}
                    </p>
                  )}
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
                  />
                  {errors.amountPaid && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.amountPaid.message}
                    </p>
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
