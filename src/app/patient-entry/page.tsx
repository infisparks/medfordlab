"use client";

import React from "react";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { database } from "../../firebase";
import { ref, push, set, get, child } from "firebase/database";
import { UserCircleIcon, PhoneIcon } from "@heroicons/react/24/outline";

interface BloodTestSelection {
  testId: string;
  testName: string;
  price: number;
}

interface IFormInput {
  name: string;
  contact: string; // Mandatory, 10-digit
  age: number;
  gender: string;
  address?: string;
  email?: string;
  doctorName?: string;
  bloodTests: BloodTestSelection[];
  discountPercentage: number;
  amountPaid: number;
  paymentMode: "online" | "offline";
}

const PatientEntryPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<IFormInput>({
    defaultValues: {
      name: "",
      contact: "",
      age: 0,
      gender: "",
      address: "",
      email: "",
      doctorName: "",
      bloodTests: [{ testId: "", testName: "", price: 0 }],
      discountPercentage: 0,
      amountPaid: 0,
      paymentMode: "online",
    },
  });

  // State to hold previously used doctor names
  const [doctorNames, setDoctorNames] = React.useState<string[]>([]);
  // State to hold available blood tests
  const [availableBloodTests, setAvailableBloodTests] = React.useState<
    { id: string; testName: string; price: number }[]
  >([]);

  // Fetch unique doctor names from previous entries
  React.useEffect(() => {
    const fetchDoctorNames = async () => {
      try {
        const dbRef = ref(database);
        const snapshot = await get(child(dbRef, "patients"));
        if (snapshot.exists()) {
          const data = snapshot.val();
          const namesSet = new Set<string>();
          Object.values(data).forEach((patient: any) => {
            if (patient.doctorName && patient.doctorName.trim() !== "") {
              namesSet.add(patient.doctorName);
            }
          });
          setDoctorNames(Array.from(namesSet));
        }
      } catch (error) {
        console.error("Error fetching doctor names: ", error);
      }
    };

    fetchDoctorNames();
  }, []);

  // Fetch available blood tests from the "bloodTests" node
  React.useEffect(() => {
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
          }));
          setAvailableBloodTests(testsArray);
        }
      } catch (error) {
        console.error("Error fetching blood tests: ", error);
      }
    };

    fetchBloodTests();
  }, []);

  // Watch the doctorName field for auto-suggestions
  const watchDoctorName = watch("doctorName", "");
  const filteredSuggestions = React.useMemo(() => {
    if (!watchDoctorName || watchDoctorName.trim().length === 0) return [];
    return doctorNames.filter((name) =>
      name.toLowerCase().startsWith(watchDoctorName.toLowerCase())
    );
  }, [watchDoctorName, doctorNames]);

  // Field array for dynamic blood test selection
  const {
    fields: bloodTestFields,
    append: appendBloodTest,
    remove: removeBloodTest,
  } = useFieldArray({
    control,
    name: "bloodTests",
  });

  // Compute totals
  const bloodTests = watch("bloodTests");
  const discountPercentage = watch("discountPercentage", 0);
  const amountPaid = watch("amountPaid", 0);

  const totalAmount = bloodTests.reduce(
    (acc, test) => acc + (Number(test.price) || 0),
    0
  );
  const discountValue = totalAmount * (Number(discountPercentage) / 100);
  const remainingAmount = totalAmount - discountValue - Number(amountPaid);

  // Handle form submission
  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    try {
      // 1. Save to Firebase
      const patientsRef = ref(database, "patients");
      const newPatientRef = push(patientsRef);
      await set(newPatientRef, { ...data, createdAt: new Date().toISOString() });

      // 2. Construct the WhatsApp message
      const testNames = data.bloodTests.map((test) => test.testName).join(", ");
      // Only show discount line if discount > 0
      const discountLine =
        data.discountPercentage > 0
          ? `Discount: ${data.discountPercentage}%\n`
          : "";

      const message = `Dear ${data.name},\n
Thank you for choosing our services. We have received your request for the following test(s): ${testNames}.\n
Total Amount: Rs. ${totalAmount.toFixed(2)}
${discountLine}Amount Paid: Rs. ${data.amountPaid.toFixed(2)}
Remaining Amount: Rs. ${remainingAmount.toFixed(
        2
      )}\n
We appreciate your trust in us. If you have any questions, please reach out to our support team.\n
Regards,
MedBliss`;

      // 3. Send WhatsApp message via API
      await fetch("https://wa.medblisss.com/send-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: "9958399157", // Fixed token
          number: `91${data.contact}`, // Prefix '91'
          message,
        }),
      });

      alert("Patient information saved and WhatsApp message sent successfully!");
      reset();
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to save patient information or send WhatsApp message.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg">
        <div className="p-8">
          <div className="flex items-center mb-8">
            <UserCircleIcon className="h-8 w-8 text-blue-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Patient Entry</h2>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Patient Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">Patient Information</h3>
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <input
                    {...register("name", { required: "Name is required" })}
                    className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="John Doe"
                  />
                  <UserCircleIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
                </div>
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                )}
              </div>

              {/* Contact Number */}
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

              {/* Age & Gender */}
              <div className="grid grid-cols-2 gap-4">
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

            {/* Additional Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">
                Additional Information (Optional)
              </h3>
              {/* Address */}
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

              {/* Email */}
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
              <h3 className="text-lg font-semibold text-gray-700">Doctor Referral</h3>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Doctor Name
                </label>
                <input
                  {...register("doctorName")}
                  className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Type doctor's name..."
                />
              </div>
              {/* Suggestions */}
              {filteredSuggestions.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border border-gray-300 mt-1 rounded-md max-h-40 overflow-y-auto">
                  {filteredSuggestions.map((suggestion, index) => (
                    <li
                      key={index}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => setValue("doctorName", suggestion)}
                    >
                      {suggestion}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Blood Test & Payment Details */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-700">
                Blood Test Selection & Payment Details
              </h3>

              {/* Blood Test Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Select Blood Tests
                </label>
                <div className="space-y-4">
                  {bloodTestFields.map((field, index) => (
                    <div
                      key={field.id}
                      className="flex flex-col sm:flex-row sm:space-x-4 items-start sm:items-end border p-4 rounded-lg"
                    >
                      {/* Test Name */}
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Test Name
                        </label>
                        <select
                          {...register(`bloodTests.${index}.testId` as const, {
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
                            } else {
                              // Reset if no test is selected
                              setValue(`bloodTests.${index}.testName`, "");
                              setValue(`bloodTests.${index}.price`, 0);
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

                      {/* Price */}
                      <div className="flex-1 mt-4 sm:mt-0">
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          Price (Rs.)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          {...register(`bloodTests.${index}.price` as const, {
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

                      {/* Remove Button */}
                      <div>
                        <button
                          type="button"
                          onClick={() => removeBloodTest(index)}
                          className="text-red-500 hover:text-red-700 text-sm mt-4 sm:mt-0"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    appendBloodTest({ testId: "", testName: "", price: 0 })
                  }
                  className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  Add Blood Test
                </button>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    placeholder="Enter discount percentage"
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
                    placeholder="Enter amount paid"
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
                  Remaining Amount:{" "}
                  <strong>Rs. {remainingAmount.toFixed(2)}</strong>
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
                      value="offline"
                      {...register("paymentMode", { required: true })}
                      className="form-radio text-blue-600"
                    />
                    <span className="ml-2">Offline</span>
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
              {isSubmitting ? "Submitting..." : "Save Patient Record"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PatientEntryPage;
