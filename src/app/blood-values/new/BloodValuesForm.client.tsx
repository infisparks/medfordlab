"use client";

import React, { useState, useEffect } from "react";
import { useForm, SubmitHandler, Path } from "react-hook-form";
import { useSearchParams, useRouter } from "next/navigation";
import { database } from "../../../firebase";
import { ref, get, set } from "firebase/database";
import {
  FiDroplet,
  FiUser,
  FiAlertCircle,
  FiCheckCircle,
  FiLoader,
} from "react-icons/fi";

interface TestParameterValue {
  name: string;
  unit: string;
  value: number | "";
  range: string;
  subparameters?: TestParameterValue[];
}

interface TestValueEntry {
  testId: string;
  testName: string;
  parameters: TestParameterValue[];
  subheadings?: {
    title: string;
    parameterNames: string[];
  }[];
  // New: optional field if only some parameters were selected at booking.
  selectedParameters?: string[];
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

  // Helper: Parse a rangeKey (like "0-30d", "1-2m", "12-100y") into numeric lower/upper bounds in days.
  const parseRangeKey = (key: string): { lower: number; upper: number } => {
    key = key.trim();
    const suffix = key.slice(-1);
    let multiplier = 1;
    if (suffix === "d") multiplier = 1;
    else if (suffix === "m") multiplier = 30;
    else if (suffix === "y") multiplier = 365;
    const rangePart = key.slice(0, -1);
    const parts = rangePart.split("-");
    if (parts.length !== 2) return { lower: 0, upper: Infinity };
    const lower = Number(parts[0]) * multiplier;
    const upper = Number(parts[1]) * multiplier;
    return { lower, upper };
  };

  useEffect(() => {
    if (!patientId) return;
    const fetchPatientData = async () => {
      try {
        const patientRef = ref(database, `patients/${patientId}`);
        const patientSnapshot = await get(patientRef);
        if (patientSnapshot.exists()) {
          const patientData = patientSnapshot.val();
          const patientTests = patientData.bloodTests || [];
          const storedBloodTests = patientData.bloodtest || {};
          const patientAgeInDays = patientData.total_day
            ? Number(patientData.total_day)
            : Number(patientData.age) * 365;

          const testsData: TestValueEntry[] = await Promise.all(
            patientTests.map(async (test: { testId: string; testName: string; selectedParameters?: string[] }) => {
              const testRef = ref(database, `bloodTests/${test.testId}`);
              const testSnapshot = await get(testRef);
              if (testSnapshot.exists()) {
                const testDetail = testSnapshot.val();
                // New: if selectedParameters were booked, only use those parameters.
                const allParams = testDetail.parameters;
                let filteredParams;
                if (test.selectedParameters && test.selectedParameters.length > 0) {
                  filteredParams = allParams.filter((param: any) =>
                    test.selectedParameters!.includes(param.name)
                  );
                } else {
                  filteredParams = allParams;
                }
                const parameters = filteredParams.map((param: any) => {
                  const gender = patientData.gender?.toLowerCase() === "male" ? "male" : "female";
                  const ranges = param.range[gender] || [];
                  let rangeStr = "";
                  for (const r of ranges) {
                    const { lower, upper } = parseRangeKey(r.rangeKey);
                    if (patientAgeInDays >= lower && patientAgeInDays <= upper) {
                      rangeStr = r.rangeValue;
                      break;
                    }
                  }
                  if (!rangeStr && ranges.length > 0) {
                    rangeStr = ranges[ranges.length - 1].rangeValue;
                  }
                  let subparams: TestParameterValue[] | undefined = undefined;
                  if (param.subparameters && Array.isArray(param.subparameters)) {
                    subparams = param.subparameters.map((subParam: any) => {
                      const subRanges = subParam.range[gender] || [];
                      let subRangeStr = "";
                      for (const sr of subRanges) {
                        const { lower, upper } = parseRangeKey(sr.rangeKey);
                        if (patientAgeInDays >= lower && patientAgeInDays <= upper) {
                          subRangeStr = sr.rangeValue;
                          break;
                        }
                      }
                      if (!subRangeStr && subRanges.length > 0) {
                        subRangeStr = subRanges[subRanges.length - 1].rangeValue;
                      }
                      const storedSubParam =
                        storedBloodTests &&
                        storedBloodTests[test.testName.toLowerCase().replace(/\s+/g, "_")] &&
                        storedBloodTests[test.testName.toLowerCase().replace(/\s+/g, "_")].parameters.find((p: any) => p.name === param.name)
                          ?.subparameters?.find((sp: any) => sp.name === subParam.name);
                      return {
                        name: subParam.name,
                        unit: subParam.unit,
                        value: storedSubParam ? storedSubParam.value : "",
                        range: subRangeStr,
                      };
                    });
                  }
                  const storedParam =
                    storedBloodTests &&
                    storedBloodTests[test.testName.toLowerCase().replace(/\s+/g, "_")] &&
                    storedBloodTests[test.testName.toLowerCase().replace(/\s+/g, "_")].parameters.find((p: any) => p.name === param.name);
                  return {
                    name: param.name,
                    unit: param.unit,
                    value: storedParam ? storedParam.value : "",
                    range: rangeStr,
                    ...(subparams ? { subparameters: subparams } : {}),
                  };
                });
                return {
                  testId: test.testId,
                  testName: testDetail.testName,
                  parameters,
                  subheadings: testDetail.subheadings || [],
                  selectedParameters: test.selectedParameters, // pass along the booked selection
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
      for (const test of data.tests) {
        const testKey = test.testName.toLowerCase().replace(/\s+/g, "_");
        const testRef = ref(database, `patients/${data.patientId}/bloodtest/${testKey}`);
        await set(testRef, {
          parameters: test.parameters,
          subheadings: test.subheadings || [],
          createdAt: new Date().toISOString(),
        });
      }
      alert("Blood test values saved successfully!");
      router.push(`/download-report?patientId=${data.patientId}`);
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
          <p className="text-gray-600 mb-4">
            No patient ID provided. Please return to the dashboard.
          </p>
          <button
            onClick={() => router.push("/")}
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
            <div
              key={test.testId}
              className="border-l-4 border-blue-600 bg-gray-50 p-6 rounded-lg"
            >
              <div className="flex items-center gap-3 mb-6">
                <FiDroplet className="w-6 h-6 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-800">{test.testName}</h3>
              </div>

              {/* Render parameters based on subheadings or global list */}
              {test.subheadings && test.subheadings.length > 0 ? (
                <>
                  {test.subheadings.map((subheading, subIndex) => {
                    const paramsForSub = test.parameters
                      .map((param, pIndex) => ({ ...param, originalIndex: pIndex }))
                      .filter((item) => subheading.parameterNames.includes(item.name));
                    return (
                      <div key={subIndex} className="mb-6">
                        <h4 className="text-lg font-bold mb-2">{subheading.title}</h4>
                        {paramsForSub.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {paramsForSub.map((item) => (
                              <div key={item.originalIndex} className="space-y-4">
                                <label className="block text-sm font-medium text-gray-700">
                                  {item.name}{" "}
                                  <span className="ml-2 text-sm text-gray-500">
                                    ({item.unit})
                                  </span>
                                </label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    step="any"
                                    {...register(
                                      `tests.${testIndex}.parameters.${item.originalIndex}.value` as Path<BloodValuesFormInputs>,
                                      { required: "Value is required" }
                                    )}
                                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                                      errors.tests?.[testIndex]?.parameters?.[item.originalIndex]
                                        ?.value
                                        ? "border-red-500 focus:ring-red-200"
                                        : "border-gray-300 focus:ring-blue-200"
                                    }`}
                                    placeholder="Enter value"
                                  />
                                  {errors.tests?.[testIndex]?.parameters?.[item.originalIndex]
                                    ?.value && (
                                    <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-500">Normal Range:</span>
                                  <span className="font-medium text-green-600">
                                    {item.range}
                                  </span>
                                </div>
                                {item.subparameters &&
                                  item.subparameters.length > 0 && (
                                    <div className="ml-4 border-l pl-4 space-y-4">
                                      {item.subparameters.map((subParam, subParamIndex) => (
                                        <div key={subParamIndex} className="space-y-2">
                                          <label className="block text-sm font-medium text-gray-700">
                                            {subParam.name}{" "}
                                            <span className="ml-2 text-sm text-gray-500">
                                              ({subParam.unit})
                                            </span>
                                          </label>
                                          <div className="relative">
                                            <input
                                              type="number"
                                              step="any"
                                              {...register(
                                                `tests.${testIndex}.parameters.${item.originalIndex}.subparameters.${subParamIndex}.value` as Path<BloodValuesFormInputs>,
                                                { required: "Value is required" }
                                              )}
                                              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                                                errors.tests?.[testIndex]?.parameters?.[item.originalIndex]
                                                  ?.subparameters?.[subParamIndex]?.value
                                                  ? "border-red-500 focus:ring-red-200"
                                                  : "border-gray-300 focus:ring-blue-200"
                                              }`}
                                              placeholder="Enter value"
                                            />
                                            {errors.tests?.[testIndex]?.parameters?.[item.originalIndex]
                                              ?.subparameters?.[subParamIndex]?.value && (
                                              <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-500">
                                              Normal Range:
                                            </span>
                                            <span className="font-medium text-green-600">
                                              {subParam.range}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-yellow-50 p-4 rounded-lg flex items-center gap-3 text-yellow-700">
                            <FiAlertCircle className="w-5 h-5" />
                            <span>No parameters available for this subheading</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(() => {
                    const subheadingParamNames = test.subheadings.reduce(
                      (acc: string[], sub) => acc.concat(sub.parameterNames),
                      []
                    );
                    const globalParams = test.parameters
                      .map((param, paramIndex) => ({ ...param, originalIndex: paramIndex }))
                      .filter((item) => !subheadingParamNames.includes(item.name));
                    if (globalParams.length > 0) {
                      return (
                        <div className="mb-6">
                          <h4 className="text-lg font-bold mb-2">Global Parameters</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {globalParams.map((item) => (
                              <div key={item.originalIndex} className="space-y-4">
                                <label className="block text-sm font-medium text-gray-700">
                                  {item.name}{" "}
                                  <span className="ml-2 text-sm text-gray-500">
                                    ({item.unit})
                                  </span>
                                </label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    step="any"
                                    {...register(
                                      `tests.${testIndex}.parameters.${item.originalIndex}.value` as Path<BloodValuesFormInputs>,
                                      { required: "Value is required" }
                                    )}
                                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                                      errors.tests?.[testIndex]?.parameters?.[item.originalIndex]
                                        ?.value
                                        ? "border-red-500 focus:ring-red-200"
                                        : "border-gray-300 focus:ring-blue-200"
                                    }`}
                                    placeholder="Enter value"
                                  />
                                  {errors.tests?.[testIndex]?.parameters?.[item.originalIndex]
                                    ?.value && (
                                    <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-500">Normal Range:</span>
                                  <span className="font-medium text-green-600">{item.range}</span>
                                </div>
                                {item.subparameters &&
                                  item.subparameters.length > 0 && (
                                    <div className="ml-4 border-l pl-4 space-y-4">
                                      {item.subparameters.map((subParam, subIndex) => (
                                        <div key={subIndex} className="space-y-2">
                                          <label className="block text-sm font-medium text-gray-700">
                                            {subParam.name}{" "}
                                            <span className="ml-2 text-sm text-gray-500">
                                              ({subParam.unit})
                                            </span>
                                          </label>
                                          <div className="relative">
                                            <input
                                              type="number"
                                              step="any"
                                              {...register(
                                                `tests.${testIndex}.parameters.${item.originalIndex}.subparameters.${subIndex}.value` as Path<BloodValuesFormInputs>,
                                                { required: "Value is required" }
                                              )}
                                              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                                                errors.tests?.[testIndex]?.parameters?.[item.originalIndex]
                                                  ?.subparameters?.[subIndex]?.value
                                                  ? "border-red-500 focus:ring-red-200"
                                                  : "border-gray-300 focus:ring-blue-200"
                                              }`}
                                              placeholder="Enter value"
                                            />
                                            {errors.tests?.[testIndex]?.parameters?.[item.originalIndex]
                                              ?.subparameters?.[subIndex]?.value && (
                                              <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-500">
                                              Normal Range:
                                            </span>
                                            <span className="font-medium text-green-600">
                                              {subParam.range}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </>
              ) : (
                // No subheadings: render all parameters normally.
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {test.parameters.map((param, paramIndex) => (
                    <div key={paramIndex} className="space-y-4">
                      <label className="block text-sm font-medium text-gray-700">
                        {param.name}{" "}
                        <span className="ml-2 text-sm text-gray-500">
                          ({param.unit})
                        </span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          {...register(
                            `tests.${testIndex}.parameters.${paramIndex}.value` as Path<BloodValuesFormInputs>,
                            { required: "Value is required" }
                          )}
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                            errors.tests?.[testIndex]?.parameters?.[paramIndex]?.value
                              ? "border-red-500 focus:ring-red-200"
                              : "border-gray-300 focus:ring-blue-200"
                          }`}
                          placeholder="Enter value"
                        />
                        {errors.tests?.[testIndex]?.parameters?.[paramIndex]?.value && (
                          <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">Normal Range:</span>
                        <span className="font-medium text-green-600">{param.range}</span>
                      </div>
                      {param.subparameters && param.subparameters.length > 0 && (
                        <div className="ml-4 border-l pl-4 space-y-4">
                          {param.subparameters.map((subParam, subIndex) => (
                            <div key={subIndex} className="space-y-2">
                              <label className="block text-sm font-medium text-gray-700">
                                {subParam.name}{" "}
                                <span className="ml-2 text-sm text-gray-500">
                                  ({subParam.unit})
                                </span>
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="any"
                                  {...register(
                                    `tests.${testIndex}.parameters.${paramIndex}.subparameters.${subIndex}.value` as Path<BloodValuesFormInputs>,
                                    { required: "Value is required" }
                                  )}
                                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                                    errors.tests?.[testIndex]?.parameters?.[paramIndex]?.subparameters?.[subIndex]?.value
                                      ? "border-red-500 focus:ring-red-200"
                                      : "border-gray-300 focus:ring-blue-200"
                                  }`}
                                  placeholder="Enter value"
                                />
                                {errors.tests?.[testIndex]?.parameters?.[paramIndex]?.subparameters?.[subIndex]?.value && (
                                  <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-500">
                                  Normal Range:
                                </span>
                                <span className="font-medium text-green-600">{subParam.range}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
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
                  Save Blood Test Report
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
