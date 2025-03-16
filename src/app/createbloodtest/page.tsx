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
  range: {
    male: AgeRangeItem[];
    female: AgeRangeItem[];
  };
}

interface Subheading {
  title: string;
  parameterNames: string[];
}

// New interface for subpricing
interface Subpricing {
  subpricingName: string;            // e.g. "BILLIRUBIN", or "ALT+AST"
  price: number;                     // price if only these parameters are booked
  includedParameters: string[];      // which parameters are included in this subpricing
}

interface BloodTestFormInputs {
  testName: string;
  price: number;          // overall test price if the entire test is booked
  parameters: Parameter[];
  subheadings: Subheading[];

  // New: array of subpricing entries
  subpricing: Subpricing[];
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
        <div className="flex-1 mt-4 sm:mt-0">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Unit
          </label>
          <input
            type="text"
            {...register(`parameters.${index}.unit`, {
              required: "Unit is required",
            })}
            placeholder="e.g. g/dL"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg"
          />
          {errors.parameters?.[index]?.unit && (
            <p className="text-red-500 text-xs mt-1">
              {errors.parameters[index].unit.message}
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
  const globalParameters: Parameter[] = useWatch({
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
// Subpricing Item Component
// -------------------------
interface SubpricingItemProps {
  index: number;
  control: any;
  register: any;
  errors: any;
  remove: (index: number) => void;
}

const SubpricingItem: React.FC<SubpricingItemProps> = ({
  index,
  control,
  register,
  errors,
  remove,
}) => {
  // We'll do the includedParameters as a field array, so we can select from the global parameters
  const { fields, append, remove: removeIncludedParam } = useFieldArray({
    control,
    name: `subpricing.${index}.includedParameters`,
  });

  // Watch global parameters so we can display them as options
  const globalParameters: Parameter[] = useWatch({
    control,
    name: "parameters",
  }) || [];

  return (
    <div className="border p-4 rounded-lg bg-gray-50 mt-2">
      {/* Subpricing Name */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Subpricing Name
        </label>
        <input
          type="text"
          {...register(`subpricing.${index}.subpricingName`, {
            required: "Subpricing name is required",
          })}
          placeholder="e.g. 'BILLIRUBIN' or 'ALT+AST'"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
        {errors.subpricing?.[index]?.subpricingName && (
          <p className="text-red-500 text-xs mt-1">
            {errors.subpricing[index].subpricingName.message}
          </p>
        )}
      </div>

      {/* Price */}
      <div className="mt-2">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Price for These Parameters
        </label>
        <input
          type="number"
          step="0.01"
          {...register(`subpricing.${index}.price`, {
            required: "Subpricing price is required",
            valueAsNumber: true,
          })}
          placeholder="e.g. 200"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
        {errors.subpricing?.[index]?.price && (
          <p className="text-red-500 text-xs mt-1">
            {errors.subpricing[index].price.message}
          </p>
        )}
      </div>

      {/* includedParameters multi-add */}
      <div className="mt-2">
        <h5 className="text-sm font-semibold mb-1">
          Included Parameters in This Pricing
        </h5>
        {fields.map((field, incIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mb-2">
            <select
              {...register(`subpricing.${index}.includedParameters.${incIndex}`, {
                required: "Parameter is required",
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
              onClick={() => removeIncludedParam(incIndex)}
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
          <FaPlus className="mr-2" /> Add Parameter
        </button>
      </div>

      <button
        type="button"
        onClick={() => remove(index)}
        className="mt-4 text-red-500 hover:text-red-700 flex items-center"
      >
        <FaTrash className="mr-1" /> Remove Subpricing
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
      parameters: [
        {
          name: "",
          unit: "",
          range: {
            male: [{ rangeKey: "", rangeValue: "" }],
            female: [{ rangeKey: "", rangeValue: "" }],
          },
        },
      ],
      subheadings: [],
      subpricing: [], // new field
    },
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

  // Subpricing Field Array
  const {
    fields: subpricingFields,
    append: appendSubpricing,
    remove: removeSubpricing,
  } = useFieldArray({
    control,
    name: "subpricing",
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
        const {
          testName,
          price = 0,
          parameters = [],
          subheadings = [],
          subpricing = [],
        } = test;
        const newTestRef = push(testsRef);
        await set(newTestRef, {
          testName,
          price,
          parameters,
          subheadings,
          subpricing,
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

          {/* Subpricing Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parameter-Based Pricing (Optional)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Define one or more “subpricing” entries. For example, “BILLIRUBIN” at Rs.200 if only
              these parameters are selected.
            </p>
            <div className="space-y-4">
              {subpricingFields.map((field, index) => (
                <SubpricingItem
                  key={field.id}
                  index={index}
                  control={control}
                  register={register}
                  errors={errors}
                  remove={removeSubpricing}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                appendSubpricing({
                  subpricingName: "",
                  price: 0,
                  includedParameters: [],
                })
              }
              className="mt-4 inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
            >
              <FaPlus className="mr-2" /> Add Subpricing
            </button>
          </div>

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
    "testName": "Liver Function Test",
    "price": 500,
    "parameters": [
      {
        "name": "TOTAL BILLIRUBIN",
        "unit": "mg/dL",
        "range": {
          "male": [{ "rangeKey": "1-65y", "rangeValue": "UP to 1.2" }],
          "female": [{ "rangeKey": "1-65y", "rangeValue": "UP to 1.2" }]
        }
      },
      {
        "name": "DIRECT BILLIRUBIN",
        "unit": "mg/dL",
        "range": {
          "male": [{ "rangeKey": "1-65y", "rangeValue": "UP to 0.5" }],
          "female": [{ "rangeKey": "1-65y", "rangeValue": "UP to 0.5" }]
        }
      },
      {
        "name": "INDIRECT BILLIRUBIN",
        "unit": "mg/dL",
        "range": {
          "male": [{ "rangeKey": "1-65y", "rangeValue": "UP to 0.7" }],
          "female": [{ "rangeKey": "1-65y", "rangeValue": "UP to 0.7" }]
        }
      }
    ],
    "subheadings": [],
    "subpricing": [
      {
        "subpricingName": "BILLIRUBIN",
        "price": 200,
        "includedParameters": ["TOTAL BILLIRUBIN", "DIRECT BILLIRUBIN", "INDIRECT BILLIRUBIN"]
      }
    ]
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
