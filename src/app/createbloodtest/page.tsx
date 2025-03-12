"use client";

import React, { useState } from "react";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { database } from "../../firebase";
import { ref, push, set } from "firebase/database";
import {
  FaRupeeSign,
  FaPlus,
  FaTrash,
  FaFileImport,
  FaSave,
} from "react-icons/fa";

// Updated interfaces with simplified range structure
interface AgeRangeItem {
  rangeKey: string;
  rangeValue: string;
}

interface Subparameter {
  name: string;
  unit: string;
  range: {
    male: AgeRangeItem[];
    female: AgeRangeItem[];
  };
}

interface Parameter {
  name: string;
  unit: string;
  range: {
    male: AgeRangeItem[];
    female: AgeRangeItem[];
  };
  subparameters?: Subparameter[];
}

interface BloodTestFormInputs {
  testName: string;
  price: number;
  parameters: Parameter[];
}

// Subparameter Item Component
interface SubparameterItemProps {
  parameterIndex: number;
  subIndex: number;
  control: any;
  register: any;
  errors: any;
  remove: (index: number) => void;
}

const SubparameterItem: React.FC<SubparameterItemProps> = ({
  parameterIndex,
  subIndex,
  control,
  register,
  errors,
  remove,
}) => {
  const {
    fields: maleRanges,
    append: appendMaleRange,
    remove: removeMaleRange,
  } = useFieldArray({
    control,
    name: `parameters.${parameterIndex}.subparameters.${subIndex}.range.male`,
  });
  const {
    fields: femaleRanges,
    append: appendFemaleRange,
    remove: removeFemaleRange,
  } = useFieldArray({
    control,
    name: `parameters.${parameterIndex}.subparameters.${subIndex}.range.female`,
  });

  return (
    <div className="border p-4 rounded-lg bg-white mt-2">
      <div className="flex flex-col sm:flex-row sm:space-x-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Subparameter Name
          </label>
          <input
            type="text"
            {...register(
              `parameters.${parameterIndex}.subparameters.${subIndex}.name`,
              { required: "Subparameter name is required" }
            )}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Hemoglobin"
          />
          {errors?.parameters?.[parameterIndex]?.subparameters?.[subIndex]
            ?.name && (
            <p className="text-red-500 text-xs mt-1">
              {
                errors.parameters[parameterIndex].subparameters[subIndex].name
                  .message
              }
            </p>
          )}
        </div>
        <div className="flex-1 mt-4 sm:mt-0">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Unit
          </label>
          <input
            type="text"
            {...register(
              `parameters.${parameterIndex}.subparameters.${subIndex}.unit`,
              { required: "Subparameter unit is required" }
            )}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., g/dL"
          />
          {errors?.parameters?.[parameterIndex]?.subparameters?.[subIndex]
            ?.unit && (
            <p className="text-red-500 text-xs mt-1">
              {
                errors.parameters[parameterIndex].subparameters[subIndex].unit
                  .message
              }
            </p>
          )}
        </div>
      </div>

      {/* Male Ranges */}
      <div className="mt-2">
        <h5 className="text-sm font-semibold mb-1">Male Ranges</h5>
        {maleRanges.map((field, mIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              {...register(
                `parameters.${parameterIndex}.subparameters.${subIndex}.range.male.${mIndex}.rangeKey`,
                { required: "Key is required" }
              )}
              className="px-2 py-1 border rounded w-1/2"
              placeholder='e.g., "0-20"'
            />
            <input
              type="text"
              {...register(
                `parameters.${parameterIndex}.subparameters.${subIndex}.range.male.${mIndex}.rangeValue`,
                { required: "Range value is required" }
              )}
              className="px-2 py-1 border rounded w-1/2"
              placeholder='e.g., "15-20"'
            />
            <button
              type="button"
              onClick={() => removeMaleRange(mIndex)}
              className="text-red-500"
            >
              <FaTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => appendMaleRange({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 transition"
        >
          <FaPlus className="mr-2" /> Add Male Range
        </button>
      </div>

      {/* Female Ranges */}
      <div className="mt-4">
        <h5 className="text-sm font-semibold mb-1">Female Ranges</h5>
        {femaleRanges.map((field, fIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              {...register(
                `parameters.${parameterIndex}.subparameters.${subIndex}.range.female.${fIndex}.rangeKey`,
                { required: "Key is required" }
              )}
              className="px-2 py-1 border rounded w-1/2"
              placeholder='e.g., "0-20"'
            />
            <input
              type="text"
              {...register(
                `parameters.${parameterIndex}.subparameters.${subIndex}.range.female.${fIndex}.rangeValue`,
                { required: "Range value is required" }
              )}
              className="px-2 py-1 border rounded w-1/2"
              placeholder='e.g., "15-21"'
            />
            <button
              type="button"
              onClick={() => removeFemaleRange(fIndex)}
              className="text-red-500"
            >
              <FaTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => appendFemaleRange({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 transition"
        >
          <FaPlus className="mr-2" /> Add Female Range
        </button>
      </div>

      <button
        type="button"
        onClick={() => remove(subIndex)}
        className="mt-4 text-red-500 hover:text-red-700 flex items-center"
      >
        <FaTrash className="mr-1" /> Remove Subparameter
      </button>
    </div>
  );
};

// Subparameter Fields Container
interface SubparameterFieldsProps {
  parameterIndex: number;
  control: any;
  register: any;
  errors: any;
}

const SubparameterFields: React.FC<SubparameterFieldsProps> = ({
  parameterIndex,
  control,
  register,
  errors,
}) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `parameters.${parameterIndex}.subparameters`,
  });

  return (
    <div className="mt-4 border-t pt-4">
      <h4 className="text-sm font-medium text-gray-700 mb-2">
        Subparameters
      </h4>
      {fields.map((field, subIndex) => (
        <SubparameterItem
          key={field.id}
          parameterIndex={parameterIndex}
          subIndex={subIndex}
          control={control}
          register={register}
          errors={errors}
          remove={remove}
        />
      ))}
      <button
        type="button"
        onClick={() =>
          append({
            name: "",
            unit: "",
            range: {
              male: [{ rangeKey: "", rangeValue: "" }],
              female: [{ rangeKey: "", rangeValue: "" }],
            },
          })
        }
        className="mt-2 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 transition"
      >
        <FaPlus className="mr-2" /> Add Subparameter
      </button>
    </div>
  );
};

// Parameter Item Component
interface ParameterItemProps {
  index: number;
  control: any;
  register: any;
  errors: any;
  remove: (index: number) => void;
}

const ParameterItem: React.FC<ParameterItemProps> = ({
  index,
  control,
  register,
  errors,
  remove,
}) => {
  const {
    fields: maleRanges,
    append: appendMaleRange,
    remove: removeMaleRange,
  } = useFieldArray({
    control,
    name: `parameters.${index}.range.male`,
  });
  const {
    fields: femaleRanges,
    append: appendFemaleRange,
    remove: removeFemaleRange,
  } = useFieldArray({
    control,
    name: `parameters.${index}.range.female`,
  });

  return (
    <div className="border p-4 rounded-lg bg-gray-50">
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

      {/* Male Ranges */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold mb-1">Male Ranges</h4>
        {maleRanges.map((field, mIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              {...register(
                `parameters.${index}.range.male.${mIndex}.rangeKey`,
                { required: "Key is required" }
              )}
              className="px-2 py-1 border rounded w-1/2"
              placeholder='e.g., "0-20"'
            />
            <input
              type="text"
              {...register(
                `parameters.${index}.range.male.${mIndex}.rangeValue`,
                { required: "Range value is required" }
              )}
              className="px-2 py-1 border rounded w-1/2"
              placeholder='e.g., "15-20"'
            />
            <button
              type="button"
              onClick={() => removeMaleRange(mIndex)}
              className="text-red-500"
            >
              <FaTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => appendMaleRange({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 transition"
        >
          <FaPlus className="mr-2" /> Add Male Range
        </button>
      </div>

      {/* Female Ranges */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold mb-1">Female Ranges</h4>
        {femaleRanges.map((field, fIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              {...register(
                `parameters.${index}.range.female.${fIndex}.rangeKey`,
                { required: "Key is required" }
              )}
              className="px-2 py-1 border rounded w-1/2"
              placeholder='e.g., "0-20"'
            />
            <input
              type="text"
              {...register(
                `parameters.${index}.range.female.${fIndex}.rangeValue`,
                { required: "Range value is required" }
              )}
              className="px-2 py-1 border rounded w-1/2"
              placeholder='e.g., "15-21"'
            />
            <button
              type="button"
              onClick={() => removeFemaleRange(fIndex)}
              className="text-red-500"
            >
              <FaTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => appendFemaleRange({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 transition"
        >
          <FaPlus className="mr-2" /> Add Female Range
        </button>
      </div>

      {/* Subparameters */}
      <SubparameterFields
        parameterIndex={index}
        control={control}
        register={register}
        errors={errors}
      />

      <button
        type="button"
        onClick={() => remove(index)}
        className="mt-4 text-red-500 hover:text-red-700 flex items-center"
      >
        <FaTrash className="mr-1" /> Remove Parameter
      </button>
    </div>
  );
};

// Main Component
const CreateBloodTest: React.FC = () => {
  const [jsonText, setJsonText] = useState<string>("");

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
        {
          name: "",
          unit: "",
          range: {
            male: [{ rangeKey: "", rangeValue: "" }],
            female: [{ rangeKey: "", rangeValue: "" }],
          },
          subparameters: [],
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "parameters",
  });

  // Single test submission
  const onSubmit: SubmitHandler<BloodTestFormInputs> = async (data) => {
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
              {fields.map((field, index) => (
                <ParameterItem
                  key={field.id}
                  index={index}
                  control={control}
                  register={register}
                  errors={errors}
                  remove={remove}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                append({
                  name: "",
                  unit: "",
                  range: {
                    male: [{ rangeKey: "", rangeValue: "" }],
                    female: [{ rangeKey: "", rangeValue: "" }],
                  },
                  subparameters: [],
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
        "range": {
          "male": {
            "0-20": "15-20",
            "20-1000": "15-60"
          },
          "female": {
            "0-20": "15-21",
            "20-1000": "15-61",
            "1000-20000": "14-60"
          }
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
