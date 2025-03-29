"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { jsPDF } from "jspdf";
import { ref as dbRef, get } from "firebase/database";
import { database } from "../../firebase"; // Adjust path if needed
import { getAuth } from "firebase/auth";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

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
  visibility?: string;
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
  doctorName?: string;
  hospitalName?: string;
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

  const rangePart = key.replace(/[dmy]$/, "");
  const [lowStr, highStr] = rangePart.split("-");
  const lower = Number(lowStr) * multiplier || 0;
  const upper = Number(highStr) * multiplier || Infinity;
  return { lower, upper };
};

// -----------------------------
// Helper: Parse numeric range string (e.g., "1-20" or "up to 20")
// -----------------------------
const parseNumericRangeString = (rangeStr: string) => {
  const regexUp = /^\s*up\s*(?:to\s*)?([\d.]+)\s*$/i;
  const matchUp = rangeStr.match(regexUp);
  if (matchUp) {
    const upper = parseFloat(matchUp[1]);
    if (!isNaN(upper)) {
      return { lower: 1, upper };
    }
  }
  const regex = /^\s*([\d.]+)\s*(?:-|to)\s*([\d.]+)\s*$/i;
  const match = rangeStr.match(regex);
  if (match) {
    const lower = parseFloat(match[1]);
    const upper = parseFloat(match[2]);
    if (!isNaN(lower) && !isNaN(upper)) {
      return { lower, upper };
    }
  }
  return null;
};

export default function DownloadReportPage() {
  return (
    <Suspense fallback={<div>Loading Report...</div>}>
      <DownloadReport />
    </Suspense>
  );
}

function DownloadReport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");

  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [isSending, setIsSending] = useState(false);

  // -----------------------------
  // Fetch Patient Data
  // -----------------------------
  useEffect(() => {
    if (!patientId) return;

    const fetchData = async () => {
      try {
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
        data.bloodtest = filterOutHiddenParameters(data);
        setPatientData(data);
      } catch (err) {
        console.error("Error:", err);
        alert("Error fetching patient data. Please try again.");
      }
    };

    fetchData();
  }, [patientId, router]);

  // -----------------------------
  // Helper: Filter out hidden parameters
  // -----------------------------
  const filterOutHiddenParameters = (data: PatientData): Record<string, BloodTestData> => {
    const filtered: Record<string, BloodTestData> = {};
    if (!data.bloodtest) return {};

    for (const testKey in data.bloodtest) {
      const original = data.bloodtest[testKey];
      const newTest: BloodTestData = {
        ...original,
        parameters: original.parameters
          .filter((p) => p.visibility !== "hidden")
          .map((p) => ({
            ...p,
            subparameters: p.subparameters?.filter((sp) => sp.visibility !== "hidden") || [],
          })),
      };
      filtered[testKey] = newTest;
    }
    return filtered;
  };

  // -----------------------------
  // Main PDF Generation Function
  // Parameters:
  //    includeLetterhead: add letterhead if true
  //    skipCover: if true, do not add the cover page (front page)
  // -----------------------------
  const generatePDFReport = async (
    data: PatientData,
    includeLetterhead: boolean,
    skipCover: boolean
  ) => {
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const leftMargin = 30;

    // 4 columns: Parameter, Value, Range, Unit
    const totalTableWidth = pageWidth - 2 * leftMargin;
    const baseColWidth = totalTableWidth / 4.35; // parts: 1 + 1 + 1.35 + 1
    const paramColWidth = baseColWidth;
    const valueColWidth = baseColWidth;
    const rangeColWidth = 1.43 * baseColWidth;
    const unitColWidth = baseColWidth;

    const col1X = leftMargin;
    const col2X = col1X + paramColWidth;
    const col3X = col2X + valueColWidth;
    const col4X = col3X + rangeColWidth;

    const lineHeight = 6;
    const patientAgeInDays = data.total_day
      ? Number(data.total_day)
      : Number(data.age) * 365;
    const patientGender = data.gender?.toLowerCase() || "";

    // Get current user info
    const auth = getAuth();
    let loggedInUsername = auth.currentUser?.displayName || auth.currentUser?.email || "Unknown";
    if (loggedInUsername.endsWith("@gmail.com")) {
      loggedInUsername = loggedInUsername.replace("@gmail.com", "");
    }

    // -----------------------------
    // Helper: Add cover page (if needed)
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
    // Helper: Add letterhead (if needed)
    // -----------------------------
    const addLetterheadIfNeeded = async () => {
      if (!includeLetterhead) return;
      try {
        const letterheadBase64 = await loadImageAsCompressedJPEG(letterhead.src, 0.5);
        doc.addImage(letterheadBase64, "JPEG", 0, 0, pageWidth, pageHeight);
      } catch (error) {
        console.error("Error loading letterhead:", error);
      }
    };

    // -----------------------------
    // Helper: Add stamp and printed-by info
    // -----------------------------
    const addStampAndPrintedBy = async () => {
      const stampWidth = 30;
      const stampHeight = 30;
      const stampX = pageWidth - leftMargin - stampWidth;
      const stampY = pageHeight - stampHeight - 30;
      try {
        const stampBase64 = await loadImageAsCompressedJPEG(stamp.src, 0.5);
        doc.addImage(stampBase64, "JPEG", stampX, stampY, stampWidth, stampHeight);
      } catch (error) {
        console.error("Error loading stamp:", error);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Printed by", leftMargin, stampY + stampHeight - 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(loggedInUsername, leftMargin, stampY + stampHeight - 4);
    };

    // -----------------------------
    // Helper: Add patient header info
    // -----------------------------
    const addHeader = () => {
      const lineGap = 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);

      const leftX = leftMargin;
      let yLeft = 50;
      doc.text(`PATIENT NAME: ${data.name}`.toUpperCase(), leftX, yLeft);
      yLeft += lineGap;
      doc.text(`AGE/SEX: ${data.age} / ${data.gender}`.toUpperCase(), leftX, yLeft);
      yLeft += lineGap;
      doc.text(`REF. DOCTOR: ${data.doctorName || "-"}`.toUpperCase(), leftX, yLeft);
      yLeft += lineGap;
      doc.text(`CENTER: ${data.hospitalName || "-"}`.toUpperCase(), leftX, yLeft);

      // Right side info
      const rightX = pageWidth - leftMargin;
      const rightY = 50;
      doc.text(`PATIENT ID: ${data.patientId}`.toUpperCase(), rightX, rightY, { align: "right" });
      doc.text(
        `REGISTRATION ON: ${new Date(data.createdAt).toLocaleString()}`.toUpperCase(),
        rightX,
        rightY + lineGap,
        { align: "right" }
      );
      const sampledOn = data.sampleCollectedAt
        ? new Date(data.sampleCollectedAt).toLocaleString()
        : new Date(data.createdAt).toLocaleString();
      doc.text(`SAMPLED ON: ${sampledOn}`.toUpperCase(), rightX, rightY + 2 * lineGap, {
        align: "right",
      });
      doc.text(
        `REPORTED ON: ${new Date().toLocaleString()}`.toUpperCase(),
        rightX,
        rightY + 3 * lineGap,
        { align: "right" }
      );
      return Math.max(yLeft, rightY + 3 * lineGap) + 10;
    };

    // -----------------------------
    // Print a test's parameter row
    // -----------------------------
    let yPosition = 0;
    const printParameterRow = (param: Parameter) => {
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
      if (rangeStr.includes("/n")) {
        rangeStr = rangeStr.replaceAll("/n", "\n");
      }

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
      const valStr = param.value !== "" ? `${param.value}${outOfRangeLabel}` : "-";

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);

      const nameLines = doc.splitTextToSize(param.name, paramColWidth - 4);
      const valueLines = doc.splitTextToSize(valStr, valueColWidth - 4);
      const rangeLines = doc.splitTextToSize(rangeStr, rangeColWidth - 4);
      const unitLines = doc.splitTextToSize(param.unit, unitColWidth - 4);
      const maxLines = Math.max(nameLines.length, valueLines.length, rangeLines.length, unitLines.length);

      doc.text(nameLines, col1X + 2, yPosition + 4);
      if (isOutOfRange) {
        doc.setFont("helvetica", "bold");
      }
      doc.text(valueLines, col2X + valueColWidth / 2, yPosition + 4, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text(rangeLines, col3X + rangeColWidth / 2, yPosition + 4, { align: "center" });
      doc.text(unitLines, col4X + unitColWidth / 2, yPosition + 4, { align: "center" });
      yPosition += maxLines * lineHeight;

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
          const subValStr = sp.value !== "" ? `${sp.value}${subOutOfRangeLabel}` : "-";
          const subName = " - " + sp.name;

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

          doc.text(subNameLines, col1X + 4, yPosition + 4);
          if (isSubOutOfRange) {
            doc.setFont("helvetica", "bold");
          }
          doc.text(subValueLines, col2X + valueColWidth / 2, yPosition + 4, { align: "center" });
          doc.setFont("helvetica", "normal");
          doc.text(subRangeLines, col3X + rangeColWidth / 2, yPosition + 4, { align: "center" });
          doc.text(subUnitLines, col4X + unitColWidth / 2, yPosition + 4, { align: "center" });
          yPosition += subMaxLines * lineHeight;
        }
      }
    };

    // -----------------------------
    // Build the PDF
    // -----------------------------
    // If skipCover is false, add a cover page (e.g., for WhatsApp)
    if (!skipCover) {
      await addCoverPage();
    }

    // Retrieve tests
    const { bloodtest } = data;
    if (!bloodtest) return doc.output("blob");

    let firstTest = true;
    for (const testKey in bloodtest) {
      const testData = bloodtest[testKey];
      if (testData.type === "outsource" || !testData.parameters?.length) continue;
      // For the first test in skipCover mode, use the existing first page; otherwise, add a new page.
      if (skipCover) {
        if (!firstTest) {
          doc.addPage();
        }
      } else {
        doc.addPage();
      }
      firstTest = false;

      await addLetterheadIfNeeded();
      yPosition = addHeader();
      doc.setDrawColor(0, 51, 102);
      doc.setLineWidth(0.5);
      doc.line(leftMargin, 76, pageWidth - leftMargin, 76);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(0, 51, 102);
      doc.text(testKey.replace(/_/g, " ").toUpperCase(), pageWidth / 2, yPosition, { align: "center" });
      yPosition += 2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setFillColor(0, 51, 102);
      const rowHeight = 7;
      doc.rect(leftMargin, yPosition, totalTableWidth, rowHeight, "F");
      doc.setTextColor(255, 255, 255);
      doc.text("PARAMETER", col1X + 2, yPosition + 5);
      doc.text("VALUE", col2X + valueColWidth / 2, yPosition + 5, { align: "center" });
      doc.text("RANGE", col3X + rangeColWidth / 2, yPosition + 5, { align: "center" });
      doc.text("UNIT", col4X + unitColWidth / 2, yPosition + 5, { align: "center" });
      yPosition += rowHeight + 2;

      const { parameters, subheadings } = testData;
      const sub = subheadings || [];
      const subheadingParamNames = sub.reduce<string[]>((acc, sh) => acc.concat(sh.parameterNames), []);
      const globalParams = parameters.filter((p) => !subheadingParamNames.includes(p.name));

      for (const gp of globalParams) {
        printParameterRow(gp);
      }

      if (sub.length > 0) {
        for (const sh of sub) {
          const subParams = parameters.filter((p) => sh.parameterNames.includes(p.name));
          if (subParams.length > 0) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(0, 51, 102);
            doc.text(sh.title, col1X, yPosition + 5);
            yPosition += 6;
            for (const sp of subParams) {
              printParameterRow(sp);
            }
          }
        }
      }
    }

    // Add stamp & printed-by info to every page
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      await addStampAndPrintedBy();
    }

    return doc.output("blob");
  };

  // -----------------------------
  // Action Handlers
  // -----------------------------
  // Download PDF with letterhead (no cover page)
  const downloadWithLetterhead = async () => {
    if (!patientData) return;
    try {
      const blob = await generatePDFReport(patientData, true, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${patientData.name}_with_letterhead.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Error generating PDF. Please try again.");
    }
  };

  // Download PDF without letterhead (no cover page)
  const downloadNoLetterhead = async () => {
    if (!patientData) return;
    try {
      const blob = await generatePDFReport(patientData, false, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${patientData.name}_no_letterhead.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Error generating PDF. Please try again.");
    }
  };

  // Preview PDF with letterhead (no cover page)
  const previewReport = async () => {
    if (!patientData) return;
    try {
      const blob = await generatePDFReport(patientData, true, true);
      const storage = getStorage();
      const sRef = storageRef(storage, `reports/preview/${patientData.name}_preview.pdf`);
      await uploadBytes(sRef, blob);
      const downloadURL = await getDownloadURL(sRef);
      window.open(downloadURL, "_blank");
    } catch (error) {
      console.error("Error previewing report:", error);
      alert("Error generating preview. Please try again.");
    }
  };

  // Preview PDF without letterhead (no cover page)
  const previewReportNoLetterhead = async () => {
    if (!patientData) return;
    try {
      const blob = await generatePDFReport(patientData, false, true);
      const storage = getStorage();
      const sRef = storageRef(storage, `reports/preview/${patientData.name}_preview_no_letterhead.pdf`);
      await uploadBytes(sRef, blob);
      const downloadURL = await getDownloadURL(sRef);
      window.open(downloadURL, "_blank");
    } catch (error) {
      console.error("Error previewing report without letterhead:", error);
      alert("Error generating preview. Please try again.");
    }
  };

  // Send on WhatsApp (includes cover page)
  const sendOnWhatsApp = async () => {
    if (!patientData) return;
    try {
      setIsSending(true);
      const blob = await generatePDFReport(patientData, true, false);
      const storage = getStorage();
      const sRef = storageRef(storage, `reports/${patientData.name}.pdf`);
      const snapshot = await uploadBytes(sRef, blob);
      const downloadURL = await getDownloadURL(snapshot.ref);

      const token = "99583991573";
      const number = "91" + patientData.contact;
      const payload = {
        token,
        number,
        imageUrl: downloadURL,
        caption: `Dear ${patientData.name},\n\nYour blood test report is now available:\n${downloadURL}\n\nRegards,\nYour Lab Team`,
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
      console.error("Error sending WhatsApp:", error);
      alert("Error sending report. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {patientData ? (
          <div className="bg-white rounded-xl shadow-lg p-8 space-y-6 transition-all duration-300 hover:shadow-xl">
            <h2 className="text-3xl font-bold text-gray-800 text-center mb-6">
              Report Ready
            </h2>

            {/* Download with Letterhead */}
            <button
              onClick={downloadWithLetterhead}
              className="w-full flex items-center justify-center space-x-3 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-xl font-medium transition-all duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download PDF (Letterhead)</span>
            </button>

            {/* Download without Letterhead */}
            <button
              onClick={downloadNoLetterhead}
              className="w-full flex items-center justify-center space-x-3 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-xl font-medium transition-all duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Download PDF (No Letterhead)</span>
            </button>

            {/* Preview with Letterhead */}
            <button
              onClick={previewReport}
              className="w-full flex items-center justify-center space-x-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-xl font-medium transition-all duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Preview PDF (Letterhead)</span>
            </button>

            {/* Preview without Letterhead */}
            <button
              onClick={previewReportNoLetterhead}
              className="w-full flex items-center justify-center space-x-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-xl font-medium transition-all duration-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Preview PDF (No Letterhead)</span>
            </button>

            {/* Send on WhatsApp (includes cover page) */}
            <button
              onClick={sendOnWhatsApp}
              disabled={isSending}
              className="w-full flex items-center justify-center space-x-3 px-6 py-4 rounded-xl font-medium transition-all duration-300 bg-[#25D366] hover:bg-[#128C7E] text-white"
            >
              {isSending ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c0-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/>
                  </svg>
                  <span>Send via WhatsApp</span>
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              Report generated for {patientData.name}
            </p>
          </div>
        ) : (
          <div className="text-center bg-white p-8 rounded-xl shadow-lg">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
              <span className="text-gray-600 font-medium">Fetching patient data...</span>
            </div>
            <p className="mt-4 text-sm text-gray-500">This may take a few moments. Please don’t close this page.</p>
          </div>
        )}
      </div>
    </div>
  );
}
