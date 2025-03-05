"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { jsPDF } from "jspdf";
import { ref as dbRef, get } from "firebase/database";
import { database } from "../../firebase"; // Adjust path to your firebase.ts if needed
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import letterhead from "../../../public/letterhead.png";
import firstpage from "../../../public/fisrt.png";
import stamp from "../../../public/stamp.png";
import JsBarcode from "jsbarcode";

// ====================
// Helper: Compress image as JPEG
// ====================
const loadImageAsCompressedJPEG = async (
  url: string,
  quality: number = 0.5
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

function DownloadReport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get("patientId");

  // To prevent duplicate PDF generation
  const pdfGenerated = useRef(false);

  const [patientData, setPatientData] = useState<any>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isSending, setIsSending] = useState(false);

  // ====================
  // Fetch data & Generate PDF
  // ====================
  useEffect(() => {
    if (!patientId || pdfGenerated.current) {
      return;
    }
    pdfGenerated.current = true;

    const fetchDataAndGenerateReport = async () => {
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

        // 2. Check if there's any `bloodtest` data
        if (!data.bloodtest) {
          alert("No report found for this patient.");
          return;
        }

        // 3. Create PDF doc
        const doc = new jsPDF("p", "mm", "a4");
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Helper to add cover page
        const addCoverPage = async () => {
          try {
            const coverBase64 = await loadImageAsCompressedJPEG(firstpage.src, 0.5);
            doc.addImage(coverBase64, "JPEG", 0, 0, pageWidth, pageHeight);
          } catch (error) {
            console.error("Error loading cover page template:", error);
          }
        };

        // Helper to add letterhead to each content page
        const addLetterhead = async () => {
          try {
            const letterheadBase64 = await loadImageAsCompressedJPEG(letterhead.src, 0.5);
            doc.addImage(letterheadBase64, "JPEG", 0, 0, pageWidth, pageHeight);
          } catch (error) {
            console.error("Error loading letterhead image:", error);
          }
        };

        // 4. Add cover page
        await addCoverPage();

        // 5. Add next page (with letterhead) for the actual report content
        doc.addPage();
        await addLetterhead();

        // Some coordinates for text positioning
        const leftMargin = 30;
        const topMargin = 30;
        let yPosition = topMargin;

        // 6. Header info
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(0, 51, 102);
        yPosition += 12;

        // Switch font for details
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);

        // Basic info
        if (data.name) {
          doc.text(`Name: ${data.name}`, leftMargin, yPosition);
          yPosition += 7;
        }
        if (data.contact) {
          doc.text(`Contact: ${data.contact}`, leftMargin, yPosition);
          yPosition += 7;
        }
        const currentDate = new Date().toLocaleDateString();
        doc.text(`Date: ${currentDate}`, pageWidth - leftMargin, topMargin + 12, {
          align: "right",
        });

        // 7. Generate Barcode from patientId
        const canvas = document.createElement("canvas");
        JsBarcode(canvas, patientId, {
          format: "CODE128",
          displayValue: false,
          fontSize: 14,
          width: 2,
          height: 40,
          margin: 10,
        });
        const barcodeDataUrl = canvas.toDataURL("image/png");
        const barcodeWidth = 40;
        const barcodeHeight = 15;
        const barcodeY = topMargin + 20;
        doc.addImage(
          barcodeDataUrl,
          "PNG",
          pageWidth - leftMargin - barcodeWidth,
          barcodeY,
          barcodeWidth,
          barcodeHeight
        );
        yPosition = Math.max(yPosition, barcodeY + barcodeHeight + 10);

        // Horizontal line
        doc.setDrawColor(0, 51, 102);
        doc.setLineWidth(0.5);
        doc.line(leftMargin, yPosition, pageWidth - leftMargin, yPosition);
        yPosition += 10;

        // 8. Loop over each test in `data.bloodtest`
        for (const testKey in data.bloodtest) {
          const test = data.bloodtest[testKey];

          // Check if we need a fresh page
          if (yPosition > pageHeight - 50) {
            doc.addPage();
            await addLetterhead();
            yPosition = 40;
          }

          // Test title
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.setTextColor(0, 51, 102);
          doc.text(` ${testKey.toUpperCase()}`, leftMargin, yPosition);
          yPosition += 8;

          // Table header (smaller)
          const col1X = leftMargin;
          const col2X = pageWidth / 2;
          const col3X = pageWidth - leftMargin;
          const headerHeight = 6; // reduced header height

          // Possibly add new page if needed
          if (yPosition + headerHeight > pageHeight - 50) {
            doc.addPage();
            await addLetterhead();
            yPosition = 40;
          }

          // Header color background
          doc.setFillColor(0, 51, 102);
          doc.rect(leftMargin, yPosition, pageWidth - 2 * leftMargin, headerHeight, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10); // smaller header font
          doc.text("Parameter", col1X + 2, yPosition + headerHeight - 2);
          doc.text("Value", col2X, yPosition + headerHeight - 2, { align: "center" });
          doc.text("Unit", col3X - 2, yPosition + headerHeight - 2, { align: "right" });
          yPosition += headerHeight + 3; // reduced gap

          // Table rows (smaller content)
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9); // smaller font for parameter rows
          doc.setTextColor(0, 0, 0);

          // Each parameter row
          for (const param of test.parameters) {
            if (yPosition > pageHeight - 50) {
              doc.addPage();
              await addLetterhead();
              yPosition = 40;
            }
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.1);
            doc.line(leftMargin, yPosition, pageWidth - leftMargin, yPosition);

            // Parameter name
            doc.text(param.name, col1X + 2, yPosition + 4);

            // Parameter value
            const valueStr = param.value !== "" ? String(param.value) : "-";
            let valueColor: [number, number, number] = [0, 0, 0];

            const valueNum = parseFloat(param.value);
            // If the value is outside normal range, show in red
            if (param.value !== "" && !isNaN(valueNum)) {
              if (valueNum < param.normalRangeStart || valueNum > param.normalRangeEnd) {
                valueColor = [255, 0, 0];
              }
            }
            doc.setTextColor(...valueColor);
            doc.text(valueStr, col2X, yPosition + 4, { align: "center" });

            // Parameter unit
            doc.setTextColor(0, 0, 0);
            doc.text(param.unit, col3X - 2, yPosition + 4, { align: "right" });
            yPosition += 8; // reduced row height

            // Normal range (smaller font)
            doc.setTextColor(80, 80, 80);
            doc.setFontSize(8);
            const normalRangeText = `Normal Range: ${param.normalRangeStart} - ${param.normalRangeEnd}`;
            doc.text(normalRangeText, col1X + 2, yPosition);
            yPosition += 3; // less gap

            // Quick range graph using modern progress bar design (smaller graph)
            const graphWidth = 80;
            const graphHeight = 6; // smaller graph height
            const graphX = col1X + 2;
            const graphY = yPosition;

            // Draw a background bar with rounded corners
            doc.setFillColor(230, 230, 230); // light grey background
            doc.roundedRect(graphX, graphY, graphWidth, graphHeight, 2, 2, "F");

            // Calculate the relative fill based on the parameter's normal range
            const minRange = param.normalRangeStart;
            const maxRange = param.normalRangeEnd;
            let relative = 0;
            if (!isNaN(valueNum)) {
              const clampedValue = Math.min(Math.max(valueNum, minRange), maxRange);
              relative = (clampedValue - minRange) / (maxRange - minRange);
            }
            const filledWidth = relative * graphWidth;

            // Choose the fill color based on whether the value is normal or abnormal
            if (valueNum < minRange || valueNum > maxRange) {
              doc.setFillColor(244, 67, 54); // red for abnormal values
            } else {
              doc.setFillColor(76, 175, 80); // green for normal values
            }

            // Draw the filled portion with rounded corners
            doc.roundedRect(graphX, graphY, filledWidth, graphHeight, 2, 2, "F");

            // Draw a border around the entire graph
            doc.setDrawColor(150, 150, 150);
            doc.setLineWidth(0.2);
            doc.roundedRect(graphX, graphY, graphWidth, graphHeight, 2, 2, "S");

            yPosition += graphHeight + 3; // reduced spacing after graph

            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
          }
          yPosition += 10;
        }

        // 9. Stamp/Footer if needed
        if (yPosition > pageHeight - 50) {
          doc.addPage();
          await addLetterhead();
          yPosition = 40;
        }
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        const stampWidth = 60;
        const stampHeight = 60;
        const stampX = pageWidth - leftMargin - stampWidth;
        const stampY = pageHeight - stampHeight - 30;
        const stampBase64 = await loadImageAsCompressedJPEG(stamp.src, 0.5);
        doc.addImage(stampBase64, "JPEG", stampX, stampY, stampWidth, stampHeight);

        // 10. Convert to Blob for further usage (download or upload)
        const generatedPdfBlob = doc.output("blob");
        setPdfBlob(generatedPdfBlob);
      } catch (error) {
        console.error("Error generating report:", error);
        alert("Error generating report. Please try again.");
      }
    };

    fetchDataAndGenerateReport();
  }, [patientId, router]);

  // ====================
  // Download PDF
  // ====================
  const downloadReport = () => {
    if (!pdfBlob || !patientData) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patientData.name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ====================
  // Send PDF to WhatsApp
  // ====================
  const sendReportOnWhatsApp = async () => {
    if (!pdfBlob || !patientData) return;
    setIsSending(true);

    try {
      // 1. Upload the PDF to Firebase Storage
      const storage = getStorage();
      const storageRefInstance = storageRef(storage, `reports/${patientData.name}.pdf`);
      const snapshot = await uploadBytes(storageRefInstance, pdfBlob);
      const downloadURL = await getDownloadURL(snapshot.ref);

      // 2. Build the WhatsApp message payload
      const token = "99583991572"; 
      const contact = patientData.contact; 
      const number = "91" + contact;

      const payload = {
        token,
        number,
        imageUrl: downloadURL,
        caption: `Dear ${patientData.name},\n\nYour blood test report is now available. Please click the link below to view/download.\n\nReport URL: ${downloadURL}\n\nThank you for choosing our services.\n\nRegards,\nMEDFORD Team`,
      };

      // 3. Send via your WhatsApp API endpoint
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

  // ====================
  // Render
  // ====================
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
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
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
              This may take a few moments. Please dont close this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ====================
// Suspense Wrapper (if needed)
// ====================
export default function DownloadReportPage() {
  return (
    <Suspense fallback={<div>Loading Report...</div>}>
      <DownloadReport />
    </Suspense>
  );
}
