// src/app/graphreport.tsx
"use client";

import { jsPDF } from "jspdf";
import { getAuth } from "firebase/auth";

// Import ALL necessary types from page.tsx (assuming they are exported there)
// Adjust path if page.tsx is not in the same directory
// NOTE: These types *must* be exported from './page.tsx' for this to work.
// The TypeScript error "Module './page' has no exported member..." indicates
// they are not currently exported from that file. You need to add `export`
// before the type/interface definitions in page.tsx.
import type {
  PatientData,
  Parameter,
 
  AgeRangeItem,
} from "./page";

// Local images (adjust path from this file's location)
import letterhead from "../../../public/letterhead.png"; // Adjust path as needed
import stamp from "../../../public/stamp.png"; // Adjust path as needed
// import bloodtestpage from "../../../public/testname.png"
// firstpage is not needed here as we are skipping the cover page

// Define a type for the subheading structure based on its usage in the code
interface Subheading {
    title: string;
    parameterNames: string[]; // Array of parameter names belonging to this subheading
}


// -----------------------------
// Helper: Compress image (Duplicated from page.tsx - consider moving to utils.ts)
// -----------------------------
const loadImageAsCompressedJPEG = async (url: string, quality = 0.5): Promise<string> => {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("canvas context error"));
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = (err) => reject(err);
    img.src = URL.createObjectURL(blob);
  });
};

// -----------------------------
// Helper functions (Copied from page.tsx)
// -----------------------------
const parseRangeKey = (key: string): { lower: number; upper: number } => {
  key = key.trim();
  const suf = key.slice(-1);
  let mul = 1;
  if (suf === "m") mul = 30; // Assuming 'm' means months -> days
  else if (suf === "y") mul = 365;
  const core = key.replace(/[dmy]$/, "");
  const [lo, hi] = core.split("-");
  // Handle cases like "up to 10y" or "> 10y" if necessary, currently assumes number-number or number
  const lowerBound = Number(lo) * mul || 0;
  const upperBound = hi ? Number(hi) * mul : Infinity; // If no hi part, assume infinity
  return { lower: lowerBound, upper: upperBound === 0 ? Infinity : upperBound }; // Ensure upper isn't 0 unless intended
};

const parseNumericRangeString = (str: string | null | undefined): { lower: number; upper: number } | null => {
    if (!str) return null;
    str = str.trim();
    // ▸ “up to 12.5”  →  { lower: 0, upper: 12.5 }
    const up = /^\s*up\s*(?:to\s*)?([\d.]+)\s*$/i.exec(str);
    if (up) {
        const upper = parseFloat(up[1]);
        return isNaN(upper) ? null : { lower: 0, upper };
    }

    // ▸ “> 10.0” or “>= 10.0” → { lower: 10.0, upper: Infinity }
    const gt = /^\s*(>=?)\s*([\d.]+)\s*$/i.exec(str);
    if (gt) {
        const lower = parseFloat(gt[2]);
        return isNaN(lower) ? null : { lower, upper: Infinity };
    }

    // ▸ “< 10.0” or “<= 10.0” → { lower: 0, upper: 10.0 } // Assuming lower bound is 0
    const lt = /^\s*(<=?)\s*([\d.]+)\s*$/i.exec(str);
    if (lt) {
        const upper = parseFloat(lt[2]);
        // Consider if 0 is always the appropriate lower bound for '<' ranges
        return isNaN(upper) ? null : { lower: 0, upper };
    }


    // ▸ “4‑7” or “4 to 7”  →  { lower: 4, upper: 7 }
    const m = /^\s*([\d.]+)\s*(?:-|to)\s*([\d.]+)\s*$/i.exec(str);
    if (!m) return null;
    const lower = parseFloat(m[1]), upper = parseFloat(m[2]);
    return isNaN(lower) || isNaN(upper) ? null : { lower, upper };
};


/**
 * Generates a full, detailed PDF Report with letterhead, mimicking
 * the main report generation logic but intended for the "Graph Report" button for now.
 *
 * @param data PatientData object (assumes invisible items are already filtered)
 * @returns A Promise resolving to the PDF Blob
 */
export const generateGraphPDF = async (data: PatientData): Promise<Blob> => {
  // --- Start of Copied Logic from generatePDFReport ---
  const doc = new jsPDF("p", "mm", "a4");
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const left = 30;

  // Column widths (Copied from page.tsx)
  const totalW = w - 2 * left;
  // keep your “base” unit, but give range 1.5× base
  const base = totalW / 4.35;
  const wParam = base;
  const wValue = base;
  const wRange = 1.5 * base;
  // unit gets whatever’s left over
  const wUnit = totalW - (wParam + wValue + wRange);

  const x1 = left;
  const x2 = x1 + wParam;
  const x3 = x2 + wValue; // now VALUE ends here
  const x4 = x3 + wUnit; // UNIT starts at x3, RANGE at x4

  const lineH = 6;
  // Calculate age in days (Ensure data.age and data.total_day are handled robustly)
  let ageDays: number;
  if (typeof data.total_day === 'number') {
    ageDays = data.total_day;
  } else if (typeof data.total_day === 'string' && !isNaN(Number(data.total_day))) {
    ageDays = Number(data.total_day);
  } else if (typeof data.age === 'number') {
    ageDays = data.age * 365; // Approximation
  } else if (typeof data.age === 'string' && !isNaN(Number(data.age))) {
    ageDays = Number(data.age) * 365; // Approximation
  } else {
    ageDays = 30 * 365; // Default fallback age if missing/invalid - adjust as needed
    console.warn("Patient age or total_day missing/invalid, defaulting age calculation.");
  }
  const genderKey = data.gender?.toLowerCase() ?? "unknown"; // Handle potential undefined gender

  const auth = getAuth();
  let printedBy =
    auth.currentUser?.displayName || auth.currentUser?.email || "Unknown";
  if (printedBy.includes("@")) printedBy = printedBy.split("@")[0];

  // --- Internal Helper Functions (Copied or adapted from page.tsx) ---

  // Add Letterhead (Always called for this report type)
  const addLetter = async () => {
    try {
      // Check if letterhead.src is defined before attempting to load
      if (letterhead && letterhead.src) {
        const img = await loadImageAsCompressedJPEG(letterhead.src, 0.5);
        doc.addImage(img, "JPEG", 0, 0, w, h);
      } else {
        console.error("Letterhead image source is missing or invalid.");
         // Optionally draw a placeholder or skip if the image is critical
      }
    } catch (e) {
      console.error("Error adding letterhead:", e);
       // Optionally draw a placeholder text if image fails
         doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(150);
         doc.text("[Letterhead Unavailable]", w / 2, h / 2, { align: "center" });
    }
  };

  // Add Stamp (Re-using the one defined outside this function scope)
  const addStampToPage = async () => {
    await addStamp(doc, printedBy); // Calls the helper defined below generateGraphPDF
  };

  /** HEADER (Copied from page.tsx) */
  const headerY = () => {
    const gap = 7;
    let y = 50; // Starting Y position for header block

    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0, 0, 0);

    // Determine Sample Collection Date/Time (handle potential invalid dates)
    let sampleDate: Date | null = null;
    if (data.sampleCollectedAt) {
      try {
        sampleDate = new Date(data.sampleCollectedAt);
        // Check if the date is valid
        if (isNaN(sampleDate.getTime())) {
          sampleDate = null; // Invalid date string
          console.warn("Invalid sampleCollectedAt date string:", data.sampleCollectedAt);
        }
      } catch (e) {
        console.error("Error parsing sampleCollectedAt date:", e);
        sampleDate = null;
      }
    }
    // Fallback to createdAt if sampleCollectedAt is missing or invalid
    let registrationDate: Date | null = null;
    if (data.createdAt) {
      try {
        registrationDate = new Date(data.createdAt);
        if (isNaN(registrationDate.getTime())) {
          registrationDate = null;
          console.warn("Invalid createdAt date string:", data.createdAt);
        }
      } catch (e) {
        console.error("Error parsing createdAt date:", e);
        registrationDate = null;
      }
    }

    const sampleDTString = sampleDate ? sampleDate.toLocaleString() : (registrationDate ? registrationDate.toLocaleString() : 'N/A');
    const registrationDTString = registrationDate ? registrationDate.toLocaleString() : 'N/A';


    // Left‑block and right‑block rows must have identical indices
    const leftRows = [
      { label: "Patient Name", value: (data.name || 'N/A').toUpperCase() },
      { label: "Age/Sex", value: `${data.age ?? 'N/A'} / ${(data.gender ?? 'N/A')}` }, // Added nullish coalescing
      { label: "Ref Doctor", value: (data.doctorName || "-").toUpperCase() },
      { label: "Client Name", value: (data.hospitalName || "-").toUpperCase() },
    ];
    const rightRows = [
      { label: "Patient ID", value: data.patientId ?? 'N/A' },
      { label: "Sample Collected on", value: sampleDTString },
      { label: "Registration On", value: registrationDTString },
      { label: "Reported On", value: new Date().toLocaleString() },
    ];

    // Calculate positions (same logic as page.tsx)
    const maxLeftLabelWidth = Math.max(...leftRows.map((r) => doc.getTextWidth(r.label)));
    const xLeftLabel = left;
    const xLeftColon = xLeftLabel + maxLeftLabelWidth + 2;
    const xLeftValue = xLeftColon + 2;

    const startRight = w / 2 + 10; // where right block begins
    const maxRightLabelWidth = Math.max(...rightRows.map((r) => doc.getTextWidth(r.label)));
    const xRightLabel = startRight;
    const xRightColon = xRightLabel + maxRightLabelWidth + 2;
    const xRightValue = xRightColon + 2;

    // draw rows
    for (let i = 0; i < leftRows.length; i++) {
      // left side
      doc.text(leftRows[i].label, xLeftLabel, y);
      doc.text(":", xLeftColon, y);
      doc.text(leftRows[i].value, xLeftValue, y);

      // right side (check if rightRows[i] exists)
      if (rightRows[i]) {
        doc.text(rightRows[i].label, xRightLabel, y);
        doc.text(":", xRightColon, y);
        doc.text(rightRows[i].value, xRightValue, y);
      }

      y += gap - 2;
    }
    return y + 0; // Return Y position after the header
  };
  /** ------------------------------------------------------------------------ */

  // ----- Core row printer (Copied from page.tsx) -----------------------------
  let yPos = 0; // This will be reset for each test/page
  const printRow = (p: Parameter, indent = 0) => {
    // Check page boundary and add new page if necessary
    const estimatedRowHeight = Math.max(
      doc.splitTextToSize(" ".repeat(indent) + p.name, wParam - 4).length,
      doc.splitTextToSize(String(p.value || "-"), wValue - 4).length, // Handle null/undefined value
      // Estimate range/unit height (simplified)
      (typeof p.range === 'string' ? doc.splitTextToSize(p.range, wRange - 4).length : 1),
      doc.splitTextToSize(p.unit || "", wUnit - 4).length
    ) * lineH + 2; // Add buffer

    const pageHeightThreshold = h - 60; // Leave space for footer/stamp etc.

    if (yPos + estimatedRowHeight > pageHeightThreshold) {
      addStampToPage(); // Add stamp to the current page before adding a new one
      doc.addPage();
      addLetter(); // Add letterhead to the new page
      // Reset yPos for the new page, potentially redraw headers if needed
      // For simplicity, just resetting yPos after header. Adjust if full header needed on overflow.
      yPos = headerY(); // Redraw header on new page
      // Redraw table header
      doc.setFont("helvetica", "bold").setFontSize(10).setFillColor(0, 51, 102);
      const tableHeaderY = yPos + 10; // Position after main header
      const rowH = 7;
      doc.rect(left, tableHeaderY, totalW, rowH, "F");
      doc.setTextColor(255, 255, 255);
      doc.text("PARAMETER", x1 + 2, tableHeaderY + 5);
      doc.text("VALUE", x2 + wValue / 2, tableHeaderY + 5, { align: "center" });
      doc.text("UNIT", x3 + wUnit / 2, tableHeaderY + 5, { align: "center" });
      doc.text("RANGE", x4 + wRange / 2, tableHeaderY + 5, { align: "center" });
      yPos = tableHeaderY + rowH + 2; // Set yPos below the table header
    }

    // build range string
    let rangeStr = "";
    if (typeof p.range === "string") {
      rangeStr = p.range;
    } else if (p.range && (p.range.male || p.range.female)) { // Check if range object exists
      // Use genderKey, fallback to female/male if specific gender doesn't exist
      const genderSpecificRanges = p.range[genderKey as keyof typeof p.range] as AgeRangeItem[] | undefined
                                   || p.range.female as AgeRangeItem[] | undefined // fallback 1
                                   || p.range.male as AgeRangeItem[] | undefined;  // fallback 2

      const arr = genderSpecificRanges || [];
      for (const r of arr) {
        if (r && r.rangeKey) { // Check if 'r' and 'rangeKey' are defined
          try {
            const { lower, upper } = parseRangeKey(r.rangeKey);
            // Use <= upper for inclusive upper bound based on parseRangeKey implementation assumption
            if (ageDays >= lower && ageDays <= upper) {
              rangeStr = r.rangeValue || "";
              break;
            }
          } catch (e) {
            console.error(`Error parsing rangeKey "${r.rangeKey}" for parameter "${p.name}":`, e);
            // Optionally set a default/error string for the range
            // rangeStr = "Error";
            // break; // Or continue searching if desired
          }
        }
      }
      // Fallback if no age-specific range found (use the last entry if available)
      if (!rangeStr && arr.length && arr[arr.length - 1]) {
        rangeStr = arr[arr.length - 1].rangeValue || "";
      }
    }
    rangeStr = (rangeStr || "").replaceAll("/n", "\n"); // Ensure rangeStr is a string

    // out‑of‑range flag
    let mark = "";
    const numRange = parseNumericRangeString(rangeStr);
    const valStrRaw = p.value ?? ""; // Handle null/undefined
    const numVal = parseFloat(String(valStrRaw)); // Convert to string before parsing

    if (numRange && !isNaN(numVal)) {
      // Handle greater than / less than ranges from parseNumericRangeString
      if (numVal < numRange.lower) mark = " L";
      else if (numVal > numRange.upper) mark = " H";
    }
    const valStr = valStrRaw !== "" ? `${valStrRaw}${mark}` : "-";

    // merge columns logic
    const rangeEmpty = rangeStr.trim() === "";
    const unitEmpty = (p.unit || "").trim() === ""; // Handle null/undefined unit
    const merged = rangeEmpty && unitEmpty;

    // split text
    const nameLines = doc.splitTextToSize(" ".repeat(indent) + p.name, wParam - 4);
    const valWidth = merged ? wValue + wRange + wUnit : wValue;
    // Ensure valStr is a string for splitTextToSize
    const valueLines = doc.splitTextToSize(String(valStr), valWidth - 4);
    const rangeLines = merged ? [] : doc.splitTextToSize(rangeStr, wRange - 4);
    const unitLines = merged ? [] : doc.splitTextToSize(p.unit || "", wUnit - 4); // Handle null/undefined unit
    const maxLines = Math.max(nameLines.length, valueLines.length, rangeLines.length, unitLines.length);

    // render
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0, 0, 0);
    doc.text(nameLines as string[], x1 + 2, yPos + 4); // Cast to string[] as splitTextToSize returns string|string[]

    if (merged) {
      // full‐width value: left‐align at the start of the merged area
      const inset = 2; // Reduced inset for potentially longer text

      // recompute the wrap‐width to cover VALUE + UNIT + RANGE
      const mergedWidth = wValue + wUnit + wRange;
      const wrapped = doc.splitTextToSize(
        String(valStr), // Ensure string
        mergedWidth - inset - 2 // leave a little right‐margin too
      );

      // now draw it left‐aligned, inset from x2
      doc.text(wrapped as string[], x2 + inset, yPos + 4); // Cast to string[]
    } else {
      // normal 4‑column layout

      // VALUE cell: bold only if out‑of‑range
      doc.setFont("helvetica", mark ? "bold" : "normal");
      doc.text(valueLines as string[], x2 + wValue / 2, yPos + 4, { align: "center" }); // Cast to string[]
      doc.setFont("helvetica", "normal"); // Reset font

      // UNIT cell: centered
      doc.text(unitLines as string[], x3 + wUnit / 2, yPos + 4, { align: "center" }); // Adjusted Y to match others, Cast to string[]

      // RANGE cell: centered
      doc.text(rangeLines as string[], x4 + wRange / 2, yPos + 4, { align: "center" }); // Cast to string[]
    }

    yPos += maxLines * lineH; // Use calculated maxLines

    // sub‑parameters (recursive call)
    if (p.subparameters?.length) {
      p.subparameters.forEach((sp: Parameter) => { // Explicitly type 'sp' as Parameter
        if (sp && sp.name) { // Basic check if subparameter is valid
          printRow({ ...sp }, indent + 2); // Pass indent + 2
        }
      });
    }
  };

  // --- Main PDF Building Logic (Copied and adapted from page.tsx) ---

  // Ensure data.bloodtest is a valid object
  const bloodTests = data.bloodtest && typeof data.bloodtest === 'object' ? data.bloodtest : {};

  if (Object.keys(bloodTests).length === 0) {
    console.warn("No blood test data found for patient:", data.patientId);
    // Optionally add a message to the PDF indicating no data
    await addLetter(); // Add letterhead even if no data
    yPos = headerY(); // Add patient header
    doc.setFont("helvetica", "normal").setFontSize(12).setTextColor(0, 0, 0);
    doc.text("No blood test report data available for this patient.", left, yPos + 20);
    await addStampToPage(); // Add stamp
    return doc.output("blob");
  }


  let firstPageOfReport = true; // To manage addPage logic correctly
  for (const testKey in bloodTests) {
    const tData = bloodTests[testKey];

    // Skip if no parameters or if it's an outsourced test (if that logic is still relevant)
    // The filtering of 'hidden' parameters should have happened before this function is called.
    if (tData.type === "outsource" || !tData.parameters || tData.parameters.length === 0) {
      console.log(`Skipping test "${testKey}" - Type: ${tData.type}, Params: ${tData.parameters?.length}`);
      continue;
    }


    // Add new page ONLY if it's NOT the very first page *of the actual report content*
    if (!firstPageOfReport) {
      await addStampToPage(); // Add stamp to previous page before adding new one
      doc.addPage();
    }


    await addLetter(); // Add letterhead to the current page (first or subsequent)
    yPos = headerY(); // Draw patient header, get Y position after it

    // Draw horizontal divider below header
    doc.setDrawColor(0, 51, 102).setLineWidth(0.5);
    doc.line(left, yPos, w - left, yPos);
    yPos += 2; // Add a small gap

    // Test Title (e.g., "COMPLETE BLOOD COUNT")
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0, 51, 102);
    doc.text(testKey.replace(/_/g, " ").toUpperCase(), w / 2, yPos + 6, { align: "center" });
    yPos += 10; // Space after title

    // Table Header
    doc.setFont("helvetica", "bold").setFontSize(10).setFillColor(0, 51, 102); // Set font before rect
    const rowH = 7;
    doc.rect(left, yPos, totalW, rowH, "F"); // Draw filled rectangle for header bg
    doc.setTextColor(255, 255, 255); // White text
    doc.text("PARAMETER", x1 + 2, yPos + 5);
    doc.text("VALUE", x2 + wValue / 2, yPos + 5, { align: "center" });
    doc.text("UNIT", x3 + wUnit / 2, yPos + 5, { align: "center" });
    doc.text("RANGE", x4 + wRange / 2, yPos + 5, { align: "center" });
    yPos += rowH + 2; // Space after table header

    // Process Parameters & Subheadings (Copied from page.tsx)
    // Ensure subheadings is an array and its elements are valid Subheading objects
    const subheads: Subheading[] = Array.isArray(tData.subheadings) ? tData.subheadings.filter((sh: any) => sh && sh.title && Array.isArray(sh.parameterNames)) : [];
    const subNames = subheads.flatMap((s: Subheading) => s.parameterNames); // Explicitly type 's' as Subheading
    // Ensure parameters is an array before filtering
    const allParams: Parameter[] = Array.isArray(tData.parameters) ? tData.parameters.filter((p: any) => p && p.name) : []; // Explicitly type 'p' as Parameter and filter invalid entries
    const globals: Parameter[] = allParams.filter((p: Parameter) => !subNames.includes(p.name)); // Explicitly type 'p' as Parameter and filter globals


    globals.forEach((g: Parameter) => printRow(g)); // Explicitly type 'g' as Parameter // Print global parameters first

    subheads.forEach((sh: Subheading) => { // Explicitly type 'sh' as Subheading
      if (!sh || !sh.title || !sh.parameterNames) return; // Skip invalid subheadings
      // Explicitly type 'p' as Parameter in the filter callback
      const rows: Parameter[] = allParams.filter((p: Parameter) => sh.parameterNames.includes(p.name)); // Filter params for this subheading

      if (!rows.length) return; // Skip if no parameters found for this subheading

      // Check for page break before printing subheading title
      const pageHeightThreshold = h - 60; // Recalculate threshold
      if (yPos + 12 > pageHeightThreshold) { // Estimate space needed for title + gap
        addStampToPage();
        doc.addPage();
        addLetter();
        yPos = headerY(); // Redraw header
        // Redraw table header (optional, depending on desired look)
        doc.setFont("helvetica", "bold").setFontSize(10).setFillColor(0, 51, 102);
        const tableHeaderY = yPos + 10; // Position after main header
        const rowH = 7;
        doc.rect(left, tableHeaderY, totalW, rowH, "F");
        doc.setTextColor(255, 255, 255);
        doc.text("PARAMETER", x1 + 2, tableHeaderY + 5);
        doc.text("VALUE", x2 + wValue / 2, tableHeaderY + 5, { align: "center" });
        doc.text("UNIT", x3 + wUnit / 2, tableHeaderY + 5, { align: "center" });
        doc.text("RANGE", x4 + wRange / 2, tableHeaderY + 5, { align: "center" });
        yPos = tableHeaderY + rowH + 2; // Set yPos below the table header
      }

      // Print Subheading Title
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 51, 102);
      doc.text(sh.title, x1, yPos + 5);
      yPos += 6; // Space after subheading title

      rows.forEach((r: Parameter) => printRow(r)); // Explicitly type 'r' as Parameter // Print rows under this subheading
    });

    // Mark that we have processed the first page/test group
    firstPageOfReport = false;

    // Add "End of Report" marker for this specific test *if needed*
    // Usually, it's better at the very end of the entire PDF
    // doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(0);
    // doc.text("--- End of " + testKey + " ---", w / 2, yPos + 4, { align: "center" });
    // yPos += 6;


  } // End loop through tests (testKey in data.bloodtest)

  // Add "End of Report" marker at the very end of the last page
  const finalPageHeightThreshold = h - 60;
  if (yPos + 10 > finalPageHeightThreshold) { // Check space for end marker
    await addStampToPage(); // Stamp the current page
    doc.addPage(); // Add a new page just for the end marker and stamp
    await addLetter(); // Add letterhead
    yPos = 50; // Reset yPos (adjust as needed, maybe below header if you redraw it)
  }
  doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(0);
  doc.text(
    "--------------------- END OF REPORT ---------------------",
    w / 2,
    yPos + 4,
    { align: "center" }
  );
  yPos += 10;


  // Footer stamp on the final page
  await addStampToPage();


  // --- End of Copied Logic ---

  // Output Blob
  return doc.output("blob");
};


// Helper: Add stamp (defined outside generateGraphPDF scope)
const addStamp = async (doc: jsPDF, printedBy: string) => {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const left = 30; // Assuming same margin as main report
  const sw = 40, sh = 30, sx = w - left - sw, sy = h - sh - 30; // Position from bottom-right
  try {
    // Ensure stamp.src is valid and accessible
    if (stamp && stamp.src) {
      const img = await loadImageAsCompressedJPEG(stamp.src, 0.5);
      doc.addImage(img, "JPEG", sx, sy, sw, sh);
    } else {
      console.error("Stamp image source is missing or invalid.");
    }
  } catch (e) {
    console.error("Error adding stamp image:", e);
    // Optionally draw a placeholder text if image fails
    doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(150);
    doc.text("[Stamp Unavailable]", sx, sy + sh / 2);
  }
  // Draw printedBy text regardless of stamp image success
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 0, 0); // Black text
  doc.text("Printed by:", left, sy + sh - 8); // Position relative to stamp area
  doc.setFont("helvetica", "normal").setFontSize(11);
  doc.text(printedBy, left, sy + sh - 4);
};

// No default export needed as this module only exports the generation function.