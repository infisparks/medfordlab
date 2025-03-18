"use client";

import React, { useState } from "react";
import {
  useForm,
  useFieldArray,
  useWatch,
  SubmitHandler,
} from "react-hook-form";
import { database } from "../../firebase";
import { ref, push, set } from "firebase/database";
import {
  FaRupeeSign,
  FaPlus,
  FaTrash,
  FaFileImport,
  FaSave,
} from "react-icons/fa";

// -------------------------
// Interfaces
// -------------------------

interface AgeRangeItem {
  rangeKey: string;
  rangeValue: string;
}

interface Parameter {
  name: string;
  unit: string;
  valueType: "text" | "number"; // New key to specify the type of value accepted
  formula?: string; // Optional formula field for auto-calculation
  range: {
    male: AgeRangeItem[];
    female: AgeRangeItem[];
  };
}

interface Subheading {
  title: string;
  parameterNames: string[];
}

interface BloodTestFormInputs {
  testName: string;
  price: number; // overall test price if the entire test is booked
  type: "in-house" | "outsource"; // new field for test type
  parameters: Parameter[];
  subheadings: Subheading[];
}

// -------------------------
// Global Parameter Item Component
// -------------------------
interface GlobalParameterItemProps {
  index: number;
  control: any;
  register: any;
  errors: any;
  remove: (index: number) => void;
}

const GlobalParameterItem: React.FC<GlobalParameterItemProps> = ({
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
    <div className="border p-4 rounded-lg bg-white mt-2">
      {/* Parameter Basic Info */}
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
            placeholder="e.g. Hemoglobin"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          />
          {errors.parameters?.[index]?.name && (
            <p className="text-red-500 text-xs mt-1">
              {errors.parameters[index].name.message}
            </p>
          )}
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Unit
          </label>
          <input
            type="text"
            {...register(`parameters.${index}.unit`, {
              required: "Unit is required",
            })}
            placeholder="e.g. mg/dL or g/dL"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          />
          {errors.parameters?.[index]?.unit && (
            <p className="text-red-500 text-xs mt-1">
              {errors.parameters[index].unit.message}
            </p>
          )}
        </div>
      </div>

      {/* Value Type Selection */}
      <div className="mt-4">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Value Type
        </label>
        <select
          {...register(`parameters.${index}.valueType`, {
            required: "Value Type is required",
          })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">Select Value Type</option>
          <option value="text">Text</option>
          <option value="number">Number</option>
        </select>
        {errors.parameters?.[index]?.valueType && (
          <p className="text-red-500 text-xs mt-1">
            {errors.parameters[index].valueType.message}
          </p>
        )}
      </div>

      {/* Optional Formula Input */}
      <div className="mt-2">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Formula (optional)
        </label>
        <input
          type="text"
          {...register(`parameters.${index}.formula`)}
          placeholder='e.g. "S. TRIGLYCERIDE / 5"'
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {/* Male Ranges */}
      <div className="mt-2">
        <h5 className="text-sm font-semibold mb-1">Male Ranges</h5>
        {maleRanges.map((field, mIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              {...register(
                `parameters.${index}.range.male.${mIndex}.rangeKey`,
                { required: "Key is required" }
              )}
              placeholder='e.g. "0-20"'
              className="px-2 py-1 border rounded w-1/2"
            />
            <input
              type="text"
              {...register(
                `parameters.${index}.range.male.${mIndex}.rangeValue`,
                { required: "Range value is required" }
              )}
              placeholder='e.g. "15-20"'
              className="px-2 py-1 border rounded w-1/2"
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
          className="mt-2 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
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
                `parameters.${index}.range.female.${fIndex}.rangeKey`,
                { required: "Key is required" }
              )}
              placeholder='e.g. "0-20"'
              className="px-2 py-1 border rounded w-1/2"
            />
            <input
              type="text"
              {...register(
                `parameters.${index}.range.female.${fIndex}.rangeValue`,
                { required: "Range value is required" }
              )}
              placeholder='e.g. "15-21"'
              className="px-2 py-1 border rounded w-1/2"
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
          className="mt-2 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-2" /> Add Female Range
        </button>
      </div>

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

// -------------------------
// Subheading Item Component
// -------------------------
interface SubheadingItemProps {
  index: number;
  control: any;
  register: any;
  errors: any;
  remove: (index: number) => void;
}

const SubheadingItem: React.FC<SubheadingItemProps> = ({
  index,
  control,
  register,
  errors,
  remove,
}) => {
  const { fields, append, remove: removeSelectedParam } = useFieldArray({
    control,
    name: `subheadings.${index}.parameterNames`,
  });

  // Watch global parameters to populate dropdown options
  const globalParameters: Parameter[] =
    useWatch({
      control,
      name: "parameters",
    }) || [];

  return (
    <div className="border p-4 rounded-lg bg-gray-50">
      {/* Subheading Title */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Subheading Title
        </label>
        <input
          type="text"
          {...register(`subheadings.${index}.title`, {
            required: "Subheading title is required",
          })}
          placeholder="Enter subheading name (e.g. RBC)"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
        {errors.subheadings?.[index]?.title && (
          <p className="text-red-500 text-xs mt-1">
            {errors.subheadings[index].title.message}
          </p>
        )}
      </div>

      {/* Parameter Selection */}
      <div className="mt-4">
        <h4 className="text-sm font-semibold mb-1">Select Parameters</h4>
        {fields.map((field, pIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mb-2">
            <select
              {...register(`subheadings.${index}.parameterNames.${pIndex}`, {
                required: "Parameter selection is required",
              })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Select Parameter</option>
              {globalParameters.map((param, idx) => (
                <option key={idx} value={param.name}>
                  {param.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeSelectedParam(pIndex)}
              className="text-red-500"
            >
              <FaTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => append("")}
          className="mt-2 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-2" /> Add Parameter to Subheading
        </button>
      </div>

      <button
        type="button"
        onClick={() => remove(index)}
        className="mt-4 text-red-500 hover:text-red-700 flex items-center"
      >
        <FaTrash className="mr-1" /> Remove Subheading
      </button>
    </div>
  );
};

// -------------------------
// Main Component
// -------------------------

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
      type: "in-house",
      parameters: [
        {
          name: "",
          unit: "",
          valueType: "text", // default valueType
          formula: "",
          range: {
            male: [{ rangeKey: "", rangeValue: "" }],
            female: [{ rangeKey: "", rangeValue: "" }],
          },
        },
      ],
      subheadings: [],
    },
  });

  // Watch the test type to conditionally render sections
  const testType = useWatch({
    control,
    name: "type",
  });

  // Global Parameters Field Array
  const {
    fields: globalParameterFields,
    append: appendGlobalParameter,
    remove: removeGlobalParameter,
  } = useFieldArray({
    control,
    name: "parameters",
  });

  // Subheadings Field Array
  const {
    fields: subheadingFields,
    append: appendSubheading,
    remove: removeSubheading,
  } = useFieldArray({
    control,
    name: "subheadings",
  });

  // Single test submission
  const onSubmit: SubmitHandler<BloodTestFormInputs> = async (data) => {
    try {
      const testsRef = ref(database, "bloodTests");
      const newTestRef = push(testsRef);

      // If test type is "outsource", ignore parameters and subheadings
      const testData = {
        testName: data.testName,
        price: data.price,
        type: data.type,
        parameters: data.type === "outsource" ? [] : data.parameters,
        subheadings: data.type === "outsource" ? [] : data.subheadings,
        createdAt: new Date().toISOString(),
      };

      await set(newTestRef, testData);
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
        const {
          testName,
          price = 0,
          type = "in-house",
          parameters = [],
          subheadings = [],
        } = test;
        const newTestRef = push(testsRef);
        await set(newTestRef, {
          testName,
          price,
          type,
          parameters,
          subheadings,
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
              placeholder="Enter blood test name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
            {errors.testName && (
              <p className="text-red-500 text-sm mt-1">{errors.testName.message}</p>
            )}
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
              <FaRupeeSign className="mr-1 text-green-600" /> Price (Rs.) for Entire Test
            </label>
            <input
              type="number"
              step="0.01"
              {...register("price", {
                required: "Price is required",
                valueAsNumber: true,
              })}
              placeholder="Enter overall price in rupees"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
            {errors.price && (
              <p className="text-red-500 text-sm mt-1">{errors.price.message}</p>
            )}
          </div>

          {/* Test Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Test Type
            </label>
            <select
              {...register("type", { required: "Test type is required" })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="in-house">In-House</option>
              <option value="outsource">Outsource</option>
            </select>
            {errors.type && (
              <p className="text-red-500 text-sm mt-1">{errors.type.message}</p>
            )}
          </div>

          {/* Only show Global Parameters and Subheadings if test type is not "outsource" */}
          {testType !== "outsource" && (
            <>
              {/* Global Parameters Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Global Parameters
                </label>
                <div className="space-y-4">
                  {globalParameterFields.map((field, index) => (
                    <GlobalParameterItem
                      key={field.id}
                      index={index}
                      control={control}
                      register={register}
                      errors={errors}
                      remove={removeGlobalParameter}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    appendGlobalParameter({
                      name: "",
                      unit: "",
                      valueType: "text",
                      formula: "",
                      range: {
                        male: [{ rangeKey: "", rangeValue: "" }],
                        female: [{ rangeKey: "", rangeValue: "" }],
                      },
                    })
                  }
                  className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
                >
                  <FaPlus className="mr-2" /> Add Global Parameter
                </button>
              </div>

              {/* Subheadings Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subheadings
                </label>
                <div className="space-y-4">
                  {subheadingFields.map((field, index) => (
                    <SubheadingItem
                      key={field.id}
                      index={index}
                      control={control}
                      register={register}
                      errors={errors}
                      remove={removeSubheading}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => appendSubheading({ title: "", parameterNames: [] })}
                  className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
                >
                  <FaPlus className="mr-2" /> Add Subheading
                </button>
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center bg-blue-600 text-white py-3 px-4 rounded-lg"
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
            placeholder={`[
  {
    "testName": "Lipid Profile",
    "price": 500,
    "type": "in-house",
    "parameters": [
      {
        "name": "TOTAL CHOLESTEROL",
        "unit": "mg/dL",
        "valueType": "number",
        "range": { "male": [{ "rangeKey": "200-250", "rangeValue": "" }], "female": [{ "rangeKey": "200-250", "rangeValue": "" }] }
      },
      {
        "name": "S. TRIGLYCERIDE",
        "unit": "mg/dL",
        "valueType": "number",
        "range": { "male": [{ "rangeKey": "150-200", "rangeValue": "" }], "female": [{ "rangeKey": "150-200", "rangeValue": "" }] }
      }
    ],
    "subheadings": []
  }
]`}
            className="w-full p-3 border border-gray-300 rounded-lg"
          ></textarea>

          <button
            type="button"
            onClick={handleBulkCreate}
            className="mt-3 w-full inline-flex items-center justify-center bg-green-600 text-white py-3 px-4 rounded-lg"
          >
            <FaFileImport className="mr-2" /> Create Tests from JSON
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateBloodTest;
