"use client";

import React, { useEffect, useState } from "react";
import { database } from "../../firebase"; // or wherever your firebase config is
import { ref, get, update, remove } from "firebase/database";
import { useForm, useFieldArray } from "react-hook-form";
import {
  FaEdit,
  FaTrash,
  FaRupeeSign,
  FaFlask,
  FaSave,
  FaPlus,
} from "react-icons/fa";

// -----------------------------
// INTERFACES
// -----------------------------
interface Parameter {
  name: string;
  unit: string;
  // When true: use common range for both genders.
  // When false: specify separate ranges.
  genderSpecific: boolean;
  // When true: use age-group specific fields.
  agegroup?: boolean;
  range: {
    // Without age groups:
    range?: string; // for common range
    male?: string;
    female?: string;
    // With age groups and common range:
    child?: string;
    adult?: string;
    older?: string;
    // With age groups and separate ranges:
    childmale?: string;
    childfemale?: string;
    adultmale?: string;
    adultfemale?: string;
    oldermale?: string;
    olderfemale?: string;
  };
}

interface BloodTestFormInputs {
  testName: string;
  price: number;
  parameters: Parameter[];
}

interface TestData extends BloodTestFormInputs {
  key: string;
  createdAt: string;
}

// -----------------------------
// EDIT TEST MODAL
// -----------------------------
interface EditTestModalProps {
  testData: TestData;
  onClose: () => void;
  onTestUpdated: () => void;
}

const EditTestModal: React.FC<EditTestModalProps> = ({
  testData,
  onClose,
  onTestUpdated,
}) => {
  // Preprocess parameters so that each has the proper range structure.
  const preppedParams = testData.parameters.map((param) => {
    if (param.agegroup) {
      if (param.genderSpecific) {
        // Age group with common range per group
        return {
          ...param,
          range: {
            child: param.range?.child || "",
            adult: param.range?.adult || "",
            older: param.range?.older || "",
          },
        };
      } else {
        // Age group with separate ranges for male and female
        return {
          ...param,
          range: {
            childmale: param.range?.childmale || "",
            childfemale: param.range?.childfemale || "",
            adultmale: param.range?.adultmale || "",
            adultfemale: param.range?.adultfemale || "",
            oldermale: param.range?.oldermale || "",
            olderfemale: param.range?.olderfemale || "",
          },
        };
      }
    } else {
      // Not using age groups
      if (param.genderSpecific) {
        return {
          ...param,
          range: {
            range: param.range?.range || "",
          },
        };
      } else {
        return {
          ...param,
          range: {
            male: param.range?.male || "",
            female: param.range?.female || "",
          },
        };
      }
    }
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<BloodTestFormInputs>({
    defaultValues: {
      testName: testData.testName,
      price: testData.price,
      parameters: preppedParams,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "parameters",
  });

  // Called on "Save Changes"
  const onSubmit = async (data: BloodTestFormInputs) => {
    try {
      const testRef = ref(database, `bloodTests/${testData.key}`);
      await update(testRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
      alert("Test updated successfully!");
      onTestUpdated();
      onClose();
    } catch (error) {
      console.error("Error updating test:", error);
      alert("Error updating test. Please try again.");
    }
  };

  // Called on "Delete Test"
  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this test?")) return;
    try {
      const testRef = ref(database, `bloodTests/${testData.key}`);
      await remove(testRef);
      alert("Test deleted successfully!");
      onTestUpdated();
      onClose();
    } catch (error) {
      console.error("Error deleting test:", error);
      alert("Error deleting test. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      {/* Make the modal scrollable */}
      <div className="bg-white p-6 rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center">
            <FaEdit className="mr-2" /> Edit Blood Test
          </h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-800">
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Test Name */}
          <div>
            <label className="block text-sm font-medium">Test Name</label>
            <input
              type="text"
              {...register("testName", { required: "Test name is required" })}
              className="w-full border rounded px-3 py-2"
            />
            {errors.testName && (
              <p className="text-red-500 text-xs">{errors.testName.message}</p>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium">
              Price (Rs.)
              <FaRupeeSign className="inline-block ml-1 text-green-600" />
            </label>
            <input
              type="number"
              step="0.01"
              {...register("price", {
                required: "Price is required",
                valueAsNumber: true,
              })}
              className="w-full border rounded px-3 py-2"
            />
            {errors.price && (
              <p className="text-red-500 text-xs">{errors.price.message}</p>
            )}
          </div>

          {/* Parameters */}
          <div>
            <label className="block text-sm font-medium">Parameters</label>
            {fields.map((field, index) => {
              const useCommonRange =
                watch(`parameters.${index}.genderSpecific`) === true;
              const useAgeGroup = watch(`parameters.${index}.agegroup`) === true;

              return (
                <div key={field.id} className="border p-4 rounded mb-2 bg-gray-50">
                  {/* Header row */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">
                      Parameter #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <FaTrash />
                    </button>
                  </div>

                  {/* Parameter Name */}
                  <div className="mt-2">
                    <label className="block text-xs">Parameter Name</label>
                    <input
                      type="text"
                      {...register(`parameters.${index}.name`, {
                        required: "Required",
                      })}
                      className="w-full border rounded px-2 py-1"
                      placeholder="e.g., Hemoglobin"
                    />
                    {errors.parameters?.[index]?.name && (
                      <p className="text-red-500 text-xs">
                        {errors.parameters[index]?.name?.message}
                      </p>
                    )}
                  </div>

                  {/* Parameter Unit */}
                  <div className="mt-2">
                    <label className="block text-xs">Unit</label>
                    <input
                      type="text"
                      {...register(`parameters.${index}.unit`, {
                        required: "Required",
                      })}
                      className="w-full border rounded px-2 py-1"
                      placeholder="e.g., g/dL"
                    />
                    {errors.parameters?.[index]?.unit && (
                      <p className="text-red-500 text-xs">
                        {errors.parameters[index]?.unit?.message}
                      </p>
                    )}
                  </div>

                  {/* Gender-Specific Checkbox */}
                  <div className="mt-2">
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        {...register(`parameters.${index}.genderSpecific`)}
                        className="mr-2"
                      />
                      Same range for both genders?
                    </label>
                  </div>

                  {/* Age Group Checkbox */}
                  <div className="mt-2">
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        {...register(`parameters.${index}.agegroup`)}
                        className="mr-2"
                      />
                      Different range for different age groups?
                    </label>
                  </div>

                  {/* Render range inputs based on options */}
                  <div className="mt-2">
                    {!useAgeGroup ? (
                      // Without age group: Use existing logic
                      useCommonRange ? (
                        <div>
                          <label className="block text-xs">
                            Common Range (e.g., 20-10)
                          </label>
                          <input
                            type="text"
                            {...register(`parameters.${index}.range.range`, {
                              required: "Required",
                            })}
                            className="w-full border rounded px-2 py-1"
                            placeholder="e.g., 20-10"
                          />
                          {errors.parameters?.[index]?.range?.range && (
                            <p className="text-red-500 text-xs">
                              {errors.parameters[index]?.range?.range?.message}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs">
                              Male Range (e.g., Less thane 18)
                            </label>
                            <input
                              type="text"
                              {...register(`parameters.${index}.range.male`, {
                                required: "Required",
                              })}
                              className="w-full border rounded px-2 py-1"
                              placeholder="e.g., Less thane 18"
                            />
                            {errors.parameters?.[index]?.range?.male && (
                              <p className="text-red-500 text-xs">
                                {errors.parameters[index]?.range?.male?.message}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs">
                              Female Range (e.g., Less thane 18)
                            </label>
                            <input
                              type="text"
                              {...register(`parameters.${index}.range.female`, {
                                required: "Required",
                              })}
                              className="w-full border rounded px-2 py-1"
                              placeholder="e.g., Less thane 18"
                            />
                            {errors.parameters?.[index]?.range?.female && (
                              <p className="text-red-500 text-xs">
                                {errors.parameters[index]?.range?.female?.message}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    ) : (
                      // With age group
                      useCommonRange ? (
                        // Age group with common range per group
                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <label className="block text-xs">
                              Child Range (e.g., 12-23)
                            </label>
                            <input
                              type="text"
                              {...register(`parameters.${index}.range.child`, {
                                required: "Required",
                              })}
                              className="w-full border rounded px-2 py-1"
                              placeholder="e.g., 12-23"
                            />
                            {errors.parameters?.[index]?.range?.child && (
                              <p className="text-red-500 text-xs">
                                {errors.parameters[index]?.range?.child?.message}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs">
                              Adult Range (e.g., 12-24)
                            </label>
                            <input
                              type="text"
                              {...register(`parameters.${index}.range.adult`, {
                                required: "Required",
                              })}
                              className="w-full border rounded px-2 py-1"
                              placeholder="e.g., 12-24"
                            />
                            {errors.parameters?.[index]?.range?.adult && (
                              <p className="text-red-500 text-xs">
                                {errors.parameters[index]?.range?.adult?.message}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs">
                              Older Range (e.g., more thane 60)
                            </label>
                            <input
                              type="text"
                              {...register(`parameters.${index}.range.older`, {
                                required: "Required",
                              })}
                              className="w-full border rounded px-2 py-1"
                              placeholder="e.g., more thane 60"
                            />
                            {errors.parameters?.[index]?.range?.older && (
                              <p className="text-red-500 text-xs">
                                {errors.parameters[index]?.range?.older?.message}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        // Age group with separate ranges for male and female
                        <div className="space-y-2">
                          {/* Child */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs">
                                Child Male (e.g., Less thane 18)
                              </label>
                              <input
                                type="text"
                                {...register(`parameters.${index}.range.childmale`, {
                                  required: "Required",
                                })}
                                className="w-full border rounded px-2 py-1"
                                placeholder="e.g., Less thane 18"
                              />
                              {errors.parameters?.[index]?.range?.childmale && (
                                <p className="text-red-500 text-xs">
                                  {errors.parameters[index]?.range?.childmale?.message}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs">
                                Child Female (e.g., Less thane 18)
                              </label>
                              <input
                                type="text"
                                {...register(`parameters.${index}.range.childfemale`, {
                                  required: "Required",
                                })}
                                className="w-full border rounded px-2 py-1"
                                placeholder="e.g., Less thane 18"
                              />
                              {errors.parameters?.[index]?.range?.childfemale && (
                                <p className="text-red-500 text-xs">
                                  {errors.parameters[index]?.range?.childfemale?.message}
                                </p>
                              )}
                            </div>
                          </div>
                          {/* Adult */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs">
                                Adult Male (e.g., Less thane 60)
                              </label>
                              <input
                                type="text"
                                {...register(`parameters.${index}.range.adultmale`, {
                                  required: "Required",
                                })}
                                className="w-full border rounded px-2 py-1"
                                placeholder="e.g., Less thane 60"
                              />
                              {errors.parameters?.[index]?.range?.adultmale && (
                                <p className="text-red-500 text-xs">
                                  {errors.parameters[index]?.range?.adultmale?.message}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs">
                                Adult Female (e.g., Less thane 60)
                              </label>
                              <input
                                type="text"
                                {...register(`parameters.${index}.range.adultfemale`, {
                                  required: "Required",
                                })}
                                className="w-full border rounded px-2 py-1"
                                placeholder="e.g., Less thane 60"
                              />
                              {errors.parameters?.[index]?.range?.adultfemale && (
                                <p className="text-red-500 text-xs">
                                  {errors.parameters[index]?.range?.adultfemale?.message}
                                </p>
                              )}
                            </div>
                          </div>
                          {/* Older */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs">
                                Older Male (e.g., more thane 60)
                              </label>
                              <input
                                type="text"
                                {...register(`parameters.${index}.range.oldermale`, {
                                  required: "Required",
                                })}
                                className="w-full border rounded px-2 py-1"
                                placeholder="e.g., more thane 60"
                              />
                              {errors.parameters?.[index]?.range?.oldermale && (
                                <p className="text-red-500 text-xs">
                                  {errors.parameters[index]?.range?.oldermale?.message}
                                </p>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs">
                                Older Female (e.g., more thane 60)
                              </label>
                              <input
                                type="text"
                                {...register(`parameters.${index}.range.olderfemale`, {
                                  required: "Required",
                                })}
                                className="w-full border rounded px-2 py-1"
                                placeholder="e.g., more thane 60"
                              />
                              {errors.parameters?.[index]?.range?.olderfemale && (
                                <p className="text-red-500 text-xs">
                                  {errors.parameters[index]?.range?.olderfemale?.message}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add parameter button */}
            <button
              type="button"
              onClick={() =>
                append({
                  name: "",
                  unit: "",
                  genderSpecific: true, // default to common range
                  agegroup: false, // default to not using age groups
                  range: { range: "" },
                })
              }
              className="mt-2 inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
            >
              <FaPlus className="mr-1" />
              Add Parameter
            </button>
          </div>

          {/* Footer Buttons */}
          <div className="flex justify-between items-center mt-4">
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center px-3 py-1 border border-red-600 text-red-600 rounded hover:bg-red-50"
            >
              <FaTrash className="mr-1" /> Delete Test
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <FaSave className="mr-1" /> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// -----------------------------
// MANAGE TESTS PAGE
// -----------------------------
const ManageBloodTests: React.FC = () => {
  const [tests, setTests] = useState<TestData[]>([]);
  const [selectedTest, setSelectedTest] = useState<TestData | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);

  // Fetch from Firebase
  const fetchTests = async () => {
    try {
      const testsRef = ref(database, "bloodTests");
      const snapshot = await get(testsRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        // Turn the object into an array of { key, ...testData }
        const testsArray: TestData[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));
        setTests(testsArray);
      }
    } catch (error) {
      console.error("Error fetching tests:", error);
    }
  };

  useEffect(() => {
    fetchTests();
  }, []);

  const handleEdit = (test: TestData) => {
    setSelectedTest(test);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedTest(null);
    fetchTests(); // refresh the tests after updating/deletion
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto bg-white p-6 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold mb-6 flex items-center">
          <FaFlask className="mr-2 text-blue-600" />
          Manage Blood Tests
        </h1>

        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-blue-100">
              <th className="border px-4 py-2">Test Name</th>
              <th className="border px-4 py-2">Price (Rs.)</th>
              <th className="border px-4 py-2">Parameters</th>
              <th className="border px-4 py-2">Created At</th>
              <th className="border px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((test) => (
              <tr key={test.key} className="hover:bg-gray-50">
                <td className="border px-4 py-2">{test.testName}</td>
                <td className="border px-4 py-2">₹{test.price}</td>
                <td className="border px-4 py-2">
                  {test.parameters?.length || 0} parameters
                </td>
                <td className="border px-4 py-2">
                  {new Date(test.createdAt).toLocaleDateString()}
                </td>
                <td className="border px-4 py-2">
                  <button
                    onClick={() => handleEdit(test)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <FaEdit />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {tests.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No blood tests found.
          </div>
        )}
      </div>

      {/* The Edit Modal */}
      {showModal && selectedTest && (
        <EditTestModal
          testData={selectedTest}
          onClose={handleModalClose}
          onTestUpdated={handleModalClose}
        />
      )}
    </div>
  );
};

export default ManageBloodTests;
