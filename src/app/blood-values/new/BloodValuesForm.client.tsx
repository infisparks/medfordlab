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

// -------------------------------------------------------------------
// Interfaces
// -------------------------------------------------------------------

/**
 * We split `subparameters` into a separate interface so that
 * React Hook Form’s `Path` can correctly infer paths like
 * `tests.${number}.parameters.${number}.subparameters.${number}.value`.
 */
interface SubParameterValue {
  name: string;
  unit: string;
  value: string | number;
  range: string;
  formula?: string; 
  valueType: "number" | "text";
}

interface TestParameterValue {
  name: string;
  unit: string;
  value: string | number;
  range: string;
  formula?: string; 
  valueType: "number" | "text";
  // Note: subparameters do NOT contain further sub-subparameters,
  // so there's no infinite recursion now.
  subparameters?: SubParameterValue[];
}

interface TestValueEntry {
  testId: string;
  testName: string;
  parameters: TestParameterValue[];
  subheadings?: {
    title: string;
    parameterNames: string[];
  }[];
  selectedParameters?: string[];
}

interface BloodValuesFormInputs {
  patientId: string;
  tests: TestValueEntry[];
}

// This type helps us keep all original parameter properties plus an "originalIndex"
type IndexedParam = TestParameterValue & { originalIndex: number };

// -------------------------------------------------------------------
// Helper: parseRangeKey
// -------------------------------------------------------------------
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

// -------------------------------------------------------------------
// Helper: roundToTwo
// -------------------------------------------------------------------
function roundToTwo(num: number): number {
  return parseFloat(num.toFixed(2));
}

// Quick helper to see if a string is a valid number:
function isNumeric(str: string) {
  return !isNaN(parseFloat(str)) && isFinite(parseFloat(str));
}

const BloodValuesForm: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const patientId = searchParams.get("patientId");
  const [loading, setLoading] = useState(true);

  // This set holds all “text” strings the user typed into numeric fields
  const [textHistory, setTextHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState<{
    testIndex: number;
    paramIndex: number;
    subIndex?: number;
  } | null>(null);

  // Our form
  const {
    
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

  // 1) Fetch patient data, booked tests, stored results
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
          patientTests.map(async (testObj: any) => {
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
            const allParams = testDefinition.parameters || [];
            let filteredParams;
            if (testObj.selectedParameters?.length) {
              filteredParams = allParams.filter((p: any) =>
                testObj.selectedParameters!.includes(p.name)
              );
            } else {
              filteredParams = allParams;
            }

            // Build each parameter
            const parameters = filteredParams.map((param: any) => {
              const gender =
                patientData.gender?.toLowerCase() === "male" ? "male" : "female";
              const rangesForGender = param.range?.[gender] || [];
              let normalRange = "";

              for (const rng of rangesForGender) {
                const { lower, upper } = parseRangeKey(rng.rangeKey);
                if (patientAgeInDays >= lower && patientAgeInDays <= upper) {
                  normalRange = rng.rangeValue;
                  break;
                }
              }
              if (!normalRange && rangesForGender.length > 0) {
                normalRange =
                  rangesForGender[rangesForGender.length - 1].rangeValue;
              }

              const testKey = testDefinition.testName
                .toLowerCase()
                .replace(/\s+/g, "_");
              const storedParamObj =
                storedBloodTests?.[testKey]?.parameters?.find(
                  (p: any) => p.name === param.name
                );

              let subparams: SubParameterValue[] | undefined;
              if (param.subparameters && Array.isArray(param.subparameters)) {
                subparams = param.subparameters.map((subParam: any) => {
                  const subRanges = subParam.range?.[gender] || [];
                  let subRangeStr = "";
                  for (const sr of subRanges) {
                    const { lower, upper } = parseRangeKey(sr.rangeKey);
                    if (
                      patientAgeInDays >= lower &&
                      patientAgeInDays <= upper
                    ) {
                      subRangeStr = sr.rangeValue;
                      break;
                    }
                  }
                  if (!subRangeStr && subRanges.length > 0) {
                    subRangeStr =
                      subRanges[subRanges.length - 1].rangeValue;
                  }
                  const storedSubParam =
                    storedParamObj?.subparameters?.find(
                      (sp: any) => sp.name === subParam.name
                    );
                  return {
                    name: subParam.name,
                    unit: subParam.unit,
                    value: storedSubParam ? storedSubParam.value : "",
                    range: subRangeStr,
                    valueType: subParam.valueType || "number",
                    formula: subParam.formula || "",
                  };
                });
              }

              return {
                name: param.name,
                unit: param.unit,
                value: storedParamObj ? storedParamObj.value : "",
                range: normalRange,
                formula: param.formula || "",
                valueType: (param.valueType || "number") as "number" | "text",
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

  // 2) handleCalculateFormula
  const handleCalculateFormula = (testIndex: number, paramIndex: number) => {
    const tests = watch("tests");
    const currentTest = tests[testIndex];
    if (!currentTest) return;

    const param = currentTest.parameters[paramIndex];
    if (!param?.formula?.trim()) return;
    if (param.valueType !== "number") return; // only numeric

    // gather param values
    const paramValues: Record<string, number> = {};
    currentTest.parameters.forEach((p: TestParameterValue) => {
      const val = parseFloat(String(p.value));
      if (!isNaN(val)) {
        paramValues[p.name] = val;
      }
    });
    let expr = param.formula;
    Object.entries(paramValues).forEach(([name, val]) => {
      const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rgx = new RegExp(safeName, "g");
      expr = expr.replace(rgx, val.toString());
    });

    try {
      const result = Function('"use strict";return (' + expr + ')')();
      if (!isNaN(result)) {
        const newVal = roundToTwo(Number(result));
        setValue(
          `tests.${testIndex}.parameters.${paramIndex}.value` as Path<BloodValuesFormInputs>,
          newVal.toFixed(2)
        );
      }
    } catch (err) {
      console.error("Error evaluating formula for", param.name, err);
    }
  };

  // 2a) handleNumericInputChange
  const handleNumericInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    testIndex: number,
    paramIndex: number,
    subParamIndex?: number
  ) => {
    const inputVal = e.target.value;
    // If numeric (or empty), just set as usual:
    if (inputVal === "" || isNumeric(inputVal)) {
      setShowSuggest(null);
      setSuggestions([]);

      if (subParamIndex === undefined) {
        setValue(
          `tests.${testIndex}.parameters.${paramIndex}.value` as Path<BloodValuesFormInputs>,
          inputVal
        );
      } else {
        setValue(
          `tests.${testIndex}.parameters.${paramIndex}.subparameters.${subParamIndex}.value` as Path<BloodValuesFormInputs>,
          inputVal
        );
      }
    } else {
      // user typed non-numeric => store in textHistory if not present
      if (!textHistory.includes(inputVal)) {
        setTextHistory((old) => [...old, inputVal]);
      }
      // Build suggestions from textHistory that includes the typed string
      const matched = textHistory.filter((t) =>
        t.toLowerCase().includes(inputVal.toLowerCase())
      );
      setSuggestions(matched);
      setShowSuggest({ testIndex, paramIndex, subIndex: subParamIndex });

      // update form with raw text
      if (subParamIndex === undefined) {
        setValue(
          `tests.${testIndex}.parameters.${paramIndex}.value` as Path<BloodValuesFormInputs>,
          inputVal
        );
      } else {
        setValue(
          `tests.${testIndex}.parameters.${paramIndex}.subparameters.${subParamIndex}.value` as Path<BloodValuesFormInputs>,
          inputVal
        );
      }
    }
  };

  // user picks a suggestion
  const handlePickSuggestion = (
    suggestionValue: string,
    testIndex: number,
    paramIndex: number,
    subParamIndex?: number
  ) => {
    if (subParamIndex === undefined) {
      setValue(
        `tests.${testIndex}.parameters.${paramIndex}.value` as Path<BloodValuesFormInputs>,
        suggestionValue
      );
    } else {
      setValue(
        `tests.${testIndex}.parameters.${paramIndex}.subparameters.${subParamIndex}.value` as Path<BloodValuesFormInputs>,
        suggestionValue
      );
    }
    setShowSuggest(null);
    setSuggestions([]);
  };

  // 3) auto-effect for formula calc + rounding
  const testsWatch = watch("tests");
  useEffect(() => {
    const newTests = JSON.parse(JSON.stringify(testsWatch)) as TestValueEntry[];
    let changed = false;

    newTests.forEach((test, tIdx) => {
      const paramValues: Record<string, number> = {};
      test.parameters.forEach((p) => {
        const val = parseFloat(String(p.value));
        if (!isNaN(val)) {
          paramValues[p.name] = val;
        }
      });

      test.parameters.forEach((param, pIdx) => {
        // formula
        if (param.formula?.trim() && param.valueType === "number") {
          let expr = param.formula;
          Object.entries(paramValues).forEach(([name, val]) => {
            const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const rgx = new RegExp(safeName, "g");
            expr = expr.replace(rgx, val.toString());
          });
          try {
            const result = Function('"use strict";return (' + expr + ')')();
            if (!isNaN(result)) {
              const newVal = roundToTwo(Number(result));
              const newValStr = newVal.toFixed(2);
              if (String(param.value) !== newValStr) {
                newTests[tIdx].parameters[pIdx].value = newValStr;
                changed = true;
              }
            }
          } catch (err) {
            console.error("Error evaluating formula for", param.name, err);
          }
        }
        // rounding
        if (param.valueType === "number" && param.value !== "") {
          const numericVal = parseFloat(String(param.value));
          if (!isNaN(numericVal)) {
            const str2dec = numericVal.toFixed(2);
            if (String(param.value) !== str2dec) {
              newTests[tIdx].parameters[pIdx].value = str2dec;
              changed = true;
            }
          }
        }

        // subparams
        if (param.subparameters && Array.isArray(param.subparameters)) {
          param.subparameters.forEach((sp, spIndex) => {
            if (sp.valueType === "number" && sp.value !== "") {
              const spVal = parseFloat(String(sp.value));
              if (!isNaN(spVal)) {
                const spStr2dec = spVal.toFixed(2);
                if (String(sp.value) !== spStr2dec) {
                  newTests[tIdx].parameters[pIdx].subparameters![spIndex].value = spStr2dec;
                  changed = true;
                }
              }
            }
          });
        }
      });
    });

    if (changed) {
      setValue("tests", newTests, { shouldValidate: false });
    }
  }, [testsWatch, setValue]);

  // 4) onSubmit => push to firebase
  const onSubmit: SubmitHandler<BloodValuesFormInputs> = async (formData) => {
    try {
      for (const test of formData.tests) {
        const testKey = test.testName
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[.#$[\]]/g, "");

        const filteredParams = test.parameters
          .map((param) => {
            const filteredSubparams =
              param.subparameters?.filter((sp) => sp.value !== "") ?? [];
            if (param.value !== "" || filteredSubparams.length > 0) {
              return {
                ...param,
                subparameters: filteredSubparams,
              };
            }
            return null;
          })
          .filter(Boolean) as TestParameterValue[];

        // convert numeric strings to float
        filteredParams.forEach((p) => {
          if (p.valueType === "number" && p.value !== "") {
            p.value = parseFloat(String(p.value));
          }
          p.subparameters?.forEach((sp) => {
            if (sp.valueType === "number" && sp.value !== "") {
              sp.value = parseFloat(String(sp.value));
            }
          });
        });

        const dbRefTest = ref(
          database,
          `patients/${formData.patientId}/bloodtest/${testKey}`
        );
        await set(dbRefTest, {
          parameters: filteredParams,
          subheadings: test.subheadings || [],
          createdAt: new Date().toISOString(),
        });
      }
      alert("Blood test values saved successfully!");
      router.push(`/download-report?patientId=${formData.patientId}`);
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

  const tests = watch("tests"); // Watch entire tests array
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-2">
      <div className="max-w-3xl w-full bg-white p-4 rounded-xl shadow-lg relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-full">
            <FiDroplet className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Blood Test Analysis</h1>
            <p className="text-gray-600 text-sm">Patient ID: {patientId}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {tests.map((test, testIndex) => {
            const subheadings = test.subheadings || [];
            const subheadingParamNames = subheadings.reduce(
              (acc: string[], sh) => acc.concat(sh.parameterNames),
              []
            );
            let globalParams: IndexedParam[] = [];
            if (subheadings.length > 0) {
              globalParams = test.parameters
                .map((p, idx) => ({ ...p, originalIndex: idx }))
                .filter((item) => !subheadingParamNames.includes(item.name));
            }
            return (
              <div
                key={test.testId}
                className="border-l-4 border-blue-600 bg-gray-50 mb-4 p-3 rounded relative"
              >
                {/* Test Title */}
                <div className="flex items-center gap-2 mb-2">
                  <FiDroplet className="w-4 h-4 text-blue-600" />
                  <h3 className="text-base font-semibold text-gray-800">
                    {test.testName}
                  </h3>
                </div>

                {/* (A) Global parameters if subheadings */}
                {subheadings.length > 0 && globalParams.length > 0 && (
                  <div className="mb-2">
                    <h4 className="text-sm font-bold mb-1">Global Parameters</h4>
                    {globalParams.map((param) => (
                      <div key={param.originalIndex} className="pl-2 mb-1">
                        <div className="flex items-center text-sm border rounded px-2 py-1 relative">
                          <div className="flex-1 flex items-center">
                            <span className="font-medium text-gray-700">
                              {param.name}
                              {param.unit && (
                                <span className="ml-1 text-xs text-gray-500">
                                  ({param.unit})
                                </span>
                              )}
                            </span>
                            {param.formula && param.valueType === "number" && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleCalculateFormula(
                                    testIndex,
                                    param.originalIndex
                                  )
                                }
                                className="ml-2 text-blue-600 hover:text-blue-800"
                                title="Calculate Formula"
                              >
                                <FaCalculator className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Input */}
                          {param.valueType === "number" ? (
                            <div className="mx-2 w-28 relative">
                              <input
                                type="text"
                                className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                placeholder="Value"
                                // Use the watched value
                                value={String(
                                  tests[testIndex].parameters[param.originalIndex].value ?? ""
                                )}
                                onChange={(e) =>
                                  handleNumericInputChange(
                                    e,
                                    testIndex,
                                    param.originalIndex
                                  )
                                }
                              />
                              {errors.tests?.[testIndex]?.parameters?.[param.originalIndex]
                                ?.value && (
                                <FiAlertCircle className="absolute right-1 top-1.5 w-4 h-4 text-red-500" />
                              )}
                            </div>
                          ) : (
                            <div className="mx-2 w-28 relative">
                              {/* normal text */}
                              <input
                                type="text"
                                className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                placeholder="Value"
                                value={String(
                                  tests[testIndex].parameters[param.originalIndex].value ?? ""
                                )}
                                onChange={(e) =>
                                  setValue(
                                    `tests.${testIndex}.parameters.${param.originalIndex}.value` as Path<BloodValuesFormInputs>,
                                    e.target.value
                                  )
                                }
                              />
                              {errors.tests?.[testIndex]?.parameters?.[param.originalIndex]
                                ?.value && (
                                <FiAlertCircle className="absolute right-1 top-1.5 w-4 h-4 text-red-500" />
                              )}
                            </div>
                          )}

                          <div className="flex-1 text-right text-gray-600">
                            Normal Range:{" "}
                            <span className="font-medium text-green-600">
                              {param.range}
                            </span>
                          </div>
                        </div>

                        {/* subparams */}
                        {param.subparameters?.length && (
                          <div className="ml-2 mt-1">
                            {param.subparameters.map((sp, spIndex) => (
                              <div key={spIndex} className="mb-1 relative">
                                <div className="flex items-center text-sm border rounded px-2 py-1">
                                  <div className="flex-1">
                                    <span className="font-medium text-gray-700">
                                      {sp.name}
                                      {sp.unit && (
                                        <span className="ml-1 text-xs text-gray-500">
                                          ({sp.unit})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  {sp.valueType === "number" ? (
                                    <div className="mx-2 w-28 relative">
                                      <input
                                        type="text"
                                        className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                        placeholder="Value"
                                        value={String(
                                          tests[testIndex].parameters[param.originalIndex].subparameters?.[spIndex].value ?? ""
                                        )}
                                        onChange={(e) =>
                                          handleNumericInputChange(
                                            e,
                                            testIndex,
                                            param.originalIndex,
                                            spIndex
                                          )
                                        }
                                      />
                                    </div>
                                  ) : (
                                    <div className="mx-2 w-28 relative">
                                      <input
                                        type="text"
                                        className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                        placeholder="Value"
                                        value={String(
                                          tests[testIndex].parameters[param.originalIndex].subparameters?.[spIndex].value ?? ""
                                        )}
                                        onChange={(e) =>
                                          setValue(
                                            `tests.${testIndex}.parameters.${param.originalIndex}.subparameters.${spIndex}.value` as Path<BloodValuesFormInputs>,
                                            e.target.value
                                          )
                                        }
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 text-right text-gray-600">
                                    Normal Range:{" "}
                                    <span className="font-medium text-green-600">
                                      {sp.range}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* (B) If subheadings exist, show them, else show all in one list */}
                {subheadings.length > 0 ? (
                  <>
                    {subheadings.map((subheading, subIndex) => {
                      const paramsForSub: IndexedParam[] = test.parameters
                        .map((p, pIdx) => ({ ...p, originalIndex: pIdx }))
                        .filter((item) =>
                          subheading.parameterNames.includes(item.name)
                        );

                      return (
                        <div key={subIndex} className="mb-2">
                          <h4 className="text-sm font-bold mb-1">
                            {subheading.title}
                          </h4>

                          {paramsForSub.length > 0 ? (
                            <>
                              {paramsForSub.map((item) => (
                                <div
                                  key={item.originalIndex}
                                  className="pl-2 mb-1"
                                >
                                  {/* main param row */}
                                  <div className="flex items-center text-sm border rounded px-2 py-1 relative">
                                    <div className="flex-1 flex items-center">
                                      <span className="font-medium text-gray-700">
                                        {item.name}
                                        {item.unit && (
                                          <span className="ml-1 text-xs text-gray-500">
                                            ({item.unit})
                                          </span>
                                        )}
                                      </span>
                                      {item.formula &&
                                        item.valueType === "number" && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleCalculateFormula(
                                                testIndex,
                                                item.originalIndex
                                              )
                                            }
                                            className="ml-2 text-blue-600 hover:text-blue-800"
                                            title="Calculate Formula"
                                          >
                                            <FaCalculator className="w-3 h-3" />
                                          </button>
                                        )}
                                    </div>

                                    {/* Input */}
                                    {item.valueType === "number" ? (
                                      <div className="mx-2 w-28 relative">
                                        <input
                                          type="text"
                                          className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                          placeholder="Value"
                                          value={String(
                                            tests[testIndex].parameters[item.originalIndex].value ?? ""
                                          )}
                                          onChange={(e) =>
                                            handleNumericInputChange(
                                              e,
                                              testIndex,
                                              item.originalIndex
                                            )
                                          }
                                        />
                                      </div>
                                    ) : (
                                      <div className="mx-2 w-28 relative">
                                        <input
                                          type="text"
                                          className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                          placeholder="Value"
                                          value={String(
                                            tests[testIndex].parameters[item.originalIndex].value ?? ""
                                          )}
                                          onChange={(e) =>
                                            setValue(
                                              `tests.${testIndex}.parameters.${item.originalIndex}.value` as Path<BloodValuesFormInputs>,
                                              e.target.value
                                            )
                                          }
                                        />
                                      </div>
                                    )}
                                    <div className="flex-1 text-right text-gray-600">
                                      Normal Range:{" "}
                                      <span className="font-medium text-green-600">
                                        {item.range}
                                      </span>
                                    </div>
                                  </div>

                                  {/* subparams */}
                                  {item.subparameters?.length && (
                                    <div className="ml-2 mt-1">
                                      {item.subparameters.map((sp, spIndex) => (
                                        <div key={spIndex} className="mb-1 relative">
                                          <div className="flex items-center text-sm border rounded px-2 py-1">
                                            <div className="flex-1">
                                              <span className="font-medium text-gray-700">
                                                {sp.name}
                                                {sp.unit && (
                                                  <span className="ml-1 text-xs text-gray-500">
                                                    ({sp.unit})
                                                  </span>
                                                )}
                                              </span>
                                            </div>
                                            {sp.valueType === "number" ? (
                                              <div className="mx-2 w-28 relative">
                                                <input
                                                  type="text"
                                                  className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                                  placeholder="Value"
                                                  value={String(
                                                    tests[testIndex].parameters[item.originalIndex].subparameters?.[spIndex].value ?? ""
                                                  )}
                                                  onChange={(e) =>
                                                    handleNumericInputChange(
                                                      e,
                                                      testIndex,
                                                      item.originalIndex,
                                                      spIndex
                                                    )
                                                  }
                                                />
                                              </div>
                                            ) : (
                                              <div className="mx-2 w-28 relative">
                                                <input
                                                  type="text"
                                                  className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                                  placeholder="Value"
                                                  value={String(
                                                    tests[testIndex].parameters[item.originalIndex].subparameters?.[spIndex].value ?? ""
                                                  )}
                                                  onChange={(e) =>
                                                    setValue(
                                                      `tests.${testIndex}.parameters.${item.originalIndex}.subparameters.${spIndex}.value` as Path<BloodValuesFormInputs>,
                                                      e.target.value
                                                    )
                                                  }
                                                />
                                              </div>
                                            )}
                                            <div className="flex-1 text-right text-gray-600">
                                              Normal Range:{" "}
                                              <span className="font-medium text-green-600">
                                                {sp.range}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </>
                          ) : (
                            <div className="bg-yellow-50 p-2 rounded flex items-center gap-2 text-yellow-700 text-sm">
                              <FiAlertCircle className="w-4 h-4" />
                              <span>No parameters found under this subheading.</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                ) : (
                  // No subheadings => single list
                  <>
                    {test.parameters.map((param, paramIndex) => (
                      <div key={paramIndex} className="pl-2 mb-1">
                        <div className="flex items-center text-sm border rounded px-2 py-1 relative">
                          <div className="flex-1 flex items-center">
                            <span className="font-medium text-gray-700">
                              {param.name}
                              {param.unit && (
                                <span className="ml-1 text-xs text-gray-500">
                                  ({param.unit})
                                </span>
                              )}
                            </span>
                            {param.formula && param.valueType === "number" && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleCalculateFormula(testIndex, paramIndex)
                                }
                                className="ml-2 text-blue-600 hover:text-blue-800"
                                title="Calculate Formula"
                              >
                                <FaCalculator className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {param.valueType === "number" ? (
                            <div className="mx-2 w-28 relative">
                              <input
                                type="text"
                                className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                placeholder="Value"
                                value={String(
                                  tests[testIndex].parameters[paramIndex].value ?? ""
                                )}
                                onChange={(e) =>
                                  handleNumericInputChange(
                                    e,
                                    testIndex,
                                    paramIndex
                                  )
                                }
                              />
                            </div>
                          ) : (
                            <div className="mx-2 w-28 relative">
                              <input
                                type="text"
                                className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                placeholder="Value"
                                value={String(
                                  tests[testIndex].parameters[paramIndex].value ?? ""
                                )}
                                onChange={(e) =>
                                  setValue(
                                    `tests.${testIndex}.parameters.${paramIndex}.value` as Path<BloodValuesFormInputs>,
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                          )}
                          <div className="flex-1 text-right text-gray-600">
                            Normal Range:{" "}
                            <span className="font-medium text-green-600">
                              {param.range}
                            </span>
                          </div>
                        </div>

                        {/* Subparams */}
                        {param.subparameters?.length && (
                          <div className="ml-2 mt-1">
                            {param.subparameters.map((sp, spIndex) => (
                              <div key={spIndex} className="mb-1 relative">
                                <div className="flex items-center text-sm border rounded px-2 py-1">
                                  <div className="flex-1">
                                    <span className="font-medium text-gray-700">
                                      {sp.name}
                                      {sp.unit && (
                                        <span className="ml-1 text-xs text-gray-500">
                                          ({sp.unit})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  {sp.valueType === "number" ? (
                                    <div className="mx-2 w-28 relative">
                                      <input
                                        type="text"
                                        className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                        placeholder="Value"
                                        value={String(
                                          tests[testIndex].parameters[paramIndex].subparameters?.[spIndex].value ?? ""
                                        )}
                                        onChange={(e) =>
                                          handleNumericInputChange(
                                            e,
                                            testIndex,
                                            paramIndex,
                                            spIndex
                                          )
                                        }
                                      />
                                    </div>
                                  ) : (
                                    <div className="mx-2 w-28 relative">
                                      <input
                                        type="text"
                                        className="w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200"
                                        placeholder="Value"
                                        value={String(
                                          tests[testIndex].parameters[paramIndex].subparameters?.[spIndex].value ?? ""
                                        )}
                                        onChange={(e) =>
                                          setValue(
                                            `tests.${testIndex}.parameters.${paramIndex}.subparameters.${spIndex}.value` as Path<BloodValuesFormInputs>,
                                            e.target.value
                                          )
                                        }
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 text-right text-gray-600">
                                    Normal Range:{" "}
                                    <span className="font-medium text-green-600">
                                      {sp.range}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}

          {/* Submit Button */}
          <div className="border-t mt-4 pt-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
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

        {/* Suggestions dropdown */}
        {showSuggest && suggestions.length > 0 && (
          <div
            className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white border rounded shadow-lg p-2 z-50 max-h-40 overflow-auto"
            style={{ width: "300px" }}
          >
            {suggestions.map((sg, i) => (
              <div
                key={i}
                className="p-1 hover:bg-gray-100 cursor-pointer"
                onClick={() =>
                  handlePickSuggestion(
                    sg,
                    showSuggest.testIndex,
                    showSuggest.paramIndex,
                    showSuggest.subIndex
                  )
                }
              >
                {sg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BloodValuesForm;
