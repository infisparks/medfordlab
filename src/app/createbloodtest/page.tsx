"use client";

import React, { useState } from "react";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { database } from "../../firebase";
import { ref, push, set } from "firebase/database";

interface BloodTestFormInputs {
  testName: string;
  price: number;
  parameters: {
    name: string;
    unit: string;
    normalRangeStart: number;
    normalRangeEnd: number;
  }[];
}

const CreateBloodTest: React.FC = () => {
  // State to hold the raw JSON that the user pastes
  const [jsonText, setJsonText] = useState<string>("");

  // React Hook Form setup
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<BloodTestFormInputs>({
    defaultValues: {
      testName: "",
      price: 0,
      parameters: [
        { name: "", unit: "", normalRangeStart: 0, normalRangeEnd: 0 },
      ],
    },
  });

  // Field Array for "parameters"
  const { fields, append, remove } = useFieldArray({
    control,
    name: "parameters",
  });

  // Single test submission
  const onSubmit: SubmitHandler<BloodTestFormInputs> = async (data) => {
    try {
      // Reference the 'bloodTests' node in Realtime DB
      const testsRef = ref(database, "bloodTests");
      // Create a new entry using push()
      const newTestRef = push(testsRef);

      // Save the data along with a timestamp
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
      // Parse the JSON text
      const parsedData = JSON.parse(jsonText);

      if (!Array.isArray(parsedData)) {
        alert("Invalid JSON format. Please provide an array of tests.");
        return;
      }

      const testsRef = ref(database, "bloodTests");

      // Create each test in Firebase
      for (const test of parsedData) {
        // If the "price" is not in the JSON, default to 0
        const { testName, price = 0, parameters = [] } = test;

        // Push a new entry for each test
        const newTestRef = push(testsRef);
        await set(newTestRef, {
          testName,
          price,
          parameters,
          createdAt: new Date().toISOString(),
        });
      }

      alert("All tests from JSON created successfully!");
      // Clear the textarea
      setJsonText("");
    } catch (error) {
      console.error("Error creating tests from JSON:", error);
      alert("Error creating tests. Please ensure your JSON is valid.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-3xl w-full bg-white p-8 rounded-xl shadow-lg space-y-6">
        <h2 className="text-2xl font-bold text-gray-800">Create Blood Test</h2>

        {/* ----------------------------------- */}
        {/* 1) SINGLE TEST CREATION FORM        */}
        {/* ----------------------------------- */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Test Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Test Name
            </label>
            <input
              type="text"
              {...register("testName", { required: "Test Name is required" })}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price (Rs.)
            </label>
            <input
              type="number"
              step="0.01"
              {...register("price", {
                required: "Price is required",
                valueAsNumber: true,
              })}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Enter price in rupees"
            />
            {errors.price && (
              <p className="text-red-500 text-sm mt-1">{errors.price.message}</p>
            )}
          </div>

          {/* Parameters */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parameters
            </label>
            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="border p-4 rounded-lg">
                  {/* First Row: Parameter name & Unit */}
                  <div className="flex flex-col sm:flex-row sm:space-x-4">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Parameter
                      </label>
                      <input
                        type="text"
                        {...register(`parameters.${index}.name`, {
                          required: "Parameter name is required",
                        })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Hemoglobin"
                      />
                      {errors.parameters?.[index]?.name && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.parameters[index]?.name?.message}
                        </p>
                      )}
                    </div>

                    <div className="flex-1 mt-4 sm:mt-0">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Unit
                      </label>
                      <input
                        type="text"
                        {...register(`parameters.${index}.unit`, {
                          required: "Parameter unit is required",
                        })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., g/dL"
                      />
                      {errors.parameters?.[index]?.unit && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.parameters[index]?.unit?.message}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Second Row: Normal Range Start & End + Remove button */}
                  <div className="mt-4 flex flex-col sm:flex-row sm:space-x-4 items-start sm:items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Normal Range Start
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        {...register(
                          `parameters.${index}.normalRangeStart`,
                          {
                            required: "Normal range start is required",
                            valueAsNumber: true,
                          }
                        )}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 23"
                      />
                      {errors.parameters?.[index]?.normalRangeStart && (
                        <p className="text-red-500 text-xs mt-1">
                          {
                            errors.parameters[index]?.normalRangeStart
                              ?.message
                          }
                        </p>
                      )}
                    </div>

                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Normal Range End
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        {...register(
                          `parameters.${index}.normalRangeEnd`,
                          {
                            required: "Normal range end is required",
                            valueAsNumber: true,
                          }
                        )}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., 25"
                      />
                      {errors.parameters?.[index]?.normalRangeEnd && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors.parameters[index]?.normalRangeEnd?.message}
                        </p>
                      )}
                    </div>

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
                </div>
              ))}
            </div>

            {/* Add Parameter Button */}
            <button
              type="button"
              onClick={() =>
                append({
                  name: "",
                  unit: "",
                  normalRangeStart: 0,
                  normalRangeEnd: 0,
                })
              }
              className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Add Parameter
            </button>
          </div>

          {/* Submit Single Test */}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Create Blood Test
          </button>
        </form>

        {/* ----------------------------------- */}
        {/* 2) BULK CREATION FROM JSON TEXT     */}
        {/* ----------------------------------- */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Or, create multiple tests from JSON
          </h3>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Paste JSON here
          </label>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={6}
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder='[{"testName": "Test1","price": 200,"parameters":[{"name":"Param1","unit":"U","normalRangeStart":1,"normalRangeEnd":2}]}]'
          ></textarea>

          <button
            type="button"
            onClick={handleBulkCreate}
            className="mt-3 w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            Create Tests from JSON
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateBloodTest;
