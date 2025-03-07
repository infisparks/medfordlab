"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { jsPDF } from "jspdf";
import { ref as dbRef, get } from "firebase/database";
import { database } from "../../firebase"; // Adjust path if needed

function SimpleReport() {
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");
  const [patientData, setPatientData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    const fetchData = async () => {
      try {
        const patientRef = dbRef(database, `patients/${patientId}`);
        const snapshot = await get(patientRef);
        if (!snapshot.exists()) {
          alert("Patient not found");
          setLoading(false);
          return;
        }
        const data = snapshot.val();
        setPatientData(data);
      } catch (error) {
        console.error("Error fetching patient data:", error);
        alert("Error fetching patient data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [patientId]);

  const downloadSimpleReport = async () => {
    if (!patientData) return;
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const leftMargin = 15;
      let yPosition = 15;

      // For each test in bloodtest object
      for (const testKey in patientData.bloodtest) {
        // Check for page overflow
        if (yPosition + 50 > pageHeight) {
          doc.addPage();
          yPosition = 15;
        }
        // ─── PATIENT HEADER DETAILS (Swapped Columns) ─────────────────────────────
        // Swap the details:
        // Left column will now show originally "right" details:
        const leftColumnDetails = [
          `Patient ID: ${patientData.name || ""}`, // use dedicated id if available
          `Registration On: ${
            patientData.registrationOn
              ? new Date(patientData.registrationOn).toLocaleString()
              : ""
          }`,
          `Reported On: ${new Date().toLocaleString()}`,
          `Client Name: ${patientData.hospital || ""}`,
        ];
        // Right column will now show originally "left" details:
        const rightColumnDetails = [
          `Ref Doctor: ${patientData.doctorName || ""}`,
          `Patient Name: ${patientData.name || ""}`,
          `Age/Sex: ${patientData.age || ""} / ${patientData.gender || ""}`,
        ];

        // Print left column details (starting from leftMargin)
        let yLeft = yPosition;
        leftColumnDetails.forEach((line) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.text(line, leftMargin, yLeft);
          yLeft += 6;
        });
        // Print right column details (starting from pageWidth/2 + a small offset)
        let yRight = yPosition;
        const rightX = pageWidth / 2 + 5;
        rightColumnDetails.forEach((line) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.text(line, rightX, yRight);
          yRight += 6;
        });
        // Update yPosition to the lower of the two columns plus extra margin
        yPosition = Math.max(yLeft, yRight) + 5;

 // Add one extra line of spacing before drawing a separator line
        yPosition += 1;

        // ─── SEPARATOR LINE ─────────────────────────────
        doc.setLineWidth(0.5);
        doc.line(leftMargin, yPosition, pageWidth - leftMargin, yPosition);
        yPosition += 5;

        // ─── TABLE HEADER FOR PARAMETERS ─────────────────────────────
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Parameter", leftMargin, yPosition);
        doc.text("Observed Value", leftMargin + 50, yPosition);
        doc.text("Unit", leftMargin + 95, yPosition);
        doc.text("Ref. Range", leftMargin + 120, yPosition);
        yPosition += 6;


        // ─── SEPARATOR LINE ─────────────────────────────
        doc.setLineWidth(0.5);
        doc.line(leftMargin, yPosition, pageWidth - leftMargin, yPosition);
        yPosition += 5;

           // ─── TEST TITLE (Printed below patient details) ─────────────────────────────
           const formattedTestName = testKey.replace(/_/g, " ").toUpperCase();
           doc.setFont("helvetica", "bold");
           doc.setFontSize(10);
           doc.text(formattedTestName, pageWidth / 5.3, yPosition, { align: "center" });
           yPosition += 6;
   
        // ─── PARAMETERS DETAILS ─────────────────────────────
        const test = patientData.bloodtest[testKey];
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        for (const param of test.parameters) {
          if (yPosition > pageHeight - 20) {
            doc.addPage();
            yPosition = 15;
          }
          doc.text(param.name, leftMargin, yPosition);
          doc.text(param.value ? String(param.value) : "-", leftMargin + 50, yPosition);
          doc.text(param.unit, leftMargin + 95, yPosition);
          doc.text(param.range, leftMargin + 120, yPosition);
          yPosition += 7;
        }
        // Extra margin after each test block
        yPosition += 10;
      }

      // ─── DOWNLOAD THE PDF ─────────────────────────────
      const pdfBlob = doc.output("blob");
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${patientData.name}_SimpleReport.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating simple report:", error);
      alert("Error generating simple report. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading patient data...</p>
      </div>
    );
  }
  if (!patientData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>No patient data found.</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-3xl font-bold text-gray-800 text-center mb-6">
          Simple Report Ready
        </h2>
        <button
          onClick={downloadSimpleReport}
          className="w-full flex items-center justify-center space-x-3 bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-xl font-medium transition-all duration-300"
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
          <span>Download Simple PDF</span>
        </button>
        <p className="text-center text-sm text-gray-500">
          Report generated for {patientData.name}
        </p>
      </div>
    </div>
  );
}

export default function SimpleReportPage() {
  return <SimpleReport />;
}
