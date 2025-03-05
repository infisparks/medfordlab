"use client";

import React, { useEffect, useState } from "react";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { database } from "../../firebase";
import { ref, get, set, remove } from "firebase/database";
import {
  ClipboardDocumentListIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

interface BloodTestSelection {
  testId: string;
  testName: string;
  price: number;
}

interface PackageType {
  id: string;
  packageName: string;
  tests: BloodTestSelection[];
  discountPercentage: number;
}

interface EditPackageFormInputs {
  packageName: string;
  tests: {
    testId: string;
    testName: string;
    price: number;
  }[];
  discountPercentage: number;
}

const PackageDetailPage: React.FC = () => {
  const [packages, setPackages] = useState<PackageType[]>([]);
  const [availableTests, setAvailableTests] = useState<
    { id: string; testName: string; price: number }[]
  >([]);
  const [editingPackage, setEditingPackage] = useState<PackageType | null>(null);

  // Fetch available packages
  const fetchPackages = async () => {
    try {
      const packagesRef = ref(database, "packages");
      const snapshot = await get(packagesRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const packagesArray: PackageType[] = Object.keys(data).map((key) => ({
          id: key,
          packageName: data[key].packageName,
          tests: data[key].tests,
          discountPercentage: Number(data[key].discountPercentage),
        }));
        setPackages(packagesArray);
      }
    } catch (error) {
      console.error("Error fetching packages:", error);
    }
  };

  // Fetch available blood tests for the dropdown options
  const fetchAvailableTests = async () => {
    try {
      const testsRef = ref(database, "bloodTests");
      const snapshot = await get(testsRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const testsArray = Object.keys(data).map((key) => ({
          id: key,
          testName: data[key].testName,
          price: Number(data[key].price),
        }));
        setAvailableTests(testsArray);
      }
    } catch (error) {
      console.error("Error fetching tests:", error);
    }
  };

  useEffect(() => {
    fetchPackages();
    fetchAvailableTests();
  }, []);

  // Delete package handler
  const handleDelete = async (pkgId: string) => {
    if (!confirm("Are you sure you want to delete this package?")) return;
    try {
      await remove(ref(database, `packages/${pkgId}`));
      alert("Package deleted successfully!");
      fetchPackages();
    } catch (error) {
      console.error("Error deleting package:", error);
      alert("Error deleting package. Please try again.");
    }
  };

  // Enhanced Edit Form Component with new design
  const EditPackageForm: React.FC<{ pkg: PackageType }> = ({ pkg }) => {
    const {
      register,
      control,
      handleSubmit,
      setValue,
      formState: { errors, isSubmitting },
    } = useForm<EditPackageFormInputs>({
      defaultValues: {
        packageName: pkg.packageName,
        tests:
          pkg.tests.length > 0
            ? pkg.tests
            : [{ testId: "", testName: "", price: 0 }],
        discountPercentage: pkg.discountPercentage,
      },
    });

    const { fields, append, remove } = useFieldArray({
      control,
      name: "tests",
    });

    const onSubmit: SubmitHandler<EditPackageFormInputs> = async (data) => {
      try {
        await set(ref(database, `packages/${pkg.id}`), {
          ...data,
          createdAt: new Date().toISOString(),
        });
        alert("Package updated successfully!");
        setEditingPackage(null);
        fetchPackages();
      } catch (error) {
        console.error("Error updating package:", error);
        alert("Error updating package. Please try again.");
      }
    };

    return (
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8"
      >
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-900">Edit Package</h3>
            <button
              type="button"
              onClick={() => setEditingPackage(null)}
              className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Package Name
            </label>
            <input
              type="text"
              {...register("packageName", { required: "Required" })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter package name"
            />
            {errors.packageName && (
              <p className="text-red-600 text-sm mt-2 flex items-center">
                <XMarkIcon className="h-4 w-4 mr-1" />{" "}
                {errors.packageName.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Discount Percentage
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                {...register("discountPercentage", {
                  required: "Required",
                  valueAsNumber: true,
                })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 pl-16"
                placeholder="Enter discount percentage"
              />
              <span className="absolute left-4 top-3.5 text-gray-500">%</span>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Included Tests
              </h4>
              <button
                type="button"
                onClick={() => append({ testId: "", testName: "", price: 0 })}
                className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Add Test</span>
              </button>
            </div>
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-start space-x-4 group">
                  <div className="flex-1">
                    <select
                      {...register(`tests.${index}.testId`, { required: "Required" })}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const selectedTest = availableTests.find(
                          (test) => test.id === selectedId
                        );
                        if (selectedTest) {
                          setValue(
                            `tests.${index}.testName`,
                            selectedTest.testName
                          );
                          setValue(
                            `tests.${index}.price`,
                            selectedTest.price
                          );
                        } else {
                          setValue(`tests.${index}.testName`, "");
                          setValue(`tests.${index}.price`, 0);
                        }
                      }}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a test</option>
                      {availableTests.map((test) => (
                        <option key={test.id} value={test.id}>
                          {test.testName} (₹{test.price.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-32">
                    <input
                      type="number"
                      step="0.01"
                      {...register(`tests.${index}.price`, {
                        required: "Required",
                        valueAsNumber: true,
                      })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-gray-50"
                      readOnly
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex space-x-4 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm("Are you sure you want to delete this package?")
                ) {
                  handleDelete(pkg.id);
                  setEditingPackage(null);
                }
              }}
              className="px-6 py-3 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors"
            >
              Delete Package
            </button>
          </div>
        </div>
      </form>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center space-x-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <ClipboardDocumentListIcon className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Packages Management
            </h1>
            <p className="text-gray-500 mt-1">
              Create and manage diagnostic test packages
            </p>
          </div>
        </div>

        {editingPackage ? (
          <EditPackageForm pkg={editingPackage} />
        ) : (
          <div className="mb-8 bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <p className="text-gray-600 text-sm font-medium">
              ✏️ Click the edit icon on any package to modify its contents
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg) => {
            const totalPrice = pkg.tests.reduce(
              (sum, test) => sum + test.price,
              0
            );
            const discountedPrice =
              totalPrice * (1 - pkg.discountPercentage / 100);

            return (
              <div
                key={pkg.id}
                className="group bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200"
              >
                <div className="p-6 pb-4">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {pkg.packageName}
                    </h3>
                    <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingPackage(pkg)}
                        className="p-2 hover:bg-blue-50 rounded-lg text-blue-600"
                        title="Edit Package"
                      >
                        <PencilSquareIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(pkg.id)}
                        className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                        title="Delete Package"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <div className="mb-4 flex items-center space-x-3">
                    <div className="bg-green-100 px-3 py-1 rounded-full text-sm font-medium text-green-800">
                      {pkg.tests.length} tests
                    </div>
                    <div className="bg-purple-100 px-3 py-1 rounded-full text-sm font-medium text-purple-800">
                      {pkg.discountPercentage}% off
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    {pkg.tests.map((test, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center text-sm"
                      >
                        <span className="text-gray-600">
                          {test.testName}
                        </span>
                        <span className="text-gray-900 font-medium">
                          ₹{test.price.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-gray-100 p-4 bg-gray-50 rounded-b-xl">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-500">Total Price</p>
                      <div className="flex items-baseline space-x-2">
                        <span className="text-gray-400 line-through text-sm">
                          ₹{totalPrice.toFixed(2)}
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          ₹{discountedPrice.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PackageDetailPage;
