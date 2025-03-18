"use client";

import React, { useState, useEffect } from "react";
import {
  useForm,
  SubmitHandler,
  Path,
 
} from "react-hook-form";
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
import { FaCalculator } from "react-icons/fa";

// -------------------------
// Interfaces
// -------------------------

// AgeRangeItem remains unchanged

// TestParameterValue now includes a "valueType" property and supports string or number values.
interface TestParameterValue {
  name: string;
  unit: string;
  value: string | number;
  range: string;
  subparameters?: TestParameterValue[];
  formula?: string; // Optional formula for auto-calculation
  valueType: "number" | "text";
}

interface TestValueEntry {
  testId: string;
  testName: string;
  parameters: TestParameterValue[];
  subheadings?: {
    title: string;
    parameterNames: string[];
  }[];
  selectedParameters?: string[]; // If booking included only certain parameters
}

interface BloodValuesFormInputs {
  patientId: string;
  tests: TestValueEntry[];
}

// -------------------------
// Helper: parseRangeKey
// -------------------------

const parseRangeKey = (key: string): { lower: number; upper: number } => {
  key = key.trim();
  const suffix = key.slice(-1);
  let multiplier = 1;
  if (suffix === "d") multiplier = 1;
  else if (suffix === "m") multiplier = 30;
  else if (suffix === "y") multiplier = 365;
  const rangePart = key.slice(0, -1);
  const parts = rangePart.split("-");
  if (parts.length !== 2) {
    return { lower: 0, upper: Infinity };
  }
  const lower = Number(parts[0]) * multiplier;
  const upper = Number(parts[1]) * multiplier;
  return { lower, upper };
};

// -------------------------
// Helper: roundToTwo decimals
// -------------------------

function roundToTwo(num: number): number {
  return parseFloat(num.toFixed(2));
}

// -------------------------
// Component: BloodValuesForm
// -------------------------

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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BloodValuesFormInputs>({
    defaultValues: {
      patientId: patientId || "",
      tests: [],
    },
  });

  // 1) Fetch patient data, booked tests, and any stored results
  useEffect(() => {
    if (!patientId) return;

    const fetchPatientData = async () => {
      try {
        const patientRef = ref(database, `patients/${patientId}`);
        const patientSnapshot = await get(patientRef);
        if (!patientSnapshot.exists()) {
          setLoading(false);
          return;
        }

        const patientData = patientSnapshot.val();
        const patientTests = patientData.bloodTests || [];
        const storedBloodTests = patientData.bloodtest || {};
        const patientAgeInDays = patientData.total_day
          ? Number(patientData.total_day)
          : Number(patientData.age) * 365;

        // Build the tests array by fetching test definitions from "bloodTests"
        const testsData: TestValueEntry[] = await Promise.all(
          patientTests.map(async (testObj: { testId: string; testName: string; selectedParameters?: string[] }) => {
            const definitionRef = ref(database, `bloodTests/${testObj.testId}`);
            const definitionSnap = await get(definitionRef);

            if (!definitionSnap.exists()) {
              return {
                testId: testObj.testId,
                testName: testObj.testName,
                parameters: [],
              };
            }

            const testDefinition = definitionSnap.val();
            const allParams = testDefinition.parameters;
            let filteredParams;
            if (testObj.selectedParameters?.length) {
              filteredParams = allParams.filter((p: any) =>
                testObj.selectedParameters!.includes(p.name)
              );
            } else {
              filteredParams = allParams;
            }

            const parameters = filteredParams.map((param: any) => {
              const gender = patientData.gender?.toLowerCase() === "male" ? "male" : "female";
              const rangesForGender = param.range[gender] || [];
              let normalRange = "";
              for (const rng of rangesForGender) {
                const { lower, upper } = parseRangeKey(rng.rangeKey);
                if (patientAgeInDays >= lower && patientAgeInDays <= upper) {
                  normalRange = rng.rangeValue;
                  break;
                }
              }
              if (!normalRange && rangesForGender.length > 0) {
                normalRange = rangesForGender[rangesForGender.length - 1].rangeValue;
              }

              const testKey = testDefinition.testName.toLowerCase().replace(/\s+/g, "_");
              const storedParamObj =
                storedBloodTests?.[testKey]?.parameters?.find((p: any) => p.name === param.name);

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
                    storedParamObj?.subparameters?.find((sp: any) => sp.name === subParam.name);
                  return {
                    name: subParam.name,
                    unit: subParam.unit,
                    value: storedSubParam ? storedSubParam.value : "",
                    range: subRangeStr,
                    // Inherit valueType from parent if defined; else default to "number"
                    valueType: subParam.valueType || "number",
                  };
                });
              }

              return {
                name: param.name,
                unit: param.unit,
                value: storedParamObj ? storedParamObj.value : "",
                range: normalRange,
                formula: param.formula || "",
                // Add valueType property; default to "number" if not provided
                valueType: param.valueType || "number",
                ...(subparams ? { subparameters: subparams } : {}),
              };
            });

            return {
              testId: testObj.testId,
              testName: testDefinition.testName,
              parameters,
              subheadings: testDefinition.subheadings || [],
              selectedParameters: testObj.selectedParameters,
            };
          })
        );

        reset({
          patientId,
          tests: testsData,
        });
      } catch (error) {
        console.error("Error fetching patient data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPatientData();
  }, [patientId, reset]);

  // 2) Manual formula calculation button (only for numeric type)
  const handleCalculateFormula = (testIndex: number, paramIndex: number) => {
    const tests = watch("tests");
    const currentTest = tests[testIndex];
    if (!currentTest) return;

    const param = currentTest.parameters[paramIndex];
    if (!param?.formula?.trim()) return;
    if (param.valueType !== "number") return; // Only calculate for numeric values

    // Build dictionary of parameter values for the current test.
    const paramValues: Record<string, number> = {};
    currentTest.parameters.forEach((p: TestParameterValue) => {
      if (p.value !== "" && !isNaN(Number(p.value))) {
        paramValues[p.name] = Number(p.value);
      }
    });

    let expr = param.formula;
    Object.entries(paramValues).forEach(([name, val]) => {
      const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rgx = new RegExp(safeName, "g");
      expr = expr.replace(rgx, val.toString());
    });
    try {
      const result = Function('"use strict";return (' + expr + ')')();
      if (!isNaN(result)) {
        const newVal = roundToTwo(Number(result));
        setValue(`tests.${testIndex}.parameters.${paramIndex}.value`, newVal);
      }
    } catch (err) {
      console.error("Error evaluating formula for", param.name, err);
    }
  };

  // 3) Optional auto-calc effect (only for numeric parameters)
  const testsWatch = watch("tests");
  useEffect(() => {
    testsWatch.forEach((test, testIndex) => {
      const paramValues: Record<string, number> = {};
      test.parameters.forEach((param) => {
        if (param.value !== "" && !isNaN(Number(param.value))) {
          paramValues[param.name] = Number(param.value);
        }
      });
      test.parameters.forEach((param, paramIndex) => {
        if (param.formula?.trim() && param.valueType === "number") {
          let expr = param.formula;
          Object.entries(paramValues).forEach(([name, val]) => {
            const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rgx = new RegExp(safeName, "g");
            expr = expr.replace(rgx, val.toString());
          });
          try {
            const result = Function('"use strict";return (' + expr + ')')();
            if (!isNaN(result) && result !== param.value) {
              const newVal = roundToTwo(Number(result));
              setValue(`tests.${testIndex}.parameters.${paramIndex}.value`, newVal);
            }
          } catch (err) {
            console.error("Error evaluating formula for", param.name, err);
          }
        }
      });
    });
  }, [testsWatch, setValue]);

  // 4) Submit results to Firebase
  const onSubmit: SubmitHandler<BloodValuesFormInputs> = async (data) => {
    try {
      for (const test of data.tests) {
        const testKey = test.testName
  .toLowerCase()
  .replace(/\s+/g, "_")
  .replace(/[.#$[\]]/g, "");
;
        const dbRef = ref(database, `patients/${data.patientId}/bloodtest/${testKey}`);
        await set(dbRef, {
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

  // 5) Render
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
                <h3 className="text-xl font-semibold text-gray-800">
                  {test.testName}
                </h3>
              </div>

              {/* Render parameters */}
              {test.subheadings && test.subheadings.length > 0 ? (
                <>
                  {test.subheadings.map((subheading, subIndex) => {
                    const paramsForSub = test.parameters
                      .map((p, pIndex) => ({ ...p, originalIndex: pIndex }))
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
                                  {item.unit && (
                                    <span className="ml-2 text-sm text-gray-500">
                                      ({item.unit})
                                    </span>
                                  )}
                                </label>
                                <div className="relative">
                                  <input
                                    // If valueType is "text", allow text input; otherwise (or if undefined) use number input.
                                    type={ (item.valueType ?? "number") === "text" ? "text" : "number" }
                                    step="any"
                                    {...register(
                                      `tests.${testIndex}.parameters.${item.originalIndex}.value` as Path<BloodValuesFormInputs>,
                                      { required: "Value is required" }
                                    )}
                                    className="w-full px-4 py-2 pr-16 border rounded-lg focus:ring-2 focus:ring-blue-200"
                                    placeholder="Enter value"
                                  />
                                  {item.formula && item.valueType === "number" && (
                                    <button
                                      type="button"
                                      onClick={() => handleCalculateFormula(testIndex, item.originalIndex)}
                                      className="absolute right-3 top-2 text-blue-600 hover:text-blue-800"
                                    >
                                      <FaCalculator className="w-5 h-5" />
                                    </button>
                                  )}
                                  {errors.tests?.[testIndex]?.parameters?.[item.originalIndex]?.value && (
                                    <FiAlertCircle className="absolute right-10 top-3 w-5 h-5 text-red-500" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-500">Normal Range:</span>
                                  <span className="font-medium text-green-600">
                                    {item.range}
                                  </span>
                                </div>
                                {item.subparameters && item.subparameters.length > 0 && (
                                  <div className="ml-4 border-l pl-4 space-y-4">
                                    {item.subparameters.map((subParam, spIndex) => (
                                      <div key={spIndex} className="space-y-2">
                                        <label className="block text-sm font-medium text-gray-700">
                                          {subParam.name}{" "}
                                          {subParam.unit && (
                                            <span className="ml-2 text-sm text-gray-500">
                                              ({subParam.unit})
                                            </span>
                                          )}
                                        </label>
                                        <div className="relative">
                                          <input
                                            type={ (subParam.valueType ?? "number") === "text" ? "text" : "number" }
                                            step="any"
                                            {...register(
                                              `tests.${testIndex}.parameters.${item.originalIndex}.subparameters.${spIndex}.value` as Path<BloodValuesFormInputs>,
                                              { required: "Value is required" }
                                            )}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-200"
                                            placeholder="Enter value"
                                          />
                                          {errors.tests?.[testIndex]?.parameters?.[item.originalIndex]?.subparameters?.[spIndex]?.value && (
                                            <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                          <span className="text-gray-500">Normal Range:</span>
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
                            <span>No parameters found under this subheading.</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(() => {
                    const subheadingParamNames = test.subheadings.reduce(
                      (acc: string[], sh) => acc.concat(sh.parameterNames),
                      []
                    );
                    const leftoverParams = test.parameters
                      .map((p, idx) => ({ ...p, originalIndex: idx }))
                      .filter((item) => !subheadingParamNames.includes(item.name));
                    if (leftoverParams.length > 0) {
                      return (
                        <div className="mb-6">
                          <h4 className="text-lg font-bold mb-2">Global Parameters</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {leftoverParams.map((item) => (
                              <div key={item.originalIndex} className="space-y-4">
                                <label className="block text-sm font-medium text-gray-700">
                                  {item.name}{" "}
                                  {item.unit && (
                                    <span className="ml-2 text-sm text-gray-500">
                                      ({item.unit})
                                    </span>
                                  )}
                                </label>
                                <div className="relative">
                                  <input
                                    type={ (item.valueType ?? "number") === "text" ? "text" : "number" }
                                    step="any"
                                    {...register(
                                      `tests.${testIndex}.parameters.${item.originalIndex}.value` as Path<BloodValuesFormInputs>,
                                      { required: "Value is required" }
                                    )}
                                    className="w-full px-4 py-2 pr-16 border rounded-lg focus:ring-2 focus:ring-blue-200"
                                    placeholder="Enter value"
                                  />
                                  {item.formula && item.valueType === "number" && (
                                    <button
                                      type="button"
                                      onClick={() => handleCalculateFormula(testIndex, item.originalIndex)}
                                      className="absolute right-3 top-2 text-blue-600 hover:text-blue-800"
                                    >
                                      <FaCalculator className="w-5 h-5" />
                                    </button>
                                  )}
                                  {errors.tests?.[testIndex]?.parameters?.[item.originalIndex]?.value && (
                                    <FiAlertCircle className="absolute right-10 top-3 w-5 h-5 text-red-500" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-gray-500">Normal Range:</span>
                                  <span className="font-medium text-green-600">
                                    {item.range}
                                  </span>
                                </div>
                                {item.subparameters && item.subparameters.length > 0 && (
                                  <div className="ml-4 border-l pl-4 space-y-4">
                                    {item.subparameters.map((subParam, spIndex) => (
                                      <div key={spIndex} className="space-y-2">
                                        <label className="block text-sm font-medium text-gray-700">
                                          {subParam.name}{" "}
                                          {subParam.unit && (
                                            <span className="ml-2 text-sm text-gray-500">
                                              ({subParam.unit})
                                            </span>
                                          )}
                                        </label>
                                        <div className="relative">
                                          <input
                                            type={ (subParam.valueType ?? "number") === "text" ? "text" : "number" }
                                            step="any"
                                            {...register(
                                              `tests.${testIndex}.parameters.${item.originalIndex}.subparameters.${spIndex}.value` as Path<BloodValuesFormInputs>,
                                              { required: "Value is required" }
                                            )}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-200"
                                            placeholder="Enter value"
                                          />
                                          {errors.tests?.[testIndex]?.parameters?.[item.originalIndex]?.subparameters?.[spIndex]?.value && (
                                            <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                          <span className="text-gray-500">Normal Range:</span>
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
                // If no subheadings, list all parameters in a grid
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {test.parameters.map((param, paramIndex) => (
                    <div key={paramIndex} className="space-y-4">
                      <label className="block text-sm font-medium text-gray-700">
                        {param.name}
                        {param.unit && (
                          <span className="ml-2 text-sm text-gray-500">
                            ({param.unit})
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type={ (param.valueType ?? "number") === "text" ? "text" : "number" }
                          step="any"
                          {...register(
                            `tests.${testIndex}.parameters.${paramIndex}.value` as Path<BloodValuesFormInputs>,
                            { required: "Value is required" }
                          )}
                          className="w-full px-4 py-2 pr-16 border rounded-lg focus:ring-2 focus:ring-blue-200"
                          placeholder="Enter value"
                        />
                        {param.formula && param.valueType === "number" && (
                          <button
                            type="button"
                            onClick={() => handleCalculateFormula(testIndex, paramIndex)}
                            className="absolute right-3 top-2 text-blue-600 hover:text-blue-800"
                          >
                            <FaCalculator className="w-5 h-5" />
                          </button>
                        )}
                        {errors.tests?.[testIndex]?.parameters?.[paramIndex]?.value && (
                          <FiAlertCircle className="absolute right-10 top-3 w-5 h-5 text-red-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">Normal Range:</span>
                        <span className="font-medium text-green-600">
                          {param.range}
                        </span>
                      </div>

                      {param.subparameters && param.subparameters.length > 0 && (
                        <div className="ml-4 border-l pl-4 space-y-4">
                          {param.subparameters.map((subParam, spIndex) => (
                            <div key={spIndex} className="space-y-2">
                              <label className="block text-sm font-medium text-gray-700">
                                {subParam.name}
                                {subParam.unit && (
                                  <span className="ml-2 text-sm text-gray-500">
                                    ({subParam.unit})
                                  </span>
                                )}
                              </label>
                              <div className="relative">
                                <input
                                  type={ (subParam.valueType ?? "number") === "text" ? "text" : "number" }
                                  step="any"
                                  {...register(
                                    `tests.${testIndex}.parameters.${paramIndex}.subparameters.${spIndex}.value` as Path<BloodValuesFormInputs>,
                                    { required: "Value is required" }
                                  )}
                                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-200"
                                  placeholder="Enter value"
                                />
                                {errors.tests?.[testIndex]?.parameters?.[paramIndex]?.subparameters?.[spIndex]?.value && (
                                  <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-500">Normal Range:</span>
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
