"use client";

import React from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { database } from "../../firebase";
import { ref, push, set, get, child } from "firebase/database";
import { UserCircleIcon, PhoneIcon } from "@heroicons/react/24/outline";

interface IFormInput {
  name: string;
  contact?: string;
  age: number;
  gender: string;
  address?: string;
  email?: string;
  doctorName?: string;
}

const PatientEntryPage: React.FC = () => {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset
  } = useForm<IFormInput>();

  // State to hold previously used doctor names
  const [doctorNames, setDoctorNames] = React.useState<string[]>([]);

  // Fetch unique doctor names from previous patient entries in Firebase
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

  // Watch the doctorName field to provide auto-suggestions
  const watchDoctorName = watch("doctorName", "");

  const filteredSuggestions = React.useMemo(() => {
    if (!watchDoctorName || watchDoctorName.trim().length === 0) return [];
    return doctorNames.filter(name =>
      name.toLowerCase().startsWith(watchDoctorName.toLowerCase())
    );
  }, [watchDoctorName, doctorNames]);

  const onSubmit: SubmitHandler<IFormInput> = async (data) => {
    try {
      const patientsRef = ref(database, "patients");
      const newPatientRef = push(patientsRef);
      // Add current timestamp to the data before saving
      await set(newPatientRef, { ...data, createdAt: new Date().toISOString() });
      alert("Patient information saved successfully!");
      reset();
    } catch (error) {
      console.error("Error saving patient information: ", error);
      alert("Failed to save patient information. Please try again later.");
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
            {/* Patient Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-700">Patient Information</h3>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Full Name</label>
                <div className="relative">
                  <input
                    {...register("name", { required: "Name is required" })}
                    className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="John Doe"
                  />
                  <UserCircleIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
                </div>
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Contact Number</label>
                <div className="relative">
                  <input
                    {...register("contact")}
                    className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="+1 234 567 890"
                  />
                  <PhoneIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Age</label>
                  <input
                    type="number"
                    {...register("age", {
                      required: "Age is required",
                      min: { value: 0, message: "Age must be positive" }
                    })}
                    className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  {errors.age && <p className="text-red-500 text-sm mt-1">{errors.age.message}</p>}
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
                  {errors.gender && <p className="text-red-500 text-sm mt-1">{errors.gender.message}</p>}
                </div>
              </div>
            </div>

            {/* Additional Information Section (Optional) */}
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

            {/* Doctor Referral Section */}
            <div className="space-y-4 relative">
              <h3 className="text-lg font-semibold text-gray-700">Doctor Referral</h3>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Doctor Name</label>
                <input
                  {...register("doctorName")}
                  className="px-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Type doctor's name..."
                />
              </div>
              {/* Auto-suggestion dropdown */}
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
