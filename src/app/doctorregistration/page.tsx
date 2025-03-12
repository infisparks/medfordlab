"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { database } from "../../firebase"; // Adjust the path as needed
import { ref, push, set } from "firebase/database";
import { FaSave } from "react-icons/fa";

interface DoctorRegistrationInputs {
  doctorName: string;
  number: string;
  commissionPercentage: number;
  address?: string;
}

const DoctorRegistrationForm: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<DoctorRegistrationInputs>();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (data: DoctorRegistrationInputs) => {
    setIsSubmitting(true);
    try {
      const doctorRef = ref(database, "doctor");
      const newDoctorRef = push(doctorRef);
      await set(newDoctorRef, {
        ...data,
        createdAt: new Date().toISOString(),
      });
      alert("Doctor registered successfully!");
      reset();
    } catch (error) {
      console.error("Error registering doctor:", error);
      alert("Error registering doctor. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white shadow rounded">
      <h2 className="text-2xl font-bold mb-4">Doctor Registration</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Doctor Name */}
        <div>
          <label className="block text-sm font-medium">Doctor Name</label>
          <input
            type="text"
            {...register("doctorName", { required: "Doctor name is required" })}
            className="w-full border rounded px-3 py-2"
            placeholder="Enter doctor name"
          />
          {errors.doctorName && (
            <p className="text-red-500 text-xs mt-1">{errors.doctorName.message}</p>
          )}
        </div>

        {/* Phone Number */}
        <div>
          <label className="block text-sm font-medium">Phone Number</label>
          <input
            type="text"
            {...register("number", { required: "Phone number is required" })}
            className="w-full border rounded px-3 py-2"
            placeholder="Enter phone number"
          />
          {errors.number && (
            <p className="text-red-500 text-xs mt-1">{errors.number.message}</p>
          )}
        </div>

        {/* Commission Percentage */}
        <div>
          <label className="block text-sm font-medium">
            Commission Percentage
          </label>
          <input
            type="number"
            step="0.01"
            {...register("commissionPercentage", {
              required: "Commission percentage is required",
              valueAsNumber: true,
            })}
            className="w-full border rounded px-3 py-2"
            placeholder="Enter commission percentage"
          />
          {errors.commissionPercentage && (
            <p className="text-red-500 text-xs mt-1">
              {errors.commissionPercentage.message}
            </p>
          )}
        </div>

        {/* Address (Optional) */}
        <div>
          <label className="block text-sm font-medium">
            Address (optional)
          </label>
          <textarea
            {...register("address")}
            className="w-full border rounded px-3 py-2"
            placeholder="Enter address"
            rows={3}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          {isSubmitting ? "Registering..." : <><FaSave /> Register Doctor</>}
        </button>
      </form>
    </div>
  );
};

export default DoctorRegistrationForm;
