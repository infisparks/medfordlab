"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { jsPDF } from "jspdf";
import { ref as dbRef, get } from "firebase/database";
import { database } from "../../firebase";

const SimpleDownloadReport = () => {
  const [patientData, setPatientData] = useState(null);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");
  const pdfGenerated = useRef(false);

  useEffect(() => {
    if (!patientId || pdfGenerated.current) return;
    pdfGenerated.current = true;

    const fetchDataAndGenerateSimpleReport = async () => {
      try {
        // 1. Fetch patient data from Firebase
        const patientRef = dbRef(database, `patients/${patientId}`);
        const snapshot = await get(patientRef);
        if (!snapshot.exists()) {
          alert("Patient not found");
          return;
        }
        const data = snapshot.val();
        setPatientData(data);

        // 2. Create a simple PDF using jsPDF
        const doc = new jsPDF("p", "mm", "a4");
        const pageWidth = doc.internal.pageSize.getWidth();

        // Header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text("Patient Report", pageWidth / 2, 20, { align: "center" });

        // Patient details
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.text(`Name: ${data.name || "N/A"}`, 20, 40);
        doc.text(`Contact: ${data.contact || "N/A"}`, 20, 50);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 60);

        // Blood test data
        let yPosition = 75;
        if (data.bloodtest) {
          doc.setFont("helvetica", "bold");
          doc.text("Blood Test Results:", 20, yPosition);
          yPosition += 10;
          doc.setFont("helvetica", "normal");

          // Loop over each test in the bloodtest object
          for (const testKey in data.bloodtest) {
            const test = data.bloodtest[testKey];
            doc.setFont("helvetica", "bold");
            doc.text(`Test: ${testKey}`, 20, yPosition);
            yPosition += 7;
            doc.setFont("helvetica", "normal");

            // Loop through each parameter in the test
            if (test.parameters && Array.isArray(test.parameters)) {
              test.parameters.forEach((param) => {
                const value = param.value !== undefined && param.value !== ""
                  ? String(param.value)
                  : "-";
                doc.text(
                  `Parameter: ${param.name} | Value: ${value} | Unit: ${param.unit || ""}`,
                  30,
                  yPosition
                );
                yPosition += 7;
              });
            } else {
              doc.text("No parameters available.", 30, yPosition);
              yPosition += 7;
            }
            yPosition += 5;
            // Add new page if content overflows
            if (yPosition > 250) {
              doc.addPage();
              yPosition = 20;
            }
          }
        } else {
          doc.text("No blood test data available.", 20, yPosition);
        }

        // 3. Convert to Blob for download
        const generatedPdfBlob = doc.output("blob");
        setPdfBlob(generatedPdfBlob);
        setLoading(false);
      } catch (error) {
        console.error("Error generating simple report:", error);
        alert("Error generating simple report. Please try again.");
      }
    };

    fetchDataAndGenerateSimpleReport();
  }, [patientId]);

  const downloadPdf = () => {
    if (!pdfBlob || !patientData) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patientData.name || "patient"}_SimpleReport.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Generating Simple Report...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-md">
        <h2 className="text-2xl font-bold text-center mb-4">
          Simple PDF Report Ready
        </h2>
        <p className="mb-4 text-center">
          Report generated for {patientData.name || "Patient"}
        </p>
        <button
          onClick={downloadPdf}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
        >
          Download Simple PDF Report
        </button>
      </div>
    </div>
  );
};

export default SimpleDownloadReport;
