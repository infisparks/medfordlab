"use client";

import React, { useEffect, useState, useMemo } from "react";
import { database } from "../../firebase"; // adjust path if needed
import { ref, get, update, remove, push, set } from "firebase/database";
import {
  useForm,
  useFieldArray,
  useWatch,
  SubmitHandler,
  FieldErrorsImpl,
  UseFormGetValues,
  UseFormSetValue,
} from "react-hook-form";
import {
  FaEdit,
  FaTrash,
  FaRupeeSign,
  FaFlask,
  FaSave,
  FaPlus,
  FaPlusCircle,
  FaCopy,
  FaSyncAlt,
  FaCode,
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
  valueType: "text" | "number"; // New property to indicate accepted value type
  range: {
    male: AgeRangeItem[];
    female: AgeRangeItem[];
  };
}

export interface Subheading {
  title: string;
  parameterNames: string[];
}

// Added isOutsource flag
export interface BloodTestFormInputs {
  testName: string;
  price: number;
  parameters: Parameter[];
  subheadings: Subheading[];
  isOutsource?: boolean;
}

export interface TestData extends BloodTestFormInputs {
  key: string;
  createdAt: string;
  updatedAt?: string;
}

// Helper to safely fetch error messages
function getFieldErrorMessage(errors: any, path: string[]): string | undefined {
  let current = errors;
  for (const p of path) {
    if (!current) return undefined;
    current = current[p];
  }
  return typeof current?.message === "string" ? current.message : undefined;
}

// -----------------------------
// PARAMETER EDITOR
// -----------------------------
interface ParameterEditorProps {
  index: number;
  control: any;
  register: any;
  errors: FieldErrorsImpl<any>;
  remove: (index: number) => void;
}
const ParameterEditor: React.FC<ParameterEditorProps> = ({
  index,
  control,
  register,
  errors,
  remove,
}) => {
  const maleRangesArray = useFieldArray({
    control,
    name: `parameters.${index}.range.male`,
  });
  const femaleRangesArray = useFieldArray({
    control,
    name: `parameters.${index}.range.female`,
  });

  const paramNameErr = getFieldErrorMessage(errors, [
    "parameters",
    index.toString(),
    "name",
  ]);
  const paramUnitErr = getFieldErrorMessage(errors, [
    "parameters",
    index.toString(),
    "unit",
  ]);
  const paramValueTypeErr = getFieldErrorMessage(errors, [
    "parameters",
    index.toString(),
    "valueType",
  ]);

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

      {/* Parameter Name & Unit */}
      <div className="mt-2">
        <label className="block text-xs">Parameter Name</label>
        <input
          type="text"
          {...register(`parameters.${index}.name`, { required: "Required" })}
          className="w-full border rounded px-2 py-1"
        />
        {paramNameErr && <p className="text-red-500 text-xs">{paramNameErr}</p>}
      </div>
      <div className="mt-2">
        <label className="block text-xs">Unit</label>
        <input
          type="text"
          {...register(`parameters.${index}.unit`)}
          className="w-full border rounded px-2 py-1"
        />
        {paramUnitErr && <p className="text-red-500 text-xs">{paramUnitErr}</p>}
      </div>

      {/* Value Type Selection */}
      <div className="mt-2">
        <label className="block text-xs">Value Type</label>
        <select
          {...register(`parameters.${index}.valueType`, { required: "Required" })}
          className="w-full border rounded px-2 py-1"
        >
          <option value="">Select Value Type</option>
          <option value="text">Text</option>
          <option value="number">Number</option>
        </select>
        {paramValueTypeErr && (
          <p className="text-red-500 text-xs">{paramValueTypeErr}</p>
        )}
      </div>

      {/* Male Ranges */}
      <div className="mt-2">
        <h4 className="text-xs font-medium">Male Ranges</h4>
        {maleRangesArray.fields.map((field, mIndex) => {
          const keyErr = getFieldErrorMessage(errors, [
            "parameters",
            index.toString(),
            "range",
            "male",
            mIndex.toString(),
            "rangeKey",
          ]);
          const valErr = getFieldErrorMessage(errors, [
            "parameters",
            index.toString(),
            "range",
            "male",
            mIndex.toString(),
            "rangeValue",
          ]);
          return (
            <div key={field.id} className="flex items-center space-x-2 mt-1">
              <input
                type="text"
                {...register(`parameters.${index}.range.male.${mIndex}.rangeKey`)}
                className="w-1/2 border rounded px-2 py-1"
              />
              <input
                type="text"
                {...register(`parameters.${index}.range.male.${mIndex}.rangeValue`)}
                className="w-1/2 border rounded px-2 py-1"
              />
              <button
                type="button"
                onClick={() => maleRangesArray.remove(mIndex)}
                className="text-red-500 hover:text-red-700"
              >
                <FaTrash />
              </button>
              {keyErr && <p className="text-red-500 text-xs w-full">{keyErr}</p>}
              {valErr && <p className="text-red-500 text-xs w-full">{valErr}</p>}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => maleRangesArray.append({ rangeKey: "", rangeValue: "" })}
          className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-1" /> Add Male Range
        </button>
      </div>

      {/* Female Ranges */}
      <div className="mt-2">
        <h4 className="text-xs font-medium">Female Ranges</h4>
        {femaleRangesArray.fields.map((field, fIndex) => {
          const keyErr = getFieldErrorMessage(errors, [
            "parameters",
            index.toString(),
            "range",
            "female",
            fIndex.toString(),
            "rangeKey",
          ]);
          const valErr = getFieldErrorMessage(errors, [
            "parameters",
            index.toString(),
            "range",
            "female",
            fIndex.toString(),
            "rangeValue",
          ]);
          return (
            <div key={field.id} className="flex items-center space-x-2 mt-1">
              <input
                type="text"
                {...register(`parameters.${index}.range.female.${fIndex}.rangeKey`)}
                className="w-1/2 border rounded px-2 py-1"
              />
              <input
                type="text"
                {...register(`parameters.${index}.range.female.${fIndex}.rangeValue`)}
                className="w-1/2 border rounded px-2 py-1"
              />
              <button
                type="button"
                onClick={() => femaleRangesArray.remove(fIndex)}
                className="text-red-500 hover:text-red-700"
              >
                <FaTrash />
              </button>
              {keyErr && <p className="text-red-500 text-xs w-full">{keyErr}</p>}
              {valErr && <p className="text-red-500 text-xs w-full">{valErr}</p>}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() =>
            femaleRangesArray.append({ rangeKey: "", rangeValue: "" })
          }
          className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-1" /> Add Female Range
        </button>
      </div>
    </div>
  );
};

// -----------------------------
// SUBHEADING EDITOR
// -----------------------------
interface SubheadingEditorProps {
  index: number;
  control: any;
  register: any;
  errors: FieldErrorsImpl<any>;
  remove: (index: number) => void;
  getValues: UseFormGetValues<BloodTestFormInputs>;
  setValue: UseFormSetValue<BloodTestFormInputs>;
}

const SubheadingEditor: React.FC<SubheadingEditorProps> = ({
  index,
  control,
  register,
  errors,
  remove,
  getValues,
  setValue,
}) => {
  const paramNamesArray = useFieldArray({
    control,
    name: `subheadings.${index}.parameterNames`,
  });
  const globalParameters = useWatch({ control, name: "parameters" }) || [];
  const subheadingTitleErr = getFieldErrorMessage(errors, [
    "subheadings",
    index.toString(),
    "title",
  ]);

  // Called on parameter select to avoid duplicate usage across subheadings
  const handleParameterChange = (pIndex: number, newValue: string) => {
    if (!newValue) return;
    const allSubheadings = getValues("subheadings") || [];
    for (let shIndex = 0; shIndex < allSubheadings.length; shIndex++) {
      if (shIndex === index) continue;
      const paramNames = allSubheadings[shIndex]?.parameterNames || [];
      if (paramNames.includes(newValue)) {
        alert(`Parameter "${newValue}" is already used in another subheading!`);
        setValue(`subheadings.${index}.parameterNames.${pIndex}`, "");
        return;
      }
    }
  };

  return (
    <div className="border p-4 rounded mb-4 bg-gray-100">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">Subheading #{index + 1}</h3>
        <button
          type="button"
          onClick={() => remove(index)}
          className="text-red-500 hover:text-red-700"
        >
          <FaTrash />
        </button>
      </div>

      {/* Title */}
      <div className="mt-2">
        <label className="block text-xs">Subheading Title</label>
        <input
          type="text"
          {...register(`subheadings.${index}.title`, {
            required: "Required",
          })}
          className="w-full border rounded px-2 py-1"
          placeholder="e.g., RBC"
        />
        {subheadingTitleErr && (
          <p className="text-red-500 text-xs">{subheadingTitleErr}</p>
        )}
      </div>

      {/* Parameter Names */}
      <div className="mt-2">
        <h4 className="text-xs font-medium">Select Parameters</h4>
        {paramNamesArray.fields.map((field, pIndex) => {
          const paramNameErr = getFieldErrorMessage(errors, [
            "subheadings",
            index.toString(),
            "parameterNames",
            pIndex.toString(),
          ]);
          return (
            <div key={field.id} className="flex items-center space-x-2 mt-1">
              <select
                {...register(`subheadings.${index}.parameterNames.${pIndex}`, {
                  required: "Required",
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                    handleParameterChange(pIndex, e.target.value),
                })}
                className="w-full border rounded px-2 py-1"
              >
                <option value="">Select Parameter</option>
                {globalParameters.map((param: { name: string }, idx: number) => (
                  <option key={idx} value={param.name}>
                    {param.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => paramNamesArray.remove(pIndex)}
                className="text-red-500 hover:text-red-700"
              >
                <FaTrash />
              </button>
              {paramNameErr && (
                <p className="text-red-500 text-xs w-full">{paramNameErr}</p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => paramNamesArray.append("")}
          className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-1" /> Add Parameter
        </button>
      </div>
    </div>
  );
};

// -----------------------------
// TEST MODAL (Create & Edit) with JSON Editor Mode
// -----------------------------
interface TestModalProps {
  testData?: TestData;
  onClose: () => void;
  onTestUpdated: () => void;
}

const TestModal: React.FC<TestModalProps> = ({
  testData,
  onClose,
  onTestUpdated,
}) => {
  // Memoize default values so that they do not trigger re-renders
  const defaultValues = useMemo<BloodTestFormInputs>(() => {
    return testData
      ? {
          testName: testData.testName,
          price: testData.price,
          parameters: testData.parameters,
          subheadings: testData.subheadings,
          isOutsource: testData.isOutsource || false,
        }
      : {
          testName: "",
          price: 0,
          parameters: [
            {
              name: "",
              unit: "",
              valueType: "text", // default valueType
              range: {
                male: [{ rangeKey: "", rangeValue: "" }],
                female: [{ rangeKey: "", rangeValue: "" }],
              },
            },
          ],
          subheadings: [],
          isOutsource: false,
        };
  }, [testData]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    getValues,
    setValue,
    reset,
  } = useForm<BloodTestFormInputs>({ defaultValues });

  const paramFields = useFieldArray({ control, name: "parameters" });
  const subheadingFields = useFieldArray({ control, name: "subheadings" });

  const testNameErr = getFieldErrorMessage(errors, ["testName"]);
  const testPriceErr = getFieldErrorMessage(errors, ["price"]);

  // State to toggle between form mode and JSON editor mode
  const [isJsonEditor, setIsJsonEditor] = useState(false);
  const [jsonContent, setJsonContent] = useState("");

  // Initialize JSON content only when defaultValues change
  useEffect(() => {
    setJsonContent(JSON.stringify(defaultValues, null, 2));
  }, [defaultValues]);

  const onSubmit: SubmitHandler<BloodTestFormInputs> = async (data) => {
    try {
      if (testData) {
        // Update
        const testRef = ref(database, `bloodTests/${testData.key}`);
        await update(testRef, {
          ...data,
          updatedAt: new Date().toISOString(),
        });
        alert("Test updated successfully!");
      } else {
        // Create
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

  // Handler for saving changes when in JSON mode
  const handleSaveJson = async () => {
    try {
      const parsedData = JSON.parse(jsonContent);
      if (testData) {
        const testRef = ref(database, `bloodTests/${testData.key}`);
        await update(testRef, {
          ...parsedData,
          updatedAt: new Date().toISOString(),
        });
        alert("Test updated successfully!");
      } else {
        const testsRef = ref(database, "bloodTests");
        const newTestRef = push(testsRef);
        await set(newTestRef, {
          ...parsedData,
          createdAt: new Date().toISOString(),
        });
        alert("Test created successfully!");
      }
      onTestUpdated();
      onClose();
    } catch (error) {
      console.error("Error saving JSON:", error);
      alert("Invalid JSON. Please check your input.");
    }
  };

  // Toggle from JSON editor back to form view.
  const handleSwitchToForm = () => {
    try {
      const parsedData = JSON.parse(jsonContent);
      reset(parsedData);
      setIsJsonEditor(false);
    } catch (error) {
      alert("Invalid JSON. Cannot switch to form view.");
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

        {/* Toggle Editor Mode */}
        <div className="flex justify-end mb-4">
          {isJsonEditor ? (
            <button
              onClick={handleSwitchToForm}
              className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 mr-2"
            >
              <FaSyncAlt className="mr-1" /> Switch to Form Editor
            </button>
          ) : (
            <button
              onClick={() => {
                // Update JSON content from current form values and switch mode
                setJsonContent(JSON.stringify(getValues(), null, 2));
                setIsJsonEditor(true);
              }}
              className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 mr-2"
            >
              <FaCode className="mr-1" /> Switch to JSON Editor
            </button>
          )}
          {isJsonEditor && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(jsonContent);
                alert("JSON copied to clipboard!");
              }}
              className="inline-flex items-center px-3 py-1 border border-green-600 text-green-600 rounded hover:bg-green-50"
            >
              <FaCopy className="mr-1" /> Copy JSON
            </button>
          )}
        </div>

        {isJsonEditor ? (
          // JSON Editor Mode
          <div>
            <textarea
              value={jsonContent}
              onChange={(e) => setJsonContent(e.target.value)}
              className="w-full h-80 border rounded px-3 py-2 font-mono"
            />
            <div className="flex justify-end mt-4 space-x-2">
              <button
                onClick={handleSaveJson}
                className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <FaSave className="mr-1" /> Save JSON
              </button>
            </div>
          </div>
        ) : (
          // Form Mode
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Test Name */}
            <div>
              <label className="block text-sm font-medium">Test Name</label>
              <input
                type="text"
                {...register("testName", { required: "Test name is required" })}
                className="w-full border rounded px-3 py-2"
              />
              {testNameErr && <p className="text-red-500 text-xs">{testNameErr}</p>}
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
              {testPriceErr && <p className="text-red-500 text-xs">{testPriceErr}</p>}
            </div>

            {/* Outsource Checkbox */}
            <div>
              <label className="block text-sm font-medium">
                Outsource Test?
              </label>
              <input type="checkbox" {...register("isOutsource")} className="ml-2" />
            </div>

            {/* Parameters */}
            <div>
              <label className="block text-sm font-medium">Global Parameters</label>
              {paramFields.fields.map((field, pIndex) => (
                <ParameterEditor
                  key={field.id}
                  index={pIndex}
                  control={control}
                  register={register}
                  errors={errors as FieldErrorsImpl<any>}
                  remove={paramFields.remove}
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  paramFields.append({
                    name: "",
                    unit: "",
                    valueType: "text",
                    range: {
                      male: [{ rangeKey: "", rangeValue: "" }],
                      female: [{ rangeKey: "", rangeValue: "" }],
                    },
                  })
                }
                className="mt-2 inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
              >
                <FaPlus className="mr-1" /> Add Global Parameter
              </button>
            </div>

            {/* Subheadings */}
            <div>
              <label className="block text-sm font-medium">Subheadings</label>
              <div className="space-y-4">
                {subheadingFields.fields.map((field, sIndex) => (
                  <SubheadingEditor
                    key={field.id}
                    index={sIndex}
                    control={control}
                    register={register}
                    errors={errors as FieldErrorsImpl<any>}
                    remove={subheadingFields.remove}
                    getValues={getValues}
                    setValue={setValue}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  subheadingFields.append({ title: "", parameterNames: [] })
                }
                className="mt-2 inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
              >
                <FaPlus className="mr-1" /> Add Subheading
              </button>
            </div>

            {/* Buttons */}
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
                <FaSave className="mr-1" />
                {testData ? "Save Changes" : "Create Test"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// -----------------------------
// MAIN PAGE: MANAGE TESTS
// -----------------------------
const ManageBloodTests: React.FC = () => {
  const [tests, setTests] = useState<TestData[]>([]);
  const [selectedTest, setSelectedTest] = useState<TestData | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchTests = async () => {
    try {
      const snapshot = await get(ref(database, "bloodTests"));
      if (snapshot.exists()) {
        const data = snapshot.val();
        const arr: TestData[] = Object.keys(data).map((key) => ({
          key,
          ...data[key],
        }));
        setTests(arr);
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
              <th className="border px-4 py-2">Subheadings</th>
              <th className="border px-4 py-2">Created At</th>
              <th className="border px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t.key} className="hover:bg-gray-50">
                <td className="border px-4 py-2">
                  {t.testName}
                  {t.isOutsource && (
                    <span className="ml-2 inline-block px-2 py-1 text-xs font-medium bg-yellow-200 text-yellow-800 rounded">
                      Outsource Test
                    </span>
                  )}
                </td>
                <td className="border px-4 py-2">₹{t.price}</td>
                <td className="border px-4 py-2">
                  {t.parameters?.length || 0} parameters
                </td>
                <td className="border px-4 py-2">
                  {t.subheadings?.length || 0} subheadings
                </td>
                <td className="border px-4 py-2">
                  {new Date(t.createdAt).toLocaleDateString()}
                </td>
                <td className="border px-4 py-2">
                  <button
                    onClick={() => handleEdit(t)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <FaEdit />
                  </button>
                </td>
              </tr>
            ))}
            {tests.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="border px-4 py-6 text-center text-gray-500"
                >
                  No blood tests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
