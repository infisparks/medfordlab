"use client";

import React, { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { database } from "../../firebase";
import { ref, push, set } from "firebase/database";
import {
  FaRupeeSign,
  FaPlus,
  FaTrash,
  FaFileImport,
  FaSave,
} from "react-icons/fa";

interface BloodTestFormInputs {
  testName: string;
  price: number;
  parameters: {
    name: string;
    unit: string;
    // When true: use the common range for both genders.
    // When false: provide separate ranges.
    genderSpecific: boolean;
    // When true: show additional fields for age groups.
    agegroup?: boolean;
    range: {
      // Without age groups:
      // If genderSpecific is true, store common range.
      range?: string;
      // If genderSpecific is false, store separate ranges.
      male?: string;
      female?: string;
      // With age groups and genderSpecific false:
      childmale?: string;
      childfemale?: string;
      adultmale?: string;
      adultfemale?: string;
      oldermale?: string;
      olderfemale?: string;
      // With age groups and genderSpecific true:
      child?: string;
      adult?: string;
      older?: string;
    };
  }[];
}

const CreateBloodTest: React.FC = () => {
  const [jsonText, setJsonText] = useState<string>("");

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<BloodTestFormInputs>({
    defaultValues: {
      testName: "",
      price: 0,
      parameters: [
        {
          name: "",
          unit: "",
          genderSpecific: true,
          agegroup: false,
          range: { range: "" },
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "parameters",
  });

  // Single test submission
  const onSubmit = async (data: BloodTestFormInputs) => {
    try {
      const testsRef = ref(database, "bloodTests");
      const newTestRef = push(testsRef);
      await set(newTestRef, {
        ...data,
        createdAt: new Date().toISOString(),
      });
      alert("Blood test created successfully!");
      reset();
    } catch (error) {
      console.error("Error saving blood test:", error);
      alert("Error saving blood test. Please try again.");
    }
  };

  // Bulk creation from pasted JSON
  const handleBulkCreate = async () => {
    try {
      const parsedData = JSON.parse(jsonText);
      if (!Array.isArray(parsedData)) {
        alert("Invalid JSON format. Please provide an array of tests.");
        return;
      }
      const testsRef = ref(database, "bloodTests");
      for (const test of parsedData) {
        const { testName, price = 0, parameters = [] } = test;
        const newTestRef = push(testsRef);
        await set(newTestRef, {
          testName,
          price,
          parameters,
          createdAt: new Date().toISOString(),
        });
      }
      alert("All tests from JSON created successfully!");
      setJsonText("");
    } catch (error) {
      console.error("Error creating tests from JSON:", error);
      alert("Error creating tests. Please ensure your JSON is valid.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white p-8 rounded-xl shadow-2xl space-y-8">
        <h2 className="text-3xl font-bold text-gray-800 flex items-center">
          <FaSave className="mr-2 text-blue-600" /> Create Blood Test
        </h2>

        {/* Single Test Creation Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Test Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
              <FaSave className="mr-1 text-blue-600" /> Test Name
            </label>
            <input
              type="text"
              {...register("testName", { required: "Test Name is required" })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter blood test name"
            />
            {errors.testName && (
              <p className="text-red-500 text-sm mt-1">
                {errors.testName.message}
              </p>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
              <FaRupeeSign className="mr-1 text-green-600" /> Price (Rs.)
            </label>
            <input
              type="number"
              step="0.01"
              {...register("price", {
                required: "Price is required",
                valueAsNumber: true,
              })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="Enter price in rupees"
            />
            {errors.price && (
              <p className="text-red-500 text-sm mt-1">
                {errors.price.message}
              </p>
            )}
          </div>

          {/* Parameters */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parameters
            </label>
            <div className="space-y-4">
              {fields.map((field, index) => {
                const genderSpecific = watch(`parameters.${index}.genderSpecific`);
                const agegroup = watch(`parameters.${index}.agegroup`);
                return (
                  <div key={field.id} className="border p-4 rounded-lg bg-gray-50">
                    <div className="flex flex-col sm:flex-row sm:space-x-4">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Parameter Name
                        </label>
                        <input
                          type="text"
                          {...register(`parameters.${index}.name`, {
                            required: "Parameter name is required",
                          })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., Hemoglobin"
                        />
                        {errors.parameters?.[index]?.name && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors.parameters[index]?.name?.message}
                          </p>
                        )}
                      </div>

                      <div className="flex-1 mt-4 sm:mt-0">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Unit
                        </label>
                        <input
                          type="text"
                          {...register(`parameters.${index}.unit`, {
                            required: "Parameter unit is required",
                          })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., g/dL"
                        />
                        {errors.parameters?.[index]?.unit && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors.parameters[index]?.unit?.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Checkboxes for gender and age group options */}
                    <div className="mt-4 space-y-2">
                      <label className="inline-flex items-center">
                        <input
                          type="checkbox"
                          {...register(`parameters.${index}.genderSpecific`)}
                          className="mr-2"
                        />
                        Same range for both genders?
                      </label>
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
                    <div className="mt-4">
                      {!agegroup && (
                        <>
                          {genderSpecific ? (
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Common Range (e.g., 20-10)
                              </label>
                              <input
                                type="text"
                                {...register(
                                  `parameters.${index}.range.range`,
                                  { required: "Common range is required" }
                                )}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g., 20-10"
                              />
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Male Range (e.g., 13-17)
                                </label>
                                <input
                                  type="text"
                                  {...register(
                                    `parameters.${index}.range.male`,
                                    { required: "Male range is required" }
                                  )}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  placeholder="e.g., 13-17"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Female Range (e.g., 12-20)
                                </label>
                                <input
                                  type="text"
                                  {...register(
                                    `parameters.${index}.range.female`,
                                    { required: "Female range is required" }
                                  )}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  placeholder="e.g., 12-20"
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {agegroup && (
                        <>
                          {genderSpecific ? (
                            // Age-group specific with common range per age group
                            <div className="grid grid-cols-1 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Child Range (e.g., 12-23)
                                </label>
                                <input
                                  type="text"
                                  {...register(
                                    `parameters.${index}.range.child`,
                                    { required: "Child range is required" }
                                  )}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  placeholder="e.g., 12-23"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Adult Range (e.g., 12-24)
                                </label>
                                <input
                                  type="text"
                                  {...register(
                                    `parameters.${index}.range.adult`,
                                    { required: "Adult range is required" }
                                  )}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  placeholder="e.g., 12-24"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Older Range (e.g., 14-45)
                                </label>
                                <input
                                  type="text"
                                  {...register(
                                    `parameters.${index}.range.older`,
                                    { required: "Older range is required" }
                                  )}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  placeholder="e.g., 14-45"
                                />
                              </div>
                            </div>
                          ) : (
                            // Age-group specific with separate ranges for male and female
                            <div className="space-y-4">
                              {/* Child */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Child Male (e.g., 13-17)
                                  </label>
                                  <input
                                    type="text"
                                    {...register(
                                      `parameters.${index}.range.childmale`,
                                      { required: "Child male range is required" }
                                    )}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., 13-17"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Child Female (e.g., 12-20)
                                  </label>
                                  <input
                                    type="text"
                                    {...register(
                                      `parameters.${index}.range.childfemale`,
                                      { required: "Child female range is required" }
                                    )}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., 12-20"
                                  />
                                </div>
                              </div>
                              {/* Adult */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Adult Male (e.g., 12-22)
                                  </label>
                                  <input
                                    type="text"
                                    {...register(
                                      `parameters.${index}.range.adultmale`,
                                      { required: "Adult male range is required" }
                                    )}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., 12-22"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Adult Female (e.g., 13-31)
                                  </label>
                                  <input
                                    type="text"
                                    {...register(
                                      `parameters.${index}.range.adultfemale`,
                                      { required: "Adult female range is required" }
                                    )}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., 13-31"
                                  />
                                </div>
                              </div>
                              {/* Older */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Older Male (e.g., 14-45)
                                  </label>
                                  <input
                                    type="text"
                                    {...register(
                                      `parameters.${index}.range.oldermale`,
                                      { required: "Older male range is required" }
                                    )}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., 14-45"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Older Female (e.g., 15-45)
                                  </label>
                                  <input
                                    type="text"
                                    {...register(
                                      `parameters.${index}.range.olderfemale`,
                                      { required: "Older female range is required" }
                                    )}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., 15-45"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="mt-4 text-red-500 hover:text-red-700 flex items-center"
                    >
                      <FaTrash className="mr-1" /> Remove
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() =>
                append({
                  name: "",
                  unit: "",
                  genderSpecific: true,
                  agegroup: false,
                  range: { range: "" },
                })
              }
              className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <FaPlus className="mr-2" /> Add Parameter
            </button>
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <FaSave className="mr-2" /> Create Blood Test
          </button>
        </form>

        {/* Bulk Creation from JSON */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center">
            <FaFileImport className="mr-2 text-green-600" /> Create Multiple Tests from JSON
          </h3>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Paste JSON here
          </label>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={6}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            placeholder={`[
  {
    "testName": "Complete Blood Count",
    "price": 150,
    "parameters": [
      {
        "name": "Hemoglobin",
        "unit": "g/dL",
        "genderSpecific": false,
        "agegroup": false,
        "range": {
          "male": "13-17",
          "female": "12-20"
        }
      },
      {
        "name": "Hemoglobin",
        "unit": "g/dL",
        "genderSpecific": false,
        "agegroup": true,
        "range": {
          "childmale": "13-17",
          "childfemale": "12-20",
          "adultmale": "12-22",
          "adultfemale": "13-31",
          "oldermale": "14-45",
          "olderfemale": "15-45"
        }
      },
      {
        "name": "Hemoglobin",
        "unit": "g/dL",
        "genderSpecific": true,
        "agegroup": true,
        "range": {
          "child": "12-23",
          "adult": "12-24",
          "older": "12-26"
        }
      },
      {
        "name": "White Blood Cells",
        "unit": "10^9/L",
        "genderSpecific": true,
        "agegroup": false,
        "range": {
          "range": "20-10"
        }
      }
    ]
  }
]`}
          ></textarea>

          <button
            type="button"
            onClick={handleBulkCreate}
            className="mt-3 w-full inline-flex items-center justify-center bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            <FaFileImport className="mr-2" /> Create Tests from JSON
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateBloodTest;
