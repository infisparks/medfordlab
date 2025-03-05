"use client";

import React, { useEffect, useState } from "react";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { database } from "../../firebase";
import { ref, push, set, get } from "firebase/database";
import { ClipboardDocumentListIcon } from "@heroicons/react/24/outline";

interface PackageFormInputs {
  packageName: string;
  tests: {
    testId: string;
    testName: string;
    price: number;
  }[];
  discountPercentage: number;
}

const PackageCreationPage: React.FC = () => {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<PackageFormInputs>({
    defaultValues: {
      packageName: "",
      tests: [{ testId: "", testName: "", price: 0 }],
      discountPercentage: 0,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tests",
  });

  // State to hold available tests from Firebase
  const [availableTests, setAvailableTests] = useState<
    { id: string; testName: string; price: number }[]
  >([]);

  useEffect(() => {
    const fetchTests = async () => {
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

    fetchTests();
  }, []);

  const onSubmit: SubmitHandler<PackageFormInputs> = async (data) => {
    try {
      // Save package data to Firebase under the "packages" node
      const packagesRef = ref(database, "packages");
      const newPackageRef = push(packagesRef);
      await set(newPackageRef, { ...data, createdAt: new Date().toISOString() });

      alert("Package created successfully!");
      reset();
    } catch (error) {
      console.error("Error creating package:", error);
      alert("Error creating package, please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center mb-8">
          <ClipboardDocumentListIcon className="h-8 w-8 text-blue-600 mr-3" />
          <h2 className="text-2xl font-bold text-gray-800">Create Package</h2>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Package Name */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Package Name
            </label>
            <input
              type="text"
              {...register("packageName", {
                required: "Package Name is required",
              })}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Enter package name"
            />
            {errors.packageName && (
              <p className="text-red-500 text-sm mt-1">
                {errors.packageName.message}
              </p>
            )}
          </div>

          {/* Tests Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Select Tests for Package
            </label>
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex flex-col sm:flex-row sm:space-x-4 items-start sm:items-end border p-4 rounded-lg"
                >
                  {/* Test Dropdown */}
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Test
                    </label>
                    <select
                      {...register(`tests.${index}.testId` as const, {
                        required: "Test is required",
                      })}
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
                          // Reset values if no test is selected
                          setValue(`tests.${index}.testName`, "");
                          setValue(`tests.${index}.price`, 0);
                        }
                      }}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a test</option>
                      {availableTests.map((test) => (
                        <option key={test.id} value={test.id}>
                          {test.testName}
                        </option>
                      ))}
                    </select>
                    {errors.tests?.[index]?.testId && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.tests[index]?.testId?.message}
                      </p>
                    )}
                  </div>

                  {/* Test Price (auto-filled) */}
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Price (Rs.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register(`tests.${index}.price` as const, {
                        required: "Price is required",
                        valueAsNumber: true,
                      })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Auto-filled"
                      readOnly
                    />
                    {errors.tests?.[index]?.price && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.tests[index]?.price?.message}
                      </p>
                    )}
                  </div>

                  {/* Remove Test Button */}
                  <div>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-red-500 hover:text-red-700 text-sm mt-4 sm:mt-0"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                append({ testId: "", testName: "", price: 0 })
              }
              className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Add Test
            </button>
          </div>

          {/* Package Discount */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Package Discount (%)
            </label>
            <input
              type="number"
              step="0.01"
              {...register("discountPercentage", {
                required: "Discount percentage is required",
                valueAsNumber: true,
              })}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Enter discount percentage for package"
            />
            {errors.discountPercentage && (
              <p className="text-red-500 text-sm mt-1">
                {errors.discountPercentage.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200"
          >
            {isSubmitting ? "Submitting..." : "Create Package"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PackageCreationPage;
