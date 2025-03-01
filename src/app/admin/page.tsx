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

// Define interfaces for your data types
interface BloodTest {
  price: number;
  testId?: string;
  testName: string;
}

interface Patient {
  id?: string; // Added for the key from Firebase
  name: string;
  gender: string;
  age: number;
  contact: string;
  discountPercentage: number;
  amountPaid: number;
  bloodTests: BloodTest[];
  date: string; // Used for displaying the row date
}

const AdminPanel: React.FC = () => {
  // Define state for patients and search/filter criteria
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  // Create a filtered list of patients based on search term and date
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const matchesSearch = patient.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = selectedDate ? patient.date === selectedDate : true;
      return matchesSearch && matchesDate;
    });
  }, [patients, searchTerm, selectedDate]);

  // Compute summary values for the filtered patients
  const summary = useMemo(() => {
    let totalDiscount = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let netBilling = 0;

    filteredPatients.forEach((patient: Patient) => {
      const testTotal = patient.bloodTests.reduce(
        (acc: number, bt: BloodTest) => acc + (Number(bt.price) || 0),
        0
      );
      const discountValue = testTotal * (patient.discountPercentage / 100);
      const remaining = testTotal - discountValue - patient.amountPaid;

      netBilling += testTotal - discountValue;
      totalDiscount += discountValue;
      totalPaid += patient.amountPaid;
      totalRemaining += remaining;
    });

    return {
      totalDiscount,
      netBilling,
      totalPaid,
      totalRemaining,
    };
  }, [filteredPatients]);

  // Fetch patients from Firebase and convert object to array
  useEffect(() => {
    const patientsRef = ref(database, "patients");
    get(patientsRef).then((snapshot) => {
      if (snapshot.exists()) {
        const dataObj = snapshot.val();
        // Convert the object to an array with each key as an id
        const dataArray: Patient[] = Object.keys(dataObj).map((key) => ({
          id: key,
          ...dataObj[key],
          // Convert age from string to number if necessary
          age: Number(dataObj[key].age)
        }));
        setPatients(dataArray);
      }
    }).catch((error) => {
      console.error("Error fetching patients:", error);
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Enhanced Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <UserCircleIcon className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Patient Billing Portal</h1>
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
        {/* Search & Date Filters */}
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

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Net Billing</p>
                <p className="text-2xl font-semibold text-gray-900">
                  ₹{summary.netBilling.toFixed(2)}
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <ScaleIcon className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Total Discount</p>
                <p className="text-2xl font-semibold text-gray-900">
                  ₹{summary.totalDiscount.toFixed(2)}
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <TagIcon className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Amount Paid</p>
                <p className="text-2xl font-semibold text-gray-900">
                  ₹{summary.totalPaid.toFixed(2)}
                </p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <CurrencyDollarIcon className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Outstanding</p>
                <p className="text-2xl font-semibold text-gray-900">
                  ₹{summary.totalRemaining.toFixed(2)}
                </p>
              </div>
              <div className="bg-red-100 p-3 rounded-lg">
                <ReceiptRefundIcon className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Patients Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">Patient Records</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tests</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Discount</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPatients.map((patient: Patient, index: number) => {
                  const testTotal = patient.bloodTests.reduce(
                    (acc: number, bt: BloodTest) => acc + bt.price,
                    0
                  );
                  const discountValue = testTotal * (patient.discountPercentage / 100);
                  const remaining = testTotal - discountValue - patient.amountPaid;
                  const testNames = patient.bloodTests.map((bt) => bt.testName).join(", ");
                  return (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-700">{patient.date}</td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                        <div className="text-sm text-gray-500">{patient.gender}, {patient.age}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{patient.contact}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">{testNames}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 text-right">₹{testTotal.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-red-600 text-right">-₹{discountValue.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-green-600 text-right">₹{patient.amountPaid.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-orange-600 text-right">₹{remaining.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
