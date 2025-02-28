"use client";

import React from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { useRouter } from "next/navigation";
import { database } from "../../../firebase";
import { ref, push, set } from "firebase/database";
import {
  BeakerIcon,
  DocumentTextIcon,
  UserCircleIcon,
  CalendarIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface ReportFormInput {
  patientId: string;
  testType: string;
  testDate: string;
  results: string;
  observations: string;
  conclusion: string;
  pathologist: string;
}

export default function ReportForm() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<ReportFormInput>();

  const onSubmit: SubmitHandler<ReportFormInput> = async (data) => {
    try {
      const reportsRef = ref(database, "reports");
      const newReportRef = push(reportsRef);
      await set(newReportRef, {
        ...data,
        createdAt: new Date().toISOString(),
        status: "completed",
      });
      router.push("/dashboard");
    } catch (error) {
      console.error("Error saving report: ", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg">
        <div className="p-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold flex items-center">
                <BeakerIcon className="h-8 w-8 text-blue-600 mr-3" />
                Pathology Report
              </h2>
              <p className="text-gray-500 mt-2">Fill in the test results and observations</p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Test Type</label>
                <input
                  {...register("testType", { required: "Test type is required" })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Test Date</label>
                <div className="relative">
                  <input
                    type="date"
                    {...register("testDate", { required: "Test date is required" })}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <CalendarIcon className="h-5 w-5 absolute left-3 top-3 text-gray-400" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Test Results</label>
              <textarea
                {...register("results", { required: "Results are required" })}
                rows={4}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter detailed test results..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Observations</label>
                <textarea
                  {...register("observations")}
                  rows={3}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Clinical observations during testing..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Conclusion</label>
                <textarea
                  {...register("conclusion", { required: "Conclusion is required" })}
                  rows={3}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Final diagnosis and recommendations..."
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="px-6 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save Report
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}