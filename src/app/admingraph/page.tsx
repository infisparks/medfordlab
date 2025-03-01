"use client";

import React, { useEffect, useState } from "react";
import { ref, get } from "firebase/database";
import { database } from "../../firebase";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter, faRupeeSign, faChartColumn } from "@fortawesome/free-solid-svg-icons";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type TimeFilter = "week" | "month" | "year";

interface BloodTest {
  testId: string;
  testName: string;
  price: number;
}

interface Patient {
  createdAt: string;
  bloodTests?: BloodTest[];
}

const AdminGraphPage: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filter, setFilter] = useState<TimeFilter>("week");
  const [chartData, setChartData] = useState<any>({ labels: [], datasets: [] });
  const [totalAmount, setTotalAmount] = useState<number>(0);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const patientsRef = ref(database, "patients");
        const snapshot = await get(patientsRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          const patientsArray: Patient[] = Object.keys(data).map((key) => data[key]);
          setPatients(patientsArray);
        }
      } catch (error) {
        console.error("Error fetching patients:", error);
      }
    };
    fetchPatients();
  }, []);

  useEffect(() => {
    const now = new Date();
    const filteredPatients = patients.filter((patient) => {
      const createdAt = new Date(patient.createdAt);
      const timeDiff = now.getTime() - createdAt.getTime();
      return filter === "week"
        ? timeDiff <= 604800000
        : filter === "month"
        ? timeDiff <= 2592000000
        : filter === "year"
        ? timeDiff <= 31536000000
        : true;
    });

    const testCount: { [testId: string]: { count: number; testName: string } } = {};
    let total = 0;
    
    filteredPatients.forEach((patient) => {
      patient.bloodTests?.forEach((test) => {
        total += test.price;
        testCount[test.testId] = testCount[test.testId]
          ? { ...testCount[test.testId], count: testCount[test.testId].count + 1 }
          : { count: 1, testName: test.testName };
      });
    });

    setTotalAmount(total);
    const labels = Object.values(testCount).map((item) => item.testName);
    const counts = Object.values(testCount).map((item) => item.count);

    setChartData({
      labels,
      datasets: [
        {
          label: "Number of Tests Sold",
          data: counts,
          backgroundColor: "rgba(79, 70, 229, 0.8)",
          borderColor: "rgba(79, 70, 229, 1)",
          borderWidth: 2,
          borderRadius: 4,
          hoverBackgroundColor: "rgba(99, 102, 241, 0.9)",
        },
      ],
    });
  }, [patients, filter]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Header Section */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                <FontAwesomeIcon
                  icon={faChartColumn}
                  className="mr-3 text-indigo-600 text-4xl"
                />
                Sales Analytics
              </h1>
              <p className="text-gray-500 mt-2">
                Visualize blood test sales performance
              </p>
            </div>
          </div>

          {/* Controls and Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-indigo-50 p-6 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-indigo-600 font-semibold mb-1">
                    Total Revenue
                  </p>
                  <p className="text-3xl font-bold text-gray-800">
                    ₹{totalAmount.toLocaleString()}
                  </p>
                </div>
                <FontAwesomeIcon
                  icon={faRupeeSign}
                  className="text-indigo-600 text-2xl"
                />
              </div>
            </div>

            <div className="bg-white border border-gray-100 p-6 rounded-xl shadow-sm">
              <div className="flex items-center space-x-4">
                <FontAwesomeIcon icon={faFilter} className="text-gray-500 text-lg" />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as TimeFilter)}
                  className="w-full p-3 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                  <option value="year">Last 365 Days</option>
                </select>
              </div>
            </div>
          </div>

          {/* Chart Section */}
          <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
            <Bar
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: "top",
                    labels: {
                      font: {
                        size: 14,
                      },
                    },
                  },
                  title: {
                    display: true,
                    text: "Test Performance Overview",
                    font: {
                      size: 18,
                    },
                  },
                  tooltip: {
                    backgroundColor: "rgba(0,0,0,0.9)",
                    titleFont: { size: 16 },
                    bodyFont: { size: 14 },
                    padding: 12,
                    displayColors: true,
                  },
                },
                scales: {
                  x: {
                    grid: {
                      display: false,
                    },
                    ticks: {
                      font: {
                        size: 12,
                      },
                    },
                  },
                  y: {
                    beginAtZero: true,
                    grid: {
                      color: "rgba(0,0,0,0.05)",
                    },
                    ticks: {
                      stepSize: 1,
                      font: {
                        size: 12,
                      },
                    },
                  },
                },
                animation: {
                  duration: 1000,
                  easing: "easeInOutQuart",
                },
              }}
              height={400}
            />
          </div>

          {/* Legend */}
          <div className="mt-6 flex items-center space-x-4 text-sm text-gray-600">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-indigo-600 rounded-sm mr-2"></div>
              Tests Sold
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminGraphPage;
