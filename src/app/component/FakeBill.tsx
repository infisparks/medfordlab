/* ------------------------------------------------------------------ */
/*  FakeBill.tsx (modal to create a “fake” bill)                       */
/* ------------------------------------------------------------------ */
"use client";

import React, { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import letterhead from "../../../public/bill.png";  // ✅ same image you use elsewhere
import { toWords } from 'number-to-words';

/* ─────────────────── Types ─────────────────── */
interface BloodTest {
  testId: string;
  testName: string;
  price: number;
}
interface Patient {
  name: string;
  patientId: string;
  age: number;
  gender: string;
  contact?: string;
  createdAt: string;
  doctorName?: string;
  discountAmount: number;
  amountPaid: number;
  bloodTests?: BloodTest[];
}

interface FakeBillProps {
  patient: Patient;
  onClose: () => void;
}

/* ─────────────────── Helpers ─────────────────── */
const calcAmounts = (
  tests: BloodTest[],
  discount: number,
  paid: number
) => {
  const testTotal = tests.reduce((s, t) => s + t.price, 0);
  return {
    testTotal,
    remaining: testTotal - discount - paid,
  };
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function FakeBill({ patient, onClose }: FakeBillProps) {
  /* local, editable copy of test prices */
  const [tests, setTests] = useState<BloodTest[]>(
    patient.bloodTests?.map((t) => ({ ...t })) ?? []
  );

  const handlePriceChange = (id: string, price: number) =>
    setTests((prev) => prev.map((t) => (t.testId === id ? { ...t, price } : t)));

  /* -------------------------------------------------- *
   *  DOWNLOAD ( **same layout as real handleDownloadBill** )
   * -------------------------------------------------- */
  const handleDownload = () => {
    /* ─── calculate amounts ─── */
    const { testTotal, remaining } = calcAmounts(
      tests,
      patient.discountAmount,
      patient.amountPaid
    );
    // convert to words
    const remainingWords = toWords(Math.round(remaining));
    /* ─── load letter‑head, then build PDF ─── */
    const img = new Image();
    img.src = (letterhead as any).src ?? (letterhead as any);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const bg = canvas.toDataURL("image/jpeg", 0.5); // 50 % quality

      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      /* background + base font */
      doc.addImage(bg, "JPEG", 0, 0, pageW, pageH);
      doc.setFont("helvetica", "normal").setFontSize(12);

      /* ─── patient details (two‑column) ─── */
      const margin = 14;
      const mid = pageW / 2;
      const Lk = margin,
        Lc = margin + 40,
        Lv = margin + 44;
      const Rk = mid + margin,
        Rc = mid + margin + 40,
        Rv = mid + margin + 44;

      let y = 70;
      const row = (kL: string, vL: string, kR: string, vR: string) => {
        doc.text(kL, Lk, y);
        doc.text(":", Lc, y);
        doc.text(vL, Lv, y);
        doc.text(kR, Rk, y);
        doc.text(":", Rc, y);
        doc.text(vR, Rv, y);
        y += 6;
      };

      row("Name", patient.name, "Patient ID", patient.patientId);
      row(
        "Age / Gender",
        `${patient.age} y / ${patient.gender}`,
        "Registration Date",
        new Date(patient.createdAt).toLocaleDateString()
      );
      row("Ref. Doctor", patient.doctorName ?? "N/A", "Contact", patient.contact ?? "N/A");
      y += 4;

      /* ─── tests table ─── */
      autoTable(doc, {
        head: [["Test Name", "Amount"]],
        body: tests.map((t) => [t.testName, t.price.toFixed(2)]),
        startY: y,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 11 },
        headStyles: { fillColor: [30, 79, 145], fontStyle: "bold" },
        columnStyles: { 1: { fontStyle: "bold" } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      /* ─── summary ─── */
      autoTable(doc, {
        head: [["Description", "Amount"]],
        body: [
          ["Test Total", testTotal.toFixed(2)],
          ["Discount", patient.discountAmount.toFixed(2)],
          ["Amount Paid", patient.amountPaid.toFixed(2)],
          ["Remaining", remaining.toFixed(2)],
        ],
        startY: y,
        theme: "plain",
        styles: { font: "helvetica", fontSize: 11 },
        columnStyles: { 1: { fontStyle: "bold" } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
      
      // ─── amount in words ───
      doc
        .setFont("helvetica", "normal")
        .setFontSize(10)
        .text(
          `(${remainingWords.charAt(0).toUpperCase() + remainingWords.slice(1)} only)`,
          pageW - margin,
          y,
          { align: "right" }
        );
      y += 12;
      /* ─── footer ─── */
      doc
        .setFont("helvetica", "italic")
        .setFontSize(10)
        .text("Thank you for choosing our services!", pageW / 2, y, {
          align: "center",
        });

      doc.save(`FakeBill_${patient.name}.pdf`);
    };

    img.onerror = () => alert("Failed to load letter‑head image.");
  };

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                          */
  /* ---------------------------------------------------------------- */
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>

        <h3 className="text-xl font-semibold mb-4">
          Generate  Bill — {patient.name}
        </h3>

        {/* editable prices */}
        <div className="max-h-60 overflow-y-auto mb-4">
          {tests.map((t) => (
            <div key={t.testId} className="flex justify-between items-center mb-2">
              <span>{t.testName}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={t.price}
                onChange={(e) => handlePriceChange(t.testId, Number(e.target.value))}
                className="w-24 px-2 py-1 border rounded"
              />
            </div>
          ))}
        </div>

        <button
          onClick={handleDownload}
          className="w-full bg-teal-600 text-white py-2 rounded hover:bg-teal-700"
        >
          Download  Bill
        </button>
      </div>
    </div>
  );
}
