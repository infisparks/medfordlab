"use client";

import React, { useEffect, useState } from "react";
import { ref, get, update } from "firebase/database";
import { database } from "../../firebase"; // Adjust path if needed
import { Dialog } from "@headlessui/react";
import { FaSearch, FaEdit } from "react-icons/fa";

// -----------------------------
// Interfaces
// -----------------------------
interface Doctor {
  id: string;
  doctorName: string;
  number: string;
  commissionPercentage: number;
  address?: string;
  createdAt?: string;
}

interface Patient {
  id: string;
  doctorId?: string;
  createdAt?: string; // ISO date
  // ... other fields ...
}

// -----------------------------
// Edit Doctor Modal
// -----------------------------
interface EditDoctorModalProps {
  doctor: Doctor | null;
  onClose: () => void;
  onDoctorUpdated: () => void;
}

const EditDoctorModal: React.FC<EditDoctorModalProps> = ({
  doctor,
  onClose,
  onDoctorUpdated,
}) => {
  const [doctorName, setDoctorName] = useState("");
  const [number, setNumber] = useState("");
  const [commissionPercentage, setCommissionPercentage] = useState<number>(0);
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (doctor) {
      setDoctorName(doctor.doctorName || "");
      setNumber(doctor.number || "");
      setCommissionPercentage(doctor.commissionPercentage || 0);
      setAddress(doctor.address || "");
    }
  }, [doctor]);

  const handleUpdate = async () => {
    if (!doctor) return;
    try {
      await update(ref(database, `doctor/${doctor.id}`), {
        doctorName,
        number,
        commissionPercentage,
        address,
      });
      alert("Doctor updated successfully!");
      onDoctorUpdated();
      onClose();
    } catch (error) {
      console.error("Error updating doctor:", error);
      alert("Failed to update doctor information. Please try again.");
    }
  };

  if (!doctor) return null;

  return (
    <Dialog open={Boolean(doctor)} onClose={onClose} className="fixed inset-0 z-50">
      <div className="flex items-center justify-center min-h-screen bg-black bg-opacity-40">
        <Dialog.Panel className="bg-white w-full max-w-md p-6 rounded shadow-lg">
          <Dialog.Title className="text-xl font-bold mb-4">
            Edit Doctor: {doctor.doctorName}
          </Dialog.Title>

          <div className="space-y-4">
            {/* Doctor Name */}
            <div>
              <label className="block text-sm font-medium mb-1">Doctor Name</label>
              <input
                type="text"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            {/* Number */}
            <div>
              <label className="block text-sm font-medium mb-1">Phone Number</label>
              <input
                type="text"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            {/* Commission Percentage */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Commission Percentage
              </label>
              <input
                type="number"
                step="0.01"
                value={commissionPercentage}
                onChange={(e) => setCommissionPercentage(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded"
              ></textarea>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              className="mr-2 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

// -----------------------------
// Manage Doctors Page
// -----------------------------
const ManageDoctorsPage: React.FC = () => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchText, setSearchText] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterDay, setFilterDay] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);

  // Fetch doctors
  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const docRef = ref(database, "doctor");
        const snapshot = await get(docRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const arr: Doctor[] = Object.keys(data).map((id) => ({
            id,
            doctorName: data[id].doctorName,
            number: data[id].number,
            commissionPercentage: data[id].commissionPercentage,
            address: data[id].address || "",
            createdAt: data[id].createdAt || "",
          }));
          setDoctors(arr);
        }
      } catch (error) {
        console.error("Error fetching doctors:", error);
      }
    };
    fetchDoctors();
  }, []);

  // Fetch patients
  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const patRef = ref(database, "patients");
        const snapshot = await get(patRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const arr: Patient[] = Object.keys(data).map((id) => ({
            id,
            doctorId: data[id].doctorId,
            createdAt: data[id].createdAt || "",
          }));
          setPatients(arr);
        }
      } catch (error) {
        console.error("Error fetching patients:", error);
      }
    };
    fetchPatients();
  }, []);

  // Filter logic
  // 1) Filter by name (searchText)
  // 2) Filter by month (if filterMonth is set)
  // 3) Filter by day (if filterDay is set)
  // We'll apply these filters in a function that
  // returns the list of doctors + computed stats
  const getFilteredDoctors = () => {
    // Filter doctors by name
    let filtered = [...doctors];
    if (searchText.trim()) {
      filtered = filtered.filter((doc) =>
        doc.doctorName.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    // We'll compute each doctor's "total referred" for the time filters
    // So we need to see how many patients from `patients` have docId == doc.id
    // and also match the month/day filters.
    return filtered.map((doc) => {
      // Filter patients that belong to this doctor
      const docPatients = patients.filter((p) => p.doctorId === doc.id);

      // If month is set, we keep patients whose createdAt month is the filterMonth
      // If day is set, we keep patients whose createdAt day is the filterDay
      const finalPatients = docPatients.filter((p) => {
        if (!p.createdAt) return false;
        const dt = new Date(p.createdAt);
        let keep = true;

        if (filterMonth) {
          // filterMonth is "YYYY-MM" if user picks a month in an <input type="month" />
          // We'll parse that, then compare dt.getMonth() + dt.getFullYear()
          const [year, mon] = filterMonth.split("-");
          const selectedYear = Number(year);
          const selectedMonth = Number(mon) - 1; // months are 0-based
          if (dt.getFullYear() !== selectedYear || dt.getMonth() !== selectedMonth) {
            keep = false;
          }
        }

        if (filterDay) {
          // filterDay is "YYYY-MM-DD"
          const [y, m, d] = filterDay.split("-");
          const selectedYear = Number(y);
          const selectedMonth = Number(m) - 1;
          const selectedDay = Number(d);
          if (
            dt.getFullYear() !== selectedYear ||
            dt.getMonth() !== selectedMonth ||
            dt.getDate() !== selectedDay
          ) {
            keep = false;
          }
        }

        return keep;
      });

      return {
        ...doc,
        totalReferred: finalPatients.length,
      };
    });
  };

  const filteredDoctors = getFilteredDoctors();

  const handleEditClick = (doc: Doctor) => {
    setSelectedDoctor(doc);
  };

  const closeEditModal = () => {
    setSelectedDoctor(null);
  };

  const handleDoctorUpdated = () => {
    // Re-fetch the doctors from db, or manually update state
    // For simplicity, let's re-fetch from db to ensure fresh data
    const refetchDoctors = async () => {
      try {
        const docRef = ref(database, "doctor");
        const snapshot = await get(docRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const arr: Doctor[] = Object.keys(data).map((id) => ({
            id,
            doctorName: data[id].doctorName,
            number: data[id].number,
            commissionPercentage: data[id].commissionPercentage,
            address: data[id].address || "",
            createdAt: data[id].createdAt || "",
          }));
          setDoctors(arr);
        }
      } catch (error) {
        console.error("Error refetching doctors:", error);
      }
    };
    refetchDoctors();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto bg-white p-6 rounded-xl shadow-xl">
        <h1 className="text-3xl font-bold mb-6">Manage Doctors</h1>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:space-x-4 space-y-4 md:space-y-0 mb-6">
          {/* Search by Name */}
          <div className="flex-1 relative">
            <FaSearch className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Search by Doctor Name..."
            />
          </div>

          {/* Filter by Month */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Filter by Month
            </label>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => {
                setFilterMonth(e.target.value);
                // also reset day filter if you want
                // setFilterDay("");
              }}
              className="border rounded-lg px-3 py-2"
            />
          </div>

          {/* Filter by Day */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Filter by Day
            </label>
            <input
              type="date"
              value={filterDay}
              onChange={(e) => setFilterDay(e.target.value)}
              className="border rounded-lg px-3 py-2"
            />
          </div>
        </div>

        {/* Doctor Table */}
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-4 py-2 text-left">Doctor Name</th>
              <th className="border px-4 py-2 text-left">Phone</th>
              <th className="border px-4 py-2 text-left">Commission (%)</th>
              <th className="border px-4 py-2 text-left">Referred Patients</th>
              <th className="border px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDoctors.map((doc) => (
              <tr key={doc.id} className="hover:bg-gray-50">
                <td className="border px-4 py-2">{doc.doctorName}</td>
                <td className="border px-4 py-2">{doc.number}</td>
                <td className="border px-4 py-2">{doc.commissionPercentage}</td>
                <td className="border px-4 py-2">
                  {doc["totalReferred"] ?? 0}
                </td>
                <td className="border px-4 py-2">
                  <button
                    onClick={() => handleEditClick(doc)}
                    className="text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    <FaEdit className="mr-1" /> Edit
                  </button>
                </td>
              </tr>
            ))}
            {filteredDoctors.length === 0 && (
              <tr>
                <td
                  className="border px-4 py-2 text-center text-gray-500"
                  colSpan={5}
                >
                  No doctors found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {selectedDoctor && (
        <EditDoctorModal
          doctor={selectedDoctor}
          onClose={closeEditModal}
          onDoctorUpdated={handleDoctorUpdated}
        />
      )}
    </div>
  );
};

export default ManageDoctorsPage;

