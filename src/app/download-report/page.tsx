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
import JsBarcode from "jsbarcode";

// Import images – adjust paths as needed
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
  // Range can either be a string or an object with arrays for male/female
  range: string | { male: AgeRangeItem[]; female: AgeRangeItem[] };
  subparameters?: Parameter[];
}

interface BloodTestData {
  parameters: Parameter[];
}

interface FirestoreBloodTestItem {
  testName: string;
  testId: string;
}

interface PatientData {
  name: string;
  age: string | number;
  gender: string;
  patientId: string;
  createdAt: string;
  contact: string;
  total_day?: string | number;
  bloodTests?: FirestoreBloodTestItem[];
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
// Helper: Parse rangeKey into numeric bounds (in days)
// -----------------------------
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

function DownloadReport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");

  // Prevent duplicate PDF generation
  const pdfGenerated = useRef(false);

  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!patientId || pdfGenerated.current) return;
    pdfGenerated.current = true;

    const fetchDataAndGenerateReport = async () => {
      try {
        // 1. Fetch patient data
        const patientRef = dbRef(database, `patients/${patientId}`);
        const snapshot = await get(patientRef);
        if (!snapshot.exists()) {
          alert("Patient not found");
          return;
        }
        const data = snapshot.val() as PatientData;
        setPatientData(data);
        if (!data.bloodtest) {
          alert("No report found for this patient.");
          return;
        }

        // 2. Compute patient age in days (use total_day if available)
        const patientAgeInDays = data.total_day
          ? Number(data.total_day)
          : Number(data.age) * 365;
        const patientGender = data.gender ? data.gender.toLowerCase() : "";

        // 3. Create PDF document
        const doc = new jsPDF("p", "mm", "a4");
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const leftMargin = 30;

        // --- TABLE COLUMNS SETUP ---
        const totalTableWidth = pageWidth - 2 * leftMargin;
        const colWidth = totalTableWidth / 4;
        const col1X = leftMargin;
        const col2X = leftMargin + colWidth;
        const col3X = leftMargin + 2 * colWidth;
        const col4X = leftMargin + 3 * colWidth;

        // Helper: Add cover page
        const addCoverPage = async () => {
          try {
            const coverBase64 = await loadImageAsCompressedJPEG(firstpage.src, 0.5);
            doc.addImage(coverBase64 as string, "JPEG", 0, 0, pageWidth, pageHeight);
          } catch (error) {
            console.error("Error loading cover page:", error);
          }
        };

        // Helper: Add letterhead
        const addLetterhead = async () => {
          try {
            const letterheadBase64 = await loadImageAsCompressedJPEG(letterhead.src, 0.5);
            doc.addImage(letterheadBase64 as string, "JPEG", 0, 0, pageWidth, pageHeight);
          } catch (error) {
            console.error("Error loading letterhead:", error);
          }
        };

        // Helper: Add header with patient details
        const addHeader = () => {
          let y = 50;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.setTextColor(0, 0, 0);
          // Left side header
          doc.text(`Name: ${data.name}`, leftMargin, y);
          y += 7;
          doc.text(`Age: ${data.age}`, leftMargin, y);
          y += 7;
          doc.text(`Gender: ${data.gender}`, leftMargin, y);
          // Right side header
          doc.text(
            `Registration On: ${new Date(data.createdAt).toLocaleString()}`,
            pageWidth - leftMargin,
            50,
            { align: "right" }
          );
          doc.text(
            `Reported On: ${new Date().toLocaleString()}`,
            pageWidth - leftMargin,
            57,
            { align: "right" }
          );
          doc.text(`Patient ID: ${data.patientId}`, pageWidth - leftMargin, 64, {
            align: "right",
          });
          return Math.max(y, 74) + 10;
        };

        // 4. Create cover page
        await addCoverPage();

        // 5. Loop over each test (one test per page)
        const bloodtest = data.bloodtest;
        for (const testKey in bloodtest) {
          doc.addPage();
          await addLetterhead();
          let yPosition = addHeader();

          // Generate barcode
          const canvas = document.createElement("canvas");
          JsBarcode(canvas, patientId || "", {
            format: "CODE128",
            displayValue: false,
            fontSize: 14,
            width: 2,
            height: 40,
          });
          const barcodeDataUrl = canvas.toDataURL("image/png");
          const barcodeWidth = 30;
          const barcodeHeight = 10;
          const barcodeY = 65;
          doc.addImage(
            barcodeDataUrl as string,
            "PNG",
            pageWidth - leftMargin - barcodeWidth,
            barcodeY,
            barcodeWidth,
            barcodeHeight
          );
          yPosition = Math.max(yPosition, barcodeY + barcodeHeight + 1);

          // Horizontal line under header
          doc.setDrawColor(0, 51, 102);
          doc.setLineWidth(0.5);
          doc.line(leftMargin, 76, pageWidth - leftMargin, 76);
          yPosition += 1;

          // Test title
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.setTextColor(0, 51, 102);
          doc.text(` ${testKey.toUpperCase()}`, leftMargin, yPosition);
          yPosition += 4;

          // --- TABLE HEADER ---
          doc.setFillColor(0, 51, 102);
          doc.rect(leftMargin, yPosition, totalTableWidth, 6, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8);
          doc.text("Parameter", col1X + 2, yPosition + 5);
          doc.text("Value", col2X + colWidth / 2, yPosition + 5, { align: "center" });
          doc.text("Range", col4X + colWidth / 2, yPosition + 5, { align: "center" });
          doc.text("Unit", col3X + colWidth / 2, yPosition + 5, { align: "center" });
          
          yPosition += 6 + 3; // header height plus spacing

          // Set default font for rows
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(0, 0, 0);

          const parameters = bloodtest[testKey].parameters;

          for (const param of parameters) {
            // Determine normal range string
            let rangeStr = "";
            if (typeof param.range === "string") {
              rangeStr = param.range;
            } else {
              const ranges = (param.range && param.range[patientGender as keyof typeof param.range]) || [];
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
            }

            // Print parameter row with four columns
            doc.text(param.name, col1X + 2, yPosition + 4);
            const valueStr = param.value !== "" ? String(param.value) : "-";
            doc.text(valueStr, col2X + colWidth / 2, yPosition + 4, { align: "center" });
            doc.text(param.unit, col3X + colWidth / 2, yPosition + 4, { align: "center" });
            doc.text(rangeStr, col4X + colWidth / 2, yPosition + 4, { align: "center" });
            yPosition += 8;

            // Process subparameters if present
            if (param.subparameters && param.subparameters.length > 0) {
              for (const subParam of param.subparameters) {
                let subRangeStr = "";
                if (typeof subParam.range === "string") {
                  subRangeStr = subParam.range;
                } else {
                  const subRanges = (subParam.range && subParam.range[patientGender as keyof typeof subParam.range]) || [];
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
                }
                const subIndent = col1X + 4;
                doc.setFont("helvetica", "normal");
                doc.setFontSize(6);
                doc.text(subParam.name, subIndent, yPosition + 4);
                const subValueStr = subParam.value !== "" ? String(subParam.value) : "-";
                doc.text(subValueStr, col2X + colWidth / 2, yPosition + 4, { align: "center" });
                doc.text(subParam.unit, col3X + colWidth / 2, yPosition + 4, { align: "center" });
                doc.text(subRangeStr, col4X + colWidth / 2, yPosition + 4, { align: "center" });
                yPosition += 8;
              }
            }
          }
        }

        // 8. Add stamp/footer on the last page
        const stampWidth = 40;
        const stampHeight = 40;
        const stampX = pageWidth - leftMargin - stampWidth;
        const stampY = pageHeight - stampHeight - 30;
        const stampBase64 = await loadImageAsCompressedJPEG(stamp.src, 0.5);
        doc.addImage(stampBase64 as string, "JPEG", stampX, stampY, stampWidth, stampHeight);

        // 9. Convert PDF to Blob and update state
        const generatedPdfBlob = doc.output("blob");
        setPdfBlob(generatedPdfBlob);
      } catch (error) {
        console.error("Error generating report:", error);
        alert("Error generating report. Please try again.");
      }
    };

    fetchDataAndGenerateReport();
  }, [patientId, router]);

  // Download PDF report
  const downloadReport = () => {
    if (!pdfBlob || !patientData) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patientData.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Send PDF report via WhatsApp
  const sendReportOnWhatsApp = async () => {
    if (!pdfBlob || !patientData) return;
    setIsSending(true);
    try {
      const storage = getStorage();
      const storageRefInstance = storageRef(storage, `reports/${patientData.name}.pdf`);
      const snapshot = await uploadBytes(storageRefInstance, pdfBlob);
      const downloadURL = await getDownloadURL(snapshot.ref);
      const token = "99583991572"; // Adjust as needed
      const contact = patientData.contact;
      const number = "91" + contact;
      const payload = {
        token,
        number,
        imageUrl: downloadURL,
        caption: `Dear ${patientData.name},\n\nYour blood test report is now available. Please click the link below to view/download.\n\nReport URL: ${downloadURL}\n\nThank you for choosing our services.\n\nRegards,\nMEDFORD Team`,
      };
      const response = await fetch("https://wa.medblisss.com/send-image-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const jsonResponse = await response.json();
      if (response.ok) {
        alert("Report sent on WhatsApp successfully!");
      } else {
        console.error("WhatsApp API Error:", jsonResponse);
        alert("Failed to send the report on WhatsApp. Check logs or token.");
      }
    } catch (error) {
      console.error("Error sending report:", error);
      alert("Error sending report. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {pdfBlob && patientData ? (
          <div className="bg-white rounded-xl shadow-lg p-8 space-y-6 transition-all duration-300 hover:shadow-xl">
            <div className="space-y-4">
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
                disabled={isSending}
                className={`w-full flex items-center justify-center space-x-3 px-6 py-4 rounded-xl font-medium transition-all duration-300 ${
                  isSending
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-[#25D366] hover:bg-[#128C7E] text-white"
                }`}
              >
                {isSending ? (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="animate-spin h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v4m0 0v4m0-4h4m-4 0H8m6.364 2.364l-2.828 2.828m0 0l-2.828-2.828m2.828 2.828V12"
                      />
                    </svg>
                    <span>Sending on WhatsApp...</span>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </button>
            </div>
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
