"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { jsPDF } from "jspdf";
import { ref as dbRef, get } from "firebase/database";
import { database } from "../../firebase"; // Adjust path if needed
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
// import JsBarcode from "jsbarcode";

// Import images – adjust paths if needed
import letterhead from "../../../public/letterhead.png";
import firstpage from "../../../public/fisrt.png";
import stamp from "../../../public/stamp.png";

// -----------------------------
// Type Definitions
// -----------------------------
interface AgeRangeItem {
  rangeKey: string;
  rangeValue: string;
}

interface Parameter {
  name: string;
  value: string | number;
  unit: string;
  range: string | { male: AgeRangeItem[]; female: AgeRangeItem[] };
  subparameters?: Parameter[];

  // If present, indicates we want to hide this parameter entirely
  visibility?: string;

  // If a formula is present, you might want it as well
  formula?: string;
}

interface BloodTestData {
  parameters: Parameter[];
  subheadings?: { title: string; parameterNames: string[] }[];
  type?: string; // e.g. "in-house" or "outsource"
}

interface PatientData {
  name: string;
  age: string | number;
  gender: string;
  patientId: string;
  createdAt: string;
  contact: string;
  total_day?: string | number;
  sampleCollectedAt?: string;

  // Optional fields to fix TS errors
  doctorName?: string;
  hospitalName?: string;

  // Bloodtest data
  bloodtest?: Record<string, BloodTestData>;
}

// -----------------------------
// Helper: Compress image as JPEG
// -----------------------------
const loadImageAsCompressedJPEG = async (
  url: string,
  quality = 0.5
): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context is null"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUrl);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
};

// -----------------------------
// Helper: Parse a range key (e.g. "0-30d") into numeric lower/upper in days
// -----------------------------
const parseRangeKey = (key: string): { lower: number; upper: number } => {
  key = key.trim();
  const suffix = key.slice(-1);
  let multiplier = 1;
  if (suffix === "m") multiplier = 30;
  else if (suffix === "y") multiplier = 365;

  const rangePart = key.replace(/[dmy]$/, ""); // remove suffix
  const [lowStr, highStr] = rangePart.split("-");
  const lower = Number(lowStr) * multiplier || 0;
  const upper = Number(highStr) * multiplier || Infinity;
  return { lower, upper };
};

// -----------------------------
// Helper: Try to parse a "range string" like "4.0-7.0" for numeric comparison
// -----------------------------
const parseNumericRangeString = (rangeStr: string) => {
  // Example pattern: "4-7", "4.0 - 7.1", etc.
  const regex = /^\s*([\d.]+)\s*-\s*([\d.]+)\s*$/;
  const match = rangeStr.match(regex);
  if (!match) return null;
  const lower = parseFloat(match[1]);
  const upper = parseFloat(match[2]);
  if (isNaN(lower) || isNaN(upper)) return null;
  return { lower, upper };
};

function DownloadReport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");

  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  // Prevents duplicate PDF generation on re-render
  const pdfGenerated = useRef(false);

  useEffect(() => {
    if (!patientId || pdfGenerated.current) return;
    pdfGenerated.current = true;

    const generateReport = async () => {
      try {
        // 1. Fetch patient data
        const patientRef = dbRef(database, `patients/${patientId}`);
        const snapshot = await get(patientRef);
        if (!snapshot.exists()) {
          alert("Patient not found");
          return;
        }
        const data = snapshot.val() as PatientData;
        if (!data.bloodtest) {
          alert("No report found for this patient.");
          return;
        }

        // ---------------------------------------------
        // 2. FILTER OUT ANY HIDDEN PARAMETERS FIRST
        // ---------------------------------------------
        const filteredBloodtest: Record<string, BloodTestData> = {};

        for (const testKey in data.bloodtest) {
          const originalTestData = data.bloodtest[testKey];
          // Make a shallow copy
          const newTestData: BloodTestData = {
            ...originalTestData,
            parameters: [],
          };

          // Filter out hidden parameters
          const visibleParams = originalTestData.parameters
            .filter((p) => p.visibility !== "hidden")
            .map((p) => {
              // Also filter subparameters
              const newSubparams =
                p.subparameters?.filter((sp) => sp.visibility !== "hidden") || [];
              return { ...p, subparameters: newSubparams };
            });

          newTestData.parameters = visibleParams;
          filteredBloodtest[testKey] = newTestData;
        }

        // Assign the filtered version
        data.bloodtest = filteredBloodtest;
        setPatientData(data);

        // 3. Age in days + gender
        const patientAgeInDays = data.total_day
          ? Number(data.total_day)
          : Number(data.age) * 365;
        const patientGender = data.gender?.toLowerCase() || "";

        // 4. Initialize jsPDF
        const doc = new jsPDF("p", "mm", "a4");
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const leftMargin = 30;

        // We'll do 4 columns: Param, Value, Reference Range, Unit
        const totalTableWidth = pageWidth - 2 * leftMargin;
        // total parts = 1 (param) + 1 (value) + 1.35 (range) + 1 (unit) = 4.35
        const baseColWidth = totalTableWidth / 4.35;
        const paramColWidth = baseColWidth;
        const valueColWidth = baseColWidth;
        const rangeColWidth = 1.43 * baseColWidth;
        const unitColWidth = baseColWidth;

        const col1X = leftMargin;
        const col2X = col1X + paramColWidth;
        const col3X = col2X + valueColWidth;
        const col4X = col3X + rangeColWidth;

        // Line height for each row
        const lineHeight = 6;

        // -----------------------------
        // Helper: Add first cover page
        // -----------------------------
        const addCoverPage = async () => {
          try {
            const coverBase64 = await loadImageAsCompressedJPEG(firstpage.src, 0.5);
            doc.addImage(coverBase64, "JPEG", 0, 0, pageWidth, pageHeight);
          } catch (error) {
            console.error("Error loading cover page:", error);
          }
        };

        // -----------------------------
        // Helper: Add letterhead
        // -----------------------------
        const addLetterhead = async () => {
          try {
            const letterheadBase64 = await loadImageAsCompressedJPEG(letterhead.src, 0.5);
            doc.addImage(letterheadBase64, "JPEG", 0, 0, pageWidth, pageHeight);
          } catch (error) {
            console.error("Error loading letterhead:", error);
          }
        };

        // -----------------------------
        // Helper: Add patient info
        // -----------------------------
        const addHeader = () => {
          const leftLineHeight = 7;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);

          // Left side details (all in uppercase)
          const leftX = leftMargin;
          let yLeft = 50;
          doc.text(`PATIENT NAME: ${data.name}`.toUpperCase(), leftX, yLeft);
          yLeft += leftLineHeight;
          doc.text(`AGE/SEX: ${data.age} / ${data.gender}`.toUpperCase(), leftX, yLeft);
          yLeft += leftLineHeight;
          doc.text(`REF. DOCTOR: ${data.doctorName || "-"}`.toUpperCase(), leftX, yLeft);
          yLeft += leftLineHeight;
          doc.text(`HOSPITAL: ${data.hospitalName || "-"}`.toUpperCase(), leftX, yLeft);

          // Right side details (all in uppercase)
          const rightX = pageWidth - leftMargin;
          const rightY = 50;
          doc.text(`PATIENT ID: ${data.patientId}`.toUpperCase(), rightX, rightY, {
            align: "right",
          });
          doc.text(
            `REGISTRATION ON: ${new Date(data.createdAt).toLocaleString()}`.toUpperCase(),
            rightX,
            rightY + leftLineHeight,
            { align: "right" }
          );
          const sampledOn = data.sampleCollectedAt
            ? new Date(data.sampleCollectedAt).toLocaleString()
            : new Date(data.createdAt).toLocaleString();
          doc.text(`SAMPLED ON: ${sampledOn}`.toUpperCase(), rightX, rightY + leftLineHeight * 2, {
            align: "right",
          });
          doc.text(`REPORTED ON: ${new Date().toLocaleString()}`.toUpperCase(), rightX, rightY + leftLineHeight * 3, {
            align: "right",
          });

          return Math.max(yLeft, rightY + leftLineHeight * 3) + 10;
        };

        // Add cover page first
        await addCoverPage();

        // This variable tracks the current vertical position for each page
        let yPosition = 0;

        // -----------------------------
        // Helper: Print a single parameter row
        // -----------------------------
        const printParameterRow = (param: Parameter) => {
          // (No need to check param.visibility here, we already removed hidden)

          // 1) Determine normal range string
          let rangeStr = "";
          if (typeof param.range === "string") {
            rangeStr = param.range;
          } else {
            const arr = param.range[patientGender as keyof typeof param.range] || [];
            for (const r of arr) {
              const { lower, upper } = parseRangeKey(r.rangeKey);
              if (patientAgeInDays >= lower && patientAgeInDays <= upper) {
                rangeStr = r.rangeValue;
                break;
              }
            }
            if (!rangeStr && arr.length > 0) {
              rangeStr = arr[arr.length - 1].rangeValue;
            }
          }

          // Replace "/n" with actual newlines in the range
          if (rangeStr.includes("/n")) {
            rangeStr = rangeStr.replaceAll("/n", "\n");
          }

          // 2) Check if param.value is out of range if rangeStr is numeric
          let isOutOfRange = false;
          let outOfRangeLabel: "" | "H" | "L" = "";
          const numericRange = parseNumericRangeString(rangeStr);
          const numericValue = parseFloat(String(param.value));

          if (numericRange && !isNaN(numericValue)) {
            const { lower, upper } = numericRange;
            if (numericValue < lower) {
              isOutOfRange = true;
              outOfRangeLabel = "L";
            } else if (numericValue > upper) {
              isOutOfRange = true;
              outOfRangeLabel = "H";
            }
          }

          const valStr = param.value !== "" ? String(param.value) + outOfRangeLabel : "-";

          // Calculate wrapped lines for each column cell
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(0, 0, 0);

          const nameLines = doc.splitTextToSize(param.name, paramColWidth - 4);
          const valueLines = doc.splitTextToSize(valStr, valueColWidth - 4);
          const rangeLines = doc.splitTextToSize(rangeStr, rangeColWidth - 4);
          const unitLines = doc.splitTextToSize(param.unit, unitColWidth - 4);

          // The max number of lines needed among the 4 columns
          const maxLines = Math.max(
            nameLines.length,
            valueLines.length,
            rangeLines.length,
            unitLines.length
          );

          // Print each cell
          doc.text(nameLines, col1X + 2, yPosition + 4);

          if (isOutOfRange) {
            doc.setFont("helvetica", "bold");
          }
          doc.text(valueLines, col2X + valueColWidth / 2, yPosition + 4, {
            align: "center",
          });
          doc.setFont("helvetica", "normal");

          doc.text(rangeLines, col3X + rangeColWidth / 2, yPosition + 4, {
            align: "center",
          });
          doc.text(unitLines, col4X + unitColWidth / 2, yPosition + 4, {
            align: "center",
          });

          // Move y-position by however many lines we used
          yPosition += maxLines * lineHeight;

          // 4) Subparameters (we’ve already filtered hidden ones out)
          if (param.subparameters && param.subparameters.length > 0) {
            for (const sp of param.subparameters) {
              doc.setFontSize(8);
              doc.setTextColor(80, 80, 80);

              let subRangeStr = "";
              if (typeof sp.range === "string") {
                subRangeStr = sp.range;
              } else {
                const arr = sp.range[patientGender as keyof typeof sp.range] || [];
                for (const sr of arr) {
                  const { lower, upper } = parseRangeKey(sr.rangeKey);
                  if (patientAgeInDays >= lower && patientAgeInDays <= upper) {
                    subRangeStr = sr.rangeValue;
                    break;
                  }
                }
                if (!subRangeStr && arr.length > 0) {
                  subRangeStr = arr[arr.length - 1].rangeValue;
                }
              }

              if (subRangeStr.includes("/n")) {
                subRangeStr = subRangeStr.replaceAll("/n", "\n");
              }

              let isSubOutOfRange = false;
              let subOutOfRangeLabel: "" | "H" | "L" = "";
              const numericRange2 = parseNumericRangeString(subRangeStr);
              const numericValue2 = parseFloat(String(sp.value));
              if (numericRange2 && !isNaN(numericValue2)) {
                const { lower, upper } = numericRange2;
                if (numericValue2 < lower) {
                  isSubOutOfRange = true;
                  subOutOfRangeLabel = "L";
                } else if (numericValue2 > upper) {
                  isSubOutOfRange = true;
                  subOutOfRangeLabel = "H";
                }
              }

              const subValStr = sp.value !== "" ? String(sp.value) + subOutOfRangeLabel : "-";
              const subName = " - " + sp.name;

              // Calculate wrapped lines
              doc.setFont("helvetica", "normal");
              const subNameLines = doc.splitTextToSize(subName, paramColWidth - 4);
              const subValueLines = doc.splitTextToSize(subValStr, valueColWidth - 4);
              const subRangeLines = doc.splitTextToSize(subRangeStr, rangeColWidth - 4);
              const subUnitLines = doc.splitTextToSize(sp.unit, unitColWidth - 4);

              const subMaxLines = Math.max(
                subNameLines.length,
                subValueLines.length,
                subRangeLines.length,
                subUnitLines.length
              );

              // Print subparameter row
              doc.text(subNameLines, col1X + 4, yPosition + 4);
              if (isSubOutOfRange) {
                doc.setFont("helvetica", "bold");
              }
              doc.text(subValueLines, col2X + valueColWidth / 2, yPosition + 4, {
                align: "center",
              });
              doc.setFont("helvetica", "normal");

              doc.text(subRangeLines, col3X + rangeColWidth / 2, yPosition + 4, {
                align: "center",
              });
              doc.text(subUnitLines, col4X + unitColWidth / 2, yPosition + 4, {
                align: "center",
              });

              yPosition += subMaxLines * lineHeight;
            }
          }
        };

        // 5. Now generate the PDF pages from the filtered data
        const { bloodtest } = data;
        // If no tests remain after filtering, we won't have pages
        if (!bloodtest || Object.keys(bloodtest).length === 0) {
          alert("No in-house test or visible parameters to display.");
          return;
        }

        // Add cover page first
        // (We already did, but if you want the letterhead on the second page, that's fine.)

        for (const testKey in bloodtest) {
          const testData = bloodtest[testKey];
          // Skip if it's an outsourced test or no parameters
          if (testData.type === "outsource" || !testData.parameters?.length) {
            continue;
          }

          // Start a new page for each test (after cover)
          doc.addPage();
          await addLetterhead();
          yPosition = addHeader();

          // Horizontal line under header
          doc.setDrawColor(0, 51, 102);
          doc.setLineWidth(0.5);
          doc.line(leftMargin, 76, pageWidth - leftMargin, 76);

          // Test name (centered, bigger, bold)
          doc.setFont("helvetica", "bold");
          doc.setFontSize(13);
          doc.setTextColor(0, 51, 102);
          doc.text(testKey.replace(/_/g, " ").toUpperCase(), pageWidth / 2, yPosition, {
            align: "center",
          });
          yPosition += 2;

          // Table header (once per test):
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setFillColor(0, 51, 102);
          doc.rect(leftMargin, yPosition, totalTableWidth, 7, "F");
          doc.setTextColor(255, 255, 255);
          doc.text("PARAMETER", col1X + 2, yPosition + 5);
          doc.text("VALUE", col2X + valueColWidth / 2, yPosition + 5, {
            align: "center",
          });
          doc.text("RANGE", col3X + rangeColWidth / 2, yPosition + 5, {
            align: "center",
          });
          doc.text("UNIT", col4X + unitColWidth / 2, yPosition + 5, {
            align: "center",
          });

          yPosition += 9; // move below table header

          const { parameters, subheadings } = testData;
          const sub = subheadings || [];

          // Identify subheading param names
          const subheadingParamNames = sub.reduce<string[]>(
            (acc, sh) => acc.concat(sh.parameterNames),
            []
          );

          // Global params: those not in any subheading
          const globalParams = parameters.filter(
            (p) => !subheadingParamNames.includes(p.name)
          );

          // 6. Print global parameters
          for (const gp of globalParams) {
            printParameterRow(gp);
          }

          // 7. Print subheadings (if any)
          if (sub.length > 0) {
            for (const sh of sub) {
              // Find subheading parameters
              const subParams = parameters.filter((p) =>
                sh.parameterNames.includes(p.name)
              );

              if (subParams.length > 0) {
                // Subheading label
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.setTextColor(0, 51, 102);
                doc.text(sh.title, col1X, yPosition + 5);
                yPosition += 6;

                // Print each subheading parameter
                for (const sp of subParams) {
                  printParameterRow(sp);
                }
              }
            }
          }
        }

        // 8. Stamp on last page
        const stampWidth = 40;
        const stampHeight = 40;
        const stampX = pageWidth - leftMargin - stampWidth;
        const stampY = pageHeight - stampHeight - 30;
        const stampBase64 = await loadImageAsCompressedJPEG(stamp.src, 0.5);
        doc.addImage(stampBase64, "JPEG", stampX, stampY, stampWidth, stampHeight);

        // 9. Convert doc to blob
        const generatedBlob = doc.output("blob");
        setPdfBlob(generatedBlob);
      } catch (error) {
        console.error("Error generating report:", error);
        alert("Error generating report. Please try again.");
      }
    };

    generateReport();
  }, [patientId, router]);

  // Download PDF
  const downloadReport = () => {
    if (!pdfBlob || !patientData) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patientData.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Send PDF on WhatsApp
  const sendReportOnWhatsApp = async () => {
    if (!pdfBlob || !patientData) return;
    try {
      const storage = getStorage();
      const storageRefInstance = storageRef(storage, `reports/${patientData.name}.pdf`);
      const snapshot = await uploadBytes(storageRefInstance, pdfBlob);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // Replace with your valid token, phone number, etc.
      const token = "99583991572";
      const number = "91" + patientData.contact;
      const payload = {
        token,
        number,
        imageUrl: downloadURL,
        caption: `Dear ${patientData.name},\n\nYour blood test report is now available. Please click the link below to view/download.\n\n${downloadURL}\n\nThank you.\nYour Lab Team`,
      };

      const response = await fetch("https://wa.medblisss.com/send-image-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        alert("Report sent on WhatsApp successfully!");
      } else {
        const jsonResponse = await response.json();
        console.error("WhatsApp API Error:", jsonResponse);
        alert("Failed to send the report on WhatsApp. Check logs or token.");
      }
    } catch (error) {
      console.error("Error sending report on WhatsApp:", error);
      alert("Error sending report. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {pdfBlob && patientData ? (
          <div className="bg-white rounded-xl shadow-lg p-8 space-y-6 transition-all duration-300 hover:shadow-xl">
            <h2 className="text-3xl font-bold text-gray-800 text-center mb-6">
              Report Ready
            </h2>
            <button
              onClick={downloadReport}
              className="w-full flex items-center justify-center space-x-3 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-xl font-medium transition-all duration-300"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>Download PDF Report</span>
            </button>

            <button
              onClick={sendReportOnWhatsApp}
              className="w-full flex items-center justify-center space-x-3 px-6 py-4 rounded-xl font-medium transition-all duration-300 bg-[#25D366] hover:bg-[#128C7E] text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c0-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <span>Send via WhatsApp</span>
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              Report generated for {patientData.name}
            </p>
          </div>
        ) : (
          <div className="text-center bg-white p-8 rounded-xl shadow-lg">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
              <span className="text-gray-600 font-medium">
                Generating PDF Report...
              </span>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              This may take a few moments. Please don’t close this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DownloadReportPage() {
  return (
    <Suspense fallback={<div>Loading Report...</div>}>
      <DownloadReport />
    </Suspense>
  );
}
