"use client";

import React, { useState, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { useSearchParams, useRouter } from "next/navigation";
import { database } from "../../../firebase";
import { ref, get, set } from "firebase/database";
import { jsPDF } from "jspdf";
import letterhead from "./../../../../public/letterhead.png";
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

// Helper function to convert an image URL to a base64 string
const loadImageAsBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

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

  /**
   * Generates a professional PDF report using a modern table structure.
   * Each test section displays a colored header row with columns for:
   * - Parameter name (left aligned)
   * - Value (center aligned)
   * - Unit (right aligned)
   */
  const generatePDF = async (data: BloodValuesFormInputs) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let yPosition = margin;

    // Load letterhead as full-page background
    try {
      const letterheadBase64 = await loadImageAsBase64(letterhead.src);
      doc.addImage(letterheadBase64, "PNG", 0, 0, pageWidth, pageHeight);
    } catch (error) {
      console.error("Error loading letterhead image:", error);
    }

    // Report Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(0, 51, 102); // dark blue
    doc.text("Blood Test Report", pageWidth / 2, yPosition, { align: "center" });
    yPosition += 12;

    // Patient details
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Patient ID: ${data.patientId}`, margin, yPosition);
    const currentDate = new Date().toLocaleDateString();
    doc.text(`Date: ${currentDate}`, pageWidth - margin, yPosition, { align: "right" });
    yPosition += 12;

    // For each test, print a section with a modern table layout
    data.tests.forEach((test) => {
      yPosition += 6;
      // Test Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(0, 51, 102);
      doc.text(`Test: ${test.testName}`, margin, yPosition);
      yPosition += 8;

      // Draw a separator line
      doc.setDrawColor(0, 51, 102);
      doc.setLineWidth(0.5);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 4;

      // Define column positions for table header
      const col1X = margin;
      const col2X = pageWidth / 2;
      const col3X = pageWidth - margin;
      const headerHeight = 8;

      // Table header background
      doc.setFillColor(0, 51, 102); // dark blue
      doc.rect(margin, yPosition, pageWidth - 2 * margin, headerHeight, "F");

      // Table header text (white)
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.text("Parameter", col1X + 2, yPosition + headerHeight - 2);
      doc.text("Value", col2X, yPosition + headerHeight - 2, { align: "center" });
      doc.text("Unit", col3X - 2, yPosition + headerHeight - 2, { align: "right" });
      yPosition += headerHeight + 2;

      // Reset text styles for table rows
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      // Table rows for each parameter
      test.parameters.forEach((param) => {
        if (yPosition > pageHeight - margin - 15) {
          doc.addPage();
          yPosition = margin;
        }
        // Parameter name (left aligned)
        doc.text(param.name, col1X + 2, yPosition);
        // Value (center aligned)
        const valueStr = param.value === "" ? "-" : String(param.value);
        doc.text(valueStr, col2X, yPosition, { align: "center" });
        // Unit (right aligned)
        doc.text(param.unit, col3X - 2, yPosition, { align: "right" });
        yPosition += 7;

        // Normal range info in a lighter gray
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(10);
        doc.text(
          `Normal Range: ${param.normalRangeStart} - ${param.normalRangeEnd}`,
          col1X + 2,
          yPosition
        );
        // Reset styling
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        yPosition += 7;
      });

      // Add spacing after each test section
      yPosition += 4;
    });

    // Footer
    if (yPosition > pageHeight - margin - 10) {
      doc.addPage();
      yPosition = margin;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("Report generated by HealthCare System", margin, pageHeight - 10);

    doc.save("blood-test-report.pdf");
  };

  const onSubmit: SubmitHandler<BloodValuesFormInputs> = async (data) => {
    try {
      // Save test data at a static Firebase reference based on test name
      for (const test of data.tests) {
        const testKey = test.testName.toLowerCase();
        const testRef = ref(database, `patients/${data.patientId}/bloodtest/${testKey}`);
        await set(testRef, {
          parameters: test.parameters,
          createdAt: new Date().toISOString(),
        });
      }
      alert("Blood test values saved successfully!");
      await generatePDF(data);
      router.push("/");
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
          {watch("tests").map((test, index) => (
            <div key={test.testId} className="border-l-4 border-blue-600 bg-gray-50 p-6 rounded-lg">
              <div className="flex items-center gap-3 mb-6">
                <FiDroplet className="w-6 h-6 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-800">{test.testName}</h3>
              </div>

              {test.parameters.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {test.parameters.map((param, paramIndex) => (
                    <div key={paramIndex} className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        {param.name}
                        <span className="ml-2 text-sm text-gray-500">({param.unit})</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          {...register(`tests.${index}.parameters.${paramIndex}.value`, {
                            required: "Value is required",
                          })}
                          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 ${
                            errors.tests?.[index]?.parameters?.[paramIndex]?.value
                              ? "border-red-500 focus:ring-red-200"
                              : "border-gray-300 focus:ring-blue-200"
                          }`}
                          placeholder="Enter value"
                        />
                        {errors.tests?.[index]?.parameters?.[paramIndex]?.value && (
                          <FiAlertCircle className="absolute right-3 top-3 w-5 h-5 text-red-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">Normal Range:</span>
                        <span className="font-medium text-green-600">
                          {param.normalRangeStart} - {param.normalRangeEnd}
                        </span>
                      </div>
                      {errors.tests?.[index]?.parameters?.[paramIndex]?.value && (
                        <p className="text-red-500 text-sm flex items-center gap-2">
                          <FiAlertCircle className="w-4 h-4" />
                          {errors.tests[index]?.parameters[paramIndex]?.value?.message}
                        </p>
                      )}
                    </div>
                  ))}
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
