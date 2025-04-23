"use client";

import React, { useEffect, useState, useMemo } from "react";
import { ref, get } from "firebase/database";
import { database } from "../../firebase";
import {
  CalendarIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  CurrencyDollarIcon,
  TagIcon,
  ScaleIcon,
  ReceiptRefundIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";

/* ─────────────────── Types ─────────────────── */
interface BloodTest {
  price: number;
  testId?: string;
  testName: string;
}

interface Payment {
  amount: number;
  paymentMode: string;
  time: string;
}

interface Patient {
  id?: string; // Firebase key
  name: string;
  gender: string;
  age: number;
  contact: string;
  /** Flat discount in Indian Rupees (₹) */
  discountAmount: number;
  amountPaid: number;
  bloodTests: BloodTest[];
  /** ISO string (or YYYY-MM-DD) used for the date filter */
  date: string;
  paymentHistory?: Payment[];
}

/* ------------------------------------------------------------------ */
const AdminPanel: React.FC = () => {
  /* ─────────────────── State ─────────────────── */
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  /* ─────────────────── Derived ─────────────────── */
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const matchesSearch = patient.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesDate = selectedDate ? patient.date === selectedDate : true;
      return matchesSearch && matchesDate;
    });
  }, [patients, searchTerm, selectedDate]);

  const summary = useMemo(() => {
    let totalDiscount = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let netBilling = 0;
    let totalOnline = 0;
    let totalCash = 0;

    filteredPatients.forEach((patient) => {
      const testTotal = patient.bloodTests.reduce(
        (acc, bt) => acc + (Number(bt.price) || 0),
        0
      );
      const discountValue = Number(patient.discountAmount) || 0;
      const remaining = testTotal - discountValue - (patient.amountPaid || 0);

      totalDiscount += discountValue;
      totalPaid += patient.amountPaid || 0;
      totalRemaining += remaining;
      netBilling += testTotal - discountValue;

      if (Array.isArray(patient.paymentHistory)) {
        patient.paymentHistory.forEach((payment) => {
          if (payment.paymentMode === "online") totalOnline += payment.amount;
          else if (payment.paymentMode === "cash") totalCash += payment.amount;
        });
      }
    });

    return {
      totalDiscount,
      netBilling,
      totalPaid,
      totalRemaining,
      totalOnline,
      totalCash,
    };
  }, [filteredPatients]);

  /* ─────────────────── Effects ─────────────────── */
  useEffect(() => {
    const patientsRef = ref(database, "patients");

    get(patientsRef)
      .then((snapshot) => {
        if (snapshot.exists()) {
          const dataObj = snapshot.val();
          /* Convert the object keyed by Firebase IDs into an array */
          const dataArray: Patient[] = Object.keys(dataObj).map((key) => ({
            id: key,
            ...dataObj[key],
            age: Number(dataObj[key].age),
            discountAmount: Number(dataObj[key].discountAmount) || 0,
          }));
          setPatients(dataArray);
        }
      })
      .catch((err) => console.error("Error fetching patients:", err));
  }, []);

  /* ─────────────────── Render ─────────────────── */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ───── Header ───── */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <UserCircleIcon className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Patient Billing Portal
                </h1>
                <p className="text-sm text-gray-500">Administrative Dashboard</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center">
                <ClipboardDocumentListIcon className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* ───── Filters ───── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
            />
          </div>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
            />
          </div>
        </div>

        {/* ───── Summary Cards ───── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {/* Net Billing */}
          <SummaryCard
            label="Net Billing"
            value={summary.netBilling}
            Icon={ScaleIcon}
            iconBg="bg-green-100"
            iconColor="text-green-600"
          />
          {/* Total Discount */}
          <SummaryCard
            label="Total Discount"
            value={summary.totalDiscount}
            Icon={TagIcon}
            iconBg="bg-purple-100"
            iconColor="text-purple-600"
          />
          {/* Amount Paid (with breakdown) */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex flex-col items-start">
              <div className="flex items-center justify-between w-full">
                <SummaryHeader label="Amount Paid" Icon={CurrencyDollarIcon} />
                <p className="text-2xl font-semibold text-gray-900">
                  ₹{summary.totalPaid.toFixed(2)}
                </p>
              </div>
              <div className="mt-2 text-sm text-gray-700">
                <p>Online: ₹{summary.totalOnline.toFixed(2)}</p>
                <p>Cash:&nbsp;&nbsp; ₹{summary.totalCash.toFixed(2)}</p>
              </div>
            </div>
          </div>
          {/* Outstanding */}
          <SummaryCard
            label="Outstanding"
            value={summary.totalRemaining}
            Icon={ReceiptRefundIcon}
            iconBg="bg-red-100"
            iconColor="text-red-600"
          />
        </div>

        {/* ───── Patients Table ───── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">Patient Records</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHeader />
              <tbody className="divide-y divide-gray-100">
                {filteredPatients.map((patient) => {
                  const testTotal = patient.bloodTests.reduce(
                    (acc, bt) => acc + bt.price,
                    0
                  );
                  const discountValue = Number(patient.discountAmount) || 0;
                  const remaining = testTotal - discountValue - (patient.amountPaid || 0);
                  const testNames = patient.bloodTests
                    .map((bt) => bt.testName)
                    .join(", ");

                  return (
                    <tr
                      key={patient.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedPatient(patient)}
                    >
                      <td className="px-6 py-4 text-sm text-gray-700">{patient.date}</td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                        <div className="text-sm text-gray-500">
                          {patient.gender}, {patient.age}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{patient.contact}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                        {testNames}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right">
                        ₹{testTotal.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-red-600 text-right">
                        -₹{discountValue.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-green-600 text-right">
                        ₹{(patient.amountPaid || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-orange-600 text-right">
                        ₹{remaining.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ───── Payment History Modal ───── */}
      {selectedPatient && (
        <PaymentHistoryModal
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Reusable Sub-components                                             */
/* ------------------------------------------------------------------ */
interface SummaryCardProps {
  label: string;
  value: number;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconBg: string;
  iconColor: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  label,
  value,
  Icon,
  iconBg,
  iconColor,
}) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600 mb-1">{label}</p>
        <p className="text-2xl font-semibold text-gray-900">₹{value.toFixed(2)}</p>
      </div>
      <div className={`${iconBg} p-3 rounded-lg`}>
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </div>
    </div>
  </div>
);

const SummaryHeader: React.FC<{
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}> = ({ label, Icon }) => (
  <div className="flex items-center space-x-2">
    <p className="text-sm font-medium text-gray-600 mb-1">{label}</p>
    <Icon className="h-5 w-5 text-blue-600" />
  </div>
);

const TableHeader: React.FC = () => (
  <thead className="bg-gray-50">
    <tr>
      {[
        "Date",
        "Patient",
        "Contact",
        "Tests",
        "Total",
        "Discount",
        "Paid",
        "Due",
      ].map((head) => (
        <th
          key={head}
          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
        >
          {head}
        </th>
      ))}
    </tr>
  </thead>
);

interface PaymentHistoryModalProps {
  patient: Patient;
  onClose: () => void;
}

const PaymentHistoryModal: React.FC<PaymentHistoryModalProps> = ({ patient, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-lg w-11/12 md:w-1/2 lg:w-1/3 shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Payment History for {patient.name}</h2>
        <button onClick={onClose} className="text-red-600 font-bold">
          Close
        </button>
      </div>
      {Array.isArray(patient.paymentHistory) && patient.paymentHistory.length > 0 ? (
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">Time</th>
              <th className="px-4 py-2 text-left">Method</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {patient.paymentHistory.map((payment, idx) => (
              <tr key={idx} className="border-t last:border-b">
                <td className="px-4 py-2">
                  {new Date(payment.time).toLocaleString()}
                </td>
                <td className="px-4 py-2 capitalize">{payment.paymentMode}</td>
                <td className="px-4 py-2 text-right">₹{payment.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-gray-600">No payment history available.</p>
      )}
    </div>
  </div>
);

export default AdminPanel;