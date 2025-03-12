"use client";

import React, { useEffect, useState } from "react";
import { database } from "../../firebase"; // adjust path as needed
import { ref, get, update, remove, push, set } from "firebase/database";
import { useForm, useFieldArray } from "react-hook-form";
import {
  FaEdit,
  FaTrash,
  FaRupeeSign,
  FaFlask,
  FaSave,
  FaPlus,
  FaPlusCircle,
} from "react-icons/fa";

// -----------------------------
// INTERFACES
// -----------------------------
export interface AgeRangeItem {
  rangeKey: string;
  rangeValue: string;
}

export interface Parameter {
  name: string;
  unit: string;
  range: {
    male: AgeRangeItem[];
    female: AgeRangeItem[];
  };
  // Optional: subparameters can follow the same structure if needed.
  subparameters?: Parameter[];
}

export interface BloodTestFormInputs {
  testName: string;
  price: number;
  parameters: Parameter[];
}

export interface TestData extends BloodTestFormInputs {
  key: string;
  createdAt: string;
}

// -----------------------------
// PARAMETER EDITOR COMPONENT
// -----------------------------
interface ParameterEditorProps {
  index: number;
  control: any;
  register: any;
  errors: any;
  remove: (index: number) => void;
}

const ParameterEditor: React.FC<ParameterEditorProps> = ({
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
    <div className="border p-4 rounded mb-4 bg-gray-50">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">Parameter #{index + 1}</h3>
        <button
          type="button"
          onClick={() => remove(index)}
          className="text-red-500 hover:text-red-700"
        >
          <FaTrash />
        </button>
      </div>
      <div className="mt-2">
        <label className="block text-xs">Parameter Name</label>
        <input
          type="text"
          {...register(`parameters.${index}.name`, { required: "Required" })}
          className="w-full border rounded px-2 py-1"
          placeholder="e.g., Hemoglobin"
        />
        {errors.parameters?.[index]?.name && (
          <p className="text-red-500 text-xs">
            {errors.parameters[index].name.message}
          </p>
        )}
      </div>
      <div className="mt-2">
        <label className="block text-xs">Unit</label>
        <input
          type="text"
          {...register(`parameters.${index}.unit`, { required: "Required" })}
          className="w-full border rounded px-2 py-1"
          placeholder="e.g., g/dL"
        />
        {errors.parameters?.[index]?.unit && (
          <p className="text-red-500 text-xs">
            {errors.parameters[index].unit.message}
          </p>
        )}
      </div>
      <div className="mt-2">
        <h4 className="text-xs font-medium">Male Ranges</h4>
        {maleRanges.map((field, mIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mt-1">
            <input
              type="text"
              {...register(
                `parameters.${index}.range.male.${mIndex}.rangeKey`,
                { required: "Required" }
              )}
              className="w-1/2 border rounded px-2 py-1"
              placeholder="Age Range e.g., 0-30d"
            />
            <input
              type="text"
              {...register(
                `parameters.${index}.range.male.${mIndex}.rangeValue`,
                { required: "Required" }
              )}
              className="w-1/2 border rounded px-2 py-1"
              placeholder="Value e.g., 5.0-7.0"
            />
            <button
              type="button"
              onClick={() => removeMaleRange(mIndex)}
              className="text-red-500 hover:text-red-700"
            >
              <FaTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => appendMaleRange({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-1" /> Add Male Range
        </button>
      </div>
      <div className="mt-2">
        <h4 className="text-xs font-medium">Female Ranges</h4>
        {femaleRanges.map((field, fIndex) => (
          <div key={field.id} className="flex items-center space-x-2 mt-1">
            <input
              type="text"
              {...register(
                `parameters.${index}.range.female.${fIndex}.rangeKey`,
                { required: "Required" }
              )}
              className="w-1/2 border rounded px-2 py-1"
              placeholder="Age Range e.g., 0-30d"
            />
            <input
              type="text"
              {...register(
                `parameters.${index}.range.female.${fIndex}.rangeValue`,
                { required: "Required" }
              )}
              className="w-1/2 border rounded px-2 py-1"
              placeholder="Value e.g., 5.0-7.0"
            />
            <button
              type="button"
              onClick={() => removeFemaleRange(fIndex)}
              className="text-red-500 hover:text-red-700"
            >
              <FaTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => appendFemaleRange({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-1" /> Add Female Range
        </button>
      </div>
      {/* Optionally, you can add a similar block for subparameters if required */}
    </div>
  );
};

// -----------------------------
// TEST MODAL COMPONENT (Create & Edit)
// -----------------------------
interface TestModalProps {
  testData?: TestData; // if undefined, then creating a new test
  onClose: () => void;
  onTestUpdated: () => void;
}

const TestModal: React.FC<TestModalProps> = ({
  testData,
  onClose,
  onTestUpdated,
}) => {
  const defaultValues: BloodTestFormInputs = testData
    ? {
        testName: testData.testName,
        price: testData.price,
        parameters: testData.parameters,
      }
    : {
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
      };

  const {
    register,
    handleSubmit,
    control,
  
    formState: { errors },
  } = useForm<BloodTestFormInputs>({ defaultValues });

  const { fields, append, remove: removeField } = useFieldArray({
    control,
    name: "parameters",
  });

  const onSubmit = async (data: BloodTestFormInputs) => {
    try {
      if (testData) {
        // Update existing test
        const testRef = ref(database, `bloodTests/${testData.key}`);
        await update(testRef, {
          ...data,
          updatedAt: new Date().toISOString(),
        });
        alert("Test updated successfully!");
      } else {
        // Create new test
        const testsRef = ref(database, "bloodTests");
        const newTestRef = push(testsRef);
        await set(newTestRef, {
          ...data,
          createdAt: new Date().toISOString(),
        });
        alert("Test created successfully!");
      }
      onTestUpdated();
      onClose();
    } catch (error) {
      console.error("Error saving test:", error);
      alert("Error saving test. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!testData) return;
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
      <div className="bg-white p-6 rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold flex items-center">
            {testData ? (
              <>
                <FaEdit className="mr-2" /> Edit Blood Test
              </>
            ) : (
              <>
                <FaPlusCircle className="mr-2" /> Create New Blood Test
              </>
            )}
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
            {fields.map((field, index) => (
              <ParameterEditor
                key={field.id}
                index={index}
                control={control}
                register={register}
                errors={errors}
                remove={removeField}
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
                  subparameters: [],
                })
              }
              className="mt-2 inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
            >
              <FaPlus className="mr-1" /> Add Parameter
            </button>
          </div>
          <div className="flex justify-between items-center mt-4">
            {testData && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center px-3 py-1 border border-red-600 text-red-600 rounded hover:bg-red-50"
              >
                <FaTrash className="mr-1" /> Delete Test
              </button>
            )}
            <button
              type="submit"
              className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <FaSave className="mr-1" /> {testData ? "Save Changes" : "Create Test"}
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

  const fetchTests = async () => {
    try {
      const testsRef = ref(database, "bloodTests");
      const snapshot = await get(testsRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
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

  const handleAddNew = () => {
    setSelectedTest(null);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedTest(null);
    fetchTests();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto bg-white p-6 rounded-lg shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold flex items-center">
            <FaFlask className="mr-2 text-blue-600" />
            Manage Blood Tests
          </h1>
          <button
            onClick={handleAddNew}
            className="inline-flex items-center px-3 py-1 border border-green-600 text-green-600 rounded hover:bg-green-50"
          >
            <FaPlus className="mr-1" /> Add Test
          </button>
        </div>
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
      {showModal && (
        <TestModal
          testData={selectedTest || undefined}
          onClose={handleModalClose}
          onTestUpdated={handleModalClose}
        />
      )}
    </div>
  );
};

export default ManageBloodTests;
