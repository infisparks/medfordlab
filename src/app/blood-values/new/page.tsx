"use client";

import React, { useState, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { useSearchParams, useRouter } from "next/navigation";
import { database } from "../../../firebase";
import { ref, get, push, set } from "firebase/database";
import { FiDroplet, FiUser, FiAlertCircle, FiCheckCircle, FiLoader } from "react-icons/fi";

interface TestParameterValue {
  name: string;
  unit: string;
  value: number | "";
  normalRangeStart: number;
  normalRangeEnd: number;
}

interface TestValueEntry {
  testId: string;
  testName: string;
  parameters: TestParameterValue[];
}

interface BloodValuesFormInputs {
  patientId: string;
  tests: TestValueEntry[];
}

const BloodValuesForm: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const patientId = searchParams.get("patientId");
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BloodValuesFormInputs>({
    defaultValues: {
      patientId: patientId || "",
      tests: [],
    },
  });

  useEffect(() => {
    if (!patientId) return;
    const fetchPatientData = async () => {
      try {
        const patientRef = ref(database, `patients/${patientId}`);
        const patientSnapshot = await get(patientRef);
        if (patientSnapshot.exists()) {
          const patientData = patientSnapshot.val();
          const patientTests = patientData.bloodTests || [];
          const testsData: TestValueEntry[] = await Promise.all(
            patientTests.map(async (test: { testId: string; testName: string }) => {
              const testRef = ref(database, `bloodTests/${test.testId}`);
              const testSnapshot = await get(testRef);
              if (testSnapshot.exists()) {
                const testDetail = testSnapshot.val();
                const parameters: TestParameterValue[] = testDetail.parameters.map(
                  (param: any) => ({
                    name: param.name,
                    unit: param.unit,
                    value: "",
                    normalRangeStart: param.normalRangeStart,
                    normalRangeEnd: param.normalRangeEnd,
                  })
                );
                return {
                  testId: test.testId,
                  testName: testDetail.testName,
                  parameters,
                };
              }
              return {
                testId: test.testId,
                testName: test.testName,
                parameters: [],
              };
            })
          );
          reset({
            patientId,
            tests: testsData,
          });
        }
      } catch (error) {
        console.error("Error fetching patient blood tests:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPatientData();
  }, [patientId, reset]);

  const onSubmit: SubmitHandler<BloodValuesFormInputs> = async (data) => {
    try {
      const bloodValuesRef = ref(database, "bloodTestValues");
      const newEntryRef = push(bloodValuesRef);
      await set(newEntryRef, {
        ...data,
        createdAt: new Date().toISOString(),
      });
      alert("Blood test values saved successfully!");
      router.push("/dashboard");
    } catch (error) {
      console.error("Error saving blood test values:", error);
      alert("Failed to save blood test values. Please try again.");
    }
  };

  if (!patientId) {
    return (
      <div className="p-4 flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md p-8 bg-white rounded-xl shadow-lg">
          <FiUser className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Patient Not Found</h2>
          <p className="text-gray-600 mb-4">No patient ID provided. Please return to the dashboard.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <FiLoader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-700">Loading blood test details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-3xl w-full bg-white p-8 rounded-xl shadow-lg space-y-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-blue-100 rounded-full">
            <FiDroplet className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Blood Test Analysis</h1>
            <p className="text-gray-600">Patient ID: {patientId}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {watch("tests").map((test, testIndex) => (
            <div key={test.testId} className="border-l-4 border-blue-600 bg-gray-50 p-6 rounded-lg">
              <div className="flex items-center gap-3 mb-6">
                <FiDroplet className="w-6 h-6 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-800">{test.testName}</h3>
              </div>
              
              {test.parameters.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {test.parameters.map((param, paramIndex) => {
                    const error = errors.tests?.[testIndex]?.parameters?.[paramIndex]?.value;
                    return (
                      <div key={paramIndex} className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          {param.name}
                          <span className="ml-2 text-sm text-gray-500">({param.unit})</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            {...register(`tests.${testIndex}.parameters.${paramIndex}.value`, {
                              required: "Value is required",
                            })}
                            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                              error ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:ring-blue-200"
                            }`}
                            placeholder="Enter value"
                          />
                          {error && (
                            <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-500">Normal Range:</span>
                          <span className="font-medium text-green-600">
                            {param.normalRangeStart} - {param.normalRangeEnd}
                          </span>
                        </div>
                        {error && (
                          <p className="text-red-500 text-sm flex items-center gap-2">
                            <FiAlertCircle className="w-4 h-4" />
                            {error.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-yellow-50 p-4 rounded-lg flex items-center gap-3 text-yellow-700">
                  <FiAlertCircle className="w-5 h-5" />
                  <span>No parameters available for this test</span>
                </div>
              )}
            </div>
          ))}

          <div className="border-t pt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <FiLoader className="animate-spin w-5 h-5" />
                  Saving...
                </>
              ) : (
                <>
                  <FiCheckCircle className="w-5 h-5" />
                  Save Blood Test Values
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BloodValuesForm;