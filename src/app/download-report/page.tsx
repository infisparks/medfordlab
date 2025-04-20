"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { jsPDF } from "jspdf";
import { ref as dbRef, get } from "firebase/database";
import { database } from "../../firebase";                 // ← adjust if needed
import { getAuth } from "firebase/auth";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

// Import the graph report generator
import { generateGraphPDF } from "./graphrerport";          // ← Import the new function

// local images
import letterhead from "../../../public/letterhead.png";
import firstpage from "../../../public/first.png";
import stamp from "../../../public/stamp.png";

// -----------------------------
// Type Definitions (keep as is)
// -----------------------------
export interface AgeRangeItem {
  rangeKey: string;
  rangeValue: string;
}
export interface Parameter {
  name: string;
  value: string | number;
  unit: string;
  range: string | { male: AgeRangeItem[]; female: AgeRangeItem[] };
  subparameters?: Parameter[];
  visibility?: string;
  formula?: string;
}
export interface BloodTestData {
  parameters: Parameter[];
  subheadings?: { title: string; parameterNames: string[] }[];
  type?: string;      // e.g. "in‑house" | "outsource"
}
export interface PatientData {
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
// Helper: Compress image as JPEG (keep as is)
// -----------------------------
const loadImageAsCompressedJPEG = async (url: string, quality = 0.5) => {
  // ... (keep existing implementation)
  const res  = await fetch(url);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c   = document.createElement("canvas");
      c.width   = img.width;
      c.height  = img.height;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
};

// -----------------------------
// Helper functions (parseRangeKey, parseNumericRangeString) (keep as is)
// -----------------------------
const parseRangeKey = (key: string) => {
  // ... (keep existing implementation)
  key = key.trim();
  const suf = key.slice(-1);
  let mul    = 1;
  if (suf === "m") mul = 30;
  else if (suf === "y") mul = 365;
  const core = key.replace(/[dmy]$/, "");
  const [lo, hi] = core.split("-");
  return { lower: Number(lo) * mul || 0, upper: Number(hi) * mul || Infinity };
};

const parseNumericRangeString = (str: string) => {
    // ... (keep existing implementation)
  // ▸ “up to 12.5”  →  { lower: 0, upper: 12.5 }
  const up = /^\s*up\s*(?:to\s*)?([\d.]+)\s*$/i.exec(str);
  if (up) {
    const upper = parseFloat(up[1]);
    return isNaN(upper) ? null : { lower: 0, upper };    // ← changed 1 → 0
  }

  // ▸ “4‑7” or “4 to 7”  →  { lower: 4, upper: 7 }
  const m = /^\s*([\d.]+)\s*(?:-|to)\s*([\d.]+)\s*$/i.exec(str);
  if (!m) return null;
  const lower = parseFloat(m[1]), upper = parseFloat(m[2]);
  return isNaN(lower) || isNaN(upper) ? null : { lower, upper };
};


// -----------------------------
// Component
// -----------------------------
export default function DownloadReportPage() {
  return (
    <Suspense fallback={<div>Loading Report...</div>}>
      <DownloadReport />
    </Suspense>
  );
}

function DownloadReport() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const patientId    = searchParams.get("patientId");

  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [isSending,   setIsSending]   = useState(false);
  // --- NEW STATE for Graph Report Button ---
  const [isGeneratingGraph, setIsGeneratingGraph] = useState(false);

  // -----------------------------
  // Fetch patient (keep as is, including hideInvisible logic)
  // -----------------------------
   useEffect(() => {
     if (!patientId) return;

     (async () => {
       try {
         const snap = await get(dbRef(database, `patients/${patientId}`));
         if (!snap.exists()) return alert("Patient not found");

         const data = snap.val() as PatientData;
         if (!data.bloodtest) return alert("No report found.");
         data.bloodtest = hideInvisible(data); // Apply hiding logic
         setPatientData(data);
       } catch (e) {
         console.error(e); alert("Error fetching patient.");
       }
     })();
   }, [patientId, router]); // Removed hideInvisible from dependency array

   // Moved hideInvisible inside the component or define it outside if pure
   const hideInvisible = (d: PatientData): Record<string, BloodTestData> => {
     const out: Record<string, BloodTestData> = {};
     if (!d.bloodtest) return out;

     for (const k in d.bloodtest) {
       const t = d.bloodtest[k];

       // ← skip any outsourced tests entirely
       if (t.type === "outsource") continue;

       // ensure parameters is always an array
       const keptParams = Array.isArray(t.parameters)
         ? t.parameters
             .filter((p) => p.visibility !== "hidden")
             .map((p) => ({
               ...p,
               subparameters: Array.isArray(p.subparameters)
                 ? p.subparameters.filter((sp) => sp.visibility !== "hidden")
                 : [],
             }))
         : [];

       out[k] = {
         ...t,
         parameters: keptParams,
         // preserve subheadings if you want
         subheadings: t.subheadings,
       };
     }
     return out;
   };


  // -----------------------------
  // PDF builder (generatePDFReport - keep as is)
  // -----------------------------
  const generatePDFReport = async (
    data: PatientData,
    includeLetterhead: boolean,
    skipCover: boolean
  ) => {
    // ... (keep existing extensive implementation for the main report)
    const doc       = new jsPDF("p", "mm", "a4");
    const w         = doc.internal.pageSize.getWidth();
    const h         = doc.internal.pageSize.getHeight();
    const left      = 23;

    // column widths
    const totalW = w - 2 * left;
    const base   = totalW / 4;
    const wParam = base;
    const wValue = base;
    const wRange = 1.5 * base;
    const wUnit  = totalW - (wParam + wValue + wRange);

    const x1 = left;
    const x2 = x1 + wParam;
    const x3 = x2 + wValue +15 ;
    const x4 = x3 + wUnit;


    const lineH     = 5;
    const ageDays   = data.total_day ? Number(data.total_day) : Number(data.age) * 365;
    const genderKey = data.gender?.toLowerCase() ?? "";

    const auth      = getAuth();
    let printedBy   = auth.currentUser?.displayName || auth.currentUser?.email || "Unknown";
    if (printedBy.endsWith("@gmail.com")) printedBy = printedBy.replace("@gmail.com", "");

    // helpers ------------------------------------------------------
    const addCover = async () => {
      if (skipCover) return;
      try {
        const img = await loadImageAsCompressedJPEG(firstpage.src, .5);
        doc.addImage(img, "JPEG", 0, 0, w, h);
      } catch (e) { console.error(e); }
    };
    const addLetter = async () => {
      if (!includeLetterhead) return;
      try {
        const img = await loadImageAsCompressedJPEG(letterhead.src, .5);
        doc.addImage(img, "JPEG", 0, 0, w, h);
      } catch (e) { console.error(e); }
    };
    const addStamp = async () => {
      const sw = 40, sh = 30, sx = w - left - sw, sy = h - sh - 30;
      try {
        const img = await loadImageAsCompressedJPEG(stamp.src, .5);
        doc.addImage(img, "JPEG", sx, sy, sw, sh);
      } catch (e) { console.error(e); }
      doc.setFont("helvetica", "bold").setFontSize(10);
      doc.text("Printed by", left, sy + sh - 8);
      doc.setFont("helvetica", "normal").setFontSize(11);
      doc.text(printedBy, left, sy + sh - 4);
    };

    /** -------------------- HEADER (uniform – colon aligned) ------------------ */
    const headerY = () => {
      const gap = 7;
      let y = 50;

      doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0,0,0);

      const sampleDT = data.sampleCollectedAt
        ? new Date(data.sampleCollectedAt)
        : new Date(data.createdAt);

      // Left‑block and right‑block rows must have identical indices
      const leftRows  = [
        { label: "Patient Name", value: data.name.toUpperCase() },
        { label: "Age/Sex",      value: `${data.age} Years /${data.gender}` },
        { label: "Ref Doctor",   value: (data.doctorName   || "-").toUpperCase() },
        { label: "Client Name",  value: (data.hospitalName || "-").toUpperCase() },
      ];
      const rightRows = [
        { label: "Patient ID",          value: data.patientId },
        { label: "Sample Collected on", value: sampleDT.toLocaleString() },
        { label: "Registration On",     value: new Date(data.createdAt).toLocaleString() },
        { label: "Reported On",         value: new Date().toLocaleString() },
      ];

      // left column positions
      const maxLeftLabelWidth  = Math.max(...leftRows.map(r => doc.getTextWidth(r.label)));
      const xLeftLabel         = left;
      const xLeftColon         = xLeftLabel + maxLeftLabelWidth + 2;
      const xLeftValue         = xLeftColon + 2;

      // right column positions
      const startRight         = w / 2 + 10;                  // where right block begins
      const maxRightLabelWidth = Math.max(...rightRows.map(r => doc.getTextWidth(r.label)));
      const xRightLabel        = startRight;
      const xRightColon        = xRightLabel + maxRightLabelWidth + 2;
      const xRightValue        = xRightColon + 2;

      // draw rows
      for (let i = 0; i < leftRows.length; i++) {
        // left side
        doc.text(leftRows[i].label, xLeftLabel, y);
        doc.text(":",               xLeftColon, y);
        doc.text(leftRows[i].value, xLeftValue, y);

        // right side
        doc.text(rightRows[i].label, xRightLabel, y);
        doc.text(":",                xRightColon, y);
        doc.text(rightRows[i].value, xRightValue, y);

        y += gap -2;
      }
      return y + 0;
    };
    /** ------------------------------------------------------------------------ */

    // ----- core row printer (unchanged) -----------------------------
    let yPos = 0;
    const printRow = (p: Parameter, indent = 0) => {
      // build range string
      let rangeStr = "";
      if (typeof p.range === "string") {
        rangeStr = p.range;
      } else {
        const arr = p.range[genderKey as keyof typeof p.range] || [];
        for (const r of arr) {
          const { lower, upper } = parseRangeKey(r.rangeKey);
          if (ageDays >= lower && ageDays <= upper) { rangeStr = r.rangeValue; break; }
        }
        if (!rangeStr && arr.length) rangeStr = arr[arr.length-1].rangeValue;
      }
      rangeStr = rangeStr.replaceAll("/n", "\n");


      // ── normalize “up to X” and “A to B” into “0 – X” or “A – B” ──
{
  // if it’s “up to 1.2” or “UP - 1.2”, capture the upper bound
  const upMatch = /^\s*up\s*(?:to)?\s*[-–]?\s*(.+)$/i.exec(rangeStr);
  if (upMatch) {
    // lower = 0, upper = whatever follows “up”
    rangeStr = `0 - ${upMatch[1].trim()}`;
  } else if (/\bto\b/i.test(rangeStr)) {
    // replace any standalone “to” with “-”
    rangeStr = rangeStr.replace(/\bto\b/gi, "-");
  }
}

      // out‑of‑range flag
      let mark = "";
      const numRange = parseNumericRangeString(rangeStr);
      const numVal   = parseFloat(String(p.value));
      if (numRange && !isNaN(numVal)) {
        if (numVal < numRange.lower) mark = " L";
        else if (numVal > numRange.upper) mark = " H";
      }
      const valStr = p.value !== "" ? `${p.value}${mark}` : "-";

      // merge columns logic
      const rangeEmpty = rangeStr.trim()==="";
      const unitEmpty  = p.unit.trim()==="";
      
      // NEW: if only unit is missing (but range still present)
      const unitOnlyMerge = !rangeEmpty && unitEmpty;
      // merged still means neither unit *nor* range
      const fullyMerged   = rangeEmpty && unitEmpty;
      
      // split text
      const nameLines = doc.splitTextToSize(" ".repeat(indent) + p.name, wParam - 4);
      
      // if fullyMerged, span VALUE+UNIT+RANGE
      // if unitOnlyMerge, span VALUE+UNIT
      // otherwise just VALUE
      let valueSpan = wValue;
      if (fullyMerged)       valueSpan = wValue + wUnit + wRange;
  else if (unitOnlyMerge) valueSpan = wValue + wUnit;

  const valueLines = doc.splitTextToSize(valStr, valueSpan - 4);
  // only render range when there's a range cell
  const rangeLines = fullyMerged
    ? []
    : doc.splitTextToSize(rangeStr, wRange - 4);
  // only render unit when there's a unit cell
  const unitLines = (!unitEmpty && !fullyMerged)
    ? doc.splitTextToSize(p.unit, wUnit - 4)
    : [];

  // ── render NAME column (always at x1) ──
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0,0,0);
  doc.text(nameLines, x1    , yPos + 4);
  const mergeMargin = 19; 
  // ── now render VALUE / UNIT / RANGE by case ──
  if (fullyMerged) {
    // span VALUE + UNIT + RANGE across columns
    doc.setFont("helvetica", mark ? "bold" : "normal");
  doc.text(valueLines, x2 + mergeMargin, yPos + 4);
}
else if (unitOnlyMerge) {
  // span VALUE across VALUE + UNIT columns, left‑aligned
  doc.setFont("helvetica", mark ? "bold" : "normal");
  doc.text(valueLines, x2 + mergeMargin, yPos + 4);

  }
  else if (unitOnlyMerge) {
    // span VALUE across VALUE + UNIT columns
    doc.setFont("helvetica", mark ? "bold" : "normal");
    doc.text(
      valueLines,
      x2 + (wValue + wUnit) / 2,
      yPos + 4,
      { align: "center" }
    );
  }
  else {
    // normal 4‑column layout
    doc.setFont("helvetica", mark ? "bold" : "normal");
    doc.text(valueLines, x2 + wValue / 2, yPos + 4, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.text(unitLines,  x3 + wUnit / 2,  yPos + 2, { align: "center" });
    doc.text(rangeLines, x4 + wRange / 2, yPos + 4, { align: "center" });
  }

  // advance vertical
  const maxLines = Math.max(
    nameLines.length,
    valueLines.length,
    rangeLines.length,
    unitLines.length
  );
  yPos += maxLines * lineH;

  // ── sub‑parameters ──
  if (p.subparameters?.length) {
    p.subparameters.forEach(sp => printRow({ ...sp }, indent + 2));
  }
};
    // ----------------------------- build PDF ----------------------
    await addCover();
    if (!data.bloodtest) return doc.output("blob");

    let first = true;
    for (const testKey in data.bloodtest) {
      const tData = data.bloodtest[testKey];
      if (tData.type === "outsource" || !tData.parameters.length) continue;
      
 // ─── detect when this entire test has no units ───
 const omitUnit = tData.parameters.every(p => p.unit.trim() === "");
 // recompute the width of the VALUE cell
 const valueCellWidth = omitUnit ? wValue + wUnit : wValue;
 // and the X‑position where RANGE now begins:
 const xRange = omitUnit
   ? x2 + valueCellWidth
   : x4;


      if (skipCover) {
        if (!first) doc.addPage();
      } else {
        doc.addPage();
      }
      first = false;

      await addLetter();
      yPos = headerY();

      doc.setDrawColor(0,51,102).setLineWidth(0.5);
      doc.line(left, yPos, w-left, yPos);       // horizontal divider

      doc.setFont("helvetica","bold").setFontSize(13).setTextColor(0,51,102);
      doc.text(testKey.replace(/_/g," ").toUpperCase(), w/2, yPos + 8, {align:"center"});
      yPos += 10;

      // table header
      doc.setFontSize(10).setFillColor(0,51,102);
      const rowH = 7;
      doc.rect(left, yPos, totalW, rowH, "F");
      doc.setTextColor(255,255,255);
      doc.text("PARAMETER", x1 + 2,        yPos + 5);
      doc.text("VALUE",     x2 + wValue/2, yPos + 5, { align: "center" });
      doc.text("UNIT",      x3 + wUnit/2,  yPos + 5, { align: "center" });
      doc.text("RANGE",     x4 + wRange/2, yPos + 5, { align: "center" });

      yPos += rowH + 2;

      // global + subheading parameters
      const subheads = tData.subheadings ?? [];
      const subNames = subheads.flatMap(s => s.parameterNames);
      const globals  = tData.parameters.filter(p => !subNames.includes(p.name));

      globals.forEach(g => printRow(g));
      subheads.forEach(sh => {
        const rows = tData.parameters.filter(p => sh.parameterNames.includes(p.name));
        if (!rows.length) return;
        doc.setFont("helvetica","bold").setFontSize(10).setTextColor(0,51,102);
        doc.text(sh.title, x1, yPos+5);
        yPos += 6;
        rows.forEach(r => printRow(r));
      });
      doc.setFont("helvetica", "italic");
              doc.setFontSize(9);
              doc.setTextColor(0);
              doc.text(
                "--------------------- END OF REPORT ---------------------",
                w / 2,
                yPos + 4,
                { align: "center" }
              );
              yPos += 10;

    }

    // footer stamp on every page (except cover if not skipped)
    const startPage = skipCover ? 1 : 2;
    const pages = doc.getNumberOfPages();
    for (let i = startPage; i <= pages; i++) {
        doc.setPage(i);
        await addStamp();
    }


    return doc.output("blob");
  };

  // ----------------------------- Action handlers -----------------
  const downloadWithLetter = async () =>{
    if (!patientData) return;
    const blob = await generatePDFReport(patientData,true,true);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${patientData.name}_with_letterhead.pdf`; a.click();
    URL.revokeObjectURL(url);
  };
  const downloadNoLetter = async () =>{
    if (!patientData) return;
    const blob = await generatePDFReport(patientData,false,true);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${patientData.name}_no_letterhead.pdf`; a.click();
    URL.revokeObjectURL(url);
  };
  const preview = async (withLetter:boolean) =>{
    if (!patientData) return;
    const blob = await generatePDFReport(patientData,withLetter,true);
    const store = getStorage();
    const name  = `reports/preview/${patientData.name}_${withLetter?"":"no_"}letterhead.pdf`;
    const snap  = await uploadBytes(storageRef(store,name),blob);
    window.open(await getDownloadURL(snap.ref),"_blank");
  };
  const sendWhatsApp = async () =>{
    if (!patientData) return;
    try{
      setIsSending(true);
      // Send the version *with* the cover page for WhatsApp
      const blob = await generatePDFReport(patientData,true,false);
      const store= getStorage();
      const snap = await uploadBytes(storageRef(store,`reports/${patientData.name}.pdf`),blob);
      const url  = await getDownloadURL(snap.ref);

      const payload = {
        token   :"99583991573", // Replace with your actual token if needed
        number  :"91"+patientData.contact,
        imageUrl:url,
        caption :`Dear ${patientData.name},\n\nYour blood test report is now available:\n${url}\n\nRegards,\nYour Lab Team`,
      };
      const res = await fetch("https://wa.medblisss.com/send-image-url",{ // Replace with your actual endpoint
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),
      });
      if (res.ok) alert("Report sent on WhatsApp!");
      else {
        const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
        console.error("WhatsApp API Error:", errorData);
        alert(`Failed to send via WhatsApp. Status: ${res.status}`);
      }
    }catch(e){
       console.error("Error sending WhatsApp:", e);
       alert("Error sending WhatsApp message.");
    } finally{
        setIsSending(false);
    }
  };

  // --- NEW ACTION HANDLER for Graph Report ---
  const downloadGraphReport = async () => {
      if (!patientData) return;
      setIsGeneratingGraph(true); // Set loading state
      try {
          // Call the function from graphreport.tsx
          const blob = await generateGraphPDF(patientData);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${patientData.name}_graph_report.pdf`; // Set filename
          a.click();
          URL.revokeObjectURL(url);
      } catch (error) {
          console.error("Error generating graph report:", error);
          alert("Failed to generate graph report.");
      } finally {
          setIsGeneratingGraph(false); // Clear loading state
      }
  };

  // ----------------------------- UI ------------------------------
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4"> {/* Reduced space-y-6 to space-y-4 */}
        {patientData ? (
          <div className="bg-white rounded-xl shadow-lg p-8 space-y-4"> {/* Reduced space-y-6 to space-y-4 */}
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">Report Ready</h2>

            {/* Existing Buttons */}
            <button onClick={downloadWithLetter}
              className="w-full flex items-center justify-center space-x-3 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"> {/* Adjusted padding */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              <span>Download PDF (Letterhead)</span>
            </button>

            <button onClick={downloadNoLetter}
              className="w-full flex items-center justify-center space-x-3 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"> {/* Adjusted padding */}
               {/* Using a different download icon for variety */}
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /> </svg>
              <span>Download PDF (No letterhead)</span>
            </button>

             {/* --- NEW GRAPH REPORT BUTTON --- */}
            <button onClick={downloadGraphReport} disabled={isGeneratingGraph}
                className={`w-full flex items-center justify-center space-x-3 px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out ${
                    isGeneratingGraph
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}>
                {isGeneratingGraph ? (
                    <>
                        <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        <span>Generating...</span>
                    </>
                ) : (
                    <>
                       {/* Bar Chart Icon */}
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> </svg>
                       <span>Download Graph Report</span>
                    </>
                )}
            </button>

            {/* Preview Buttons */}
            <button onClick={() => preview(true)}
              className="w-full flex items-center justify-center space-x-3 bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"> {/* Adjusted color and padding */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none"  viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              <span>Preview (Letterhead)</span>
            </button>

            <button onClick={() => preview(false)}
              className="w-full flex items-center justify-center space-x-3 bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"> {/* Adjusted color and padding */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none"  viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              <span>Preview (No letterhead)</span>
            </button>


            {/* WhatsApp Button */}
            <button onClick={sendWhatsApp} disabled={isSending}
              className={`w-full flex items-center justify-center space-x-3 px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out ${
                    isSending
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-[#25D366] hover:bg-[#128C7E] text-white'
                }`}> {/* Adjusted padding */}
              {isSending ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c0-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
                  <span>Send via WhatsApp</span>
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-500 pt-2"> {/* Added padding-top */}
              Report generated for {patientData.name}
            </p>
          </div>
        ) : (
          <div className="text-center bg-white p-8 rounded-xl shadow-lg">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
              <span className="text-gray-600">Fetching patient data…</span>
            </div>
            <p className="mt-4 text-sm text-gray-500">This may take a few moments.</p>
          </div>
        )}
      </div>
    </div>
  );
}