"use client";

import React from "react";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { database } from "../../firebase";
import { ref, push, set } from "firebase/database";

interface BloodTestFormInputs {
  testName: string;
  price: number;
  parameters: {
    name: string;
    unit: string;
  }[];
}

const CreateBloodTest: React.FC = () => {
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
      parameters: [{ name: "", unit: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "parameters",
  });

  const onSubmit: SubmitHandler<BloodTestFormInputs> = async (data) => {
    try {
      // Reference the 'bloodTests' node in the Realtime Database
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-3xl w-full bg-white p-8 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          Create Blood Test
        </h2>
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
              Price ($)
            </label>
            <input
              type="number"
              step="0.01"
              {...register("price", {
                required: "Price is required",
                valueAsNumber: true,
              })}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Enter price"
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
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex flex-col sm:flex-row sm:space-x-4 items-start sm:items-end border p-4 rounded-lg"
                >
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Parameter
                    </label>
                    <input
                      type="text"
                      {...register(`parameters.${index}.name` as const, {
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
                      {...register(`parameters.${index}.unit` as const, {
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
                  <div className="mt-4 sm:mt-0">
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => append({ name: "", unit: "" })}
              className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Add Parameter
            </button>
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Create Blood Test
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateBloodTest;
