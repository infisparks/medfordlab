"use client";

import React, { useEffect, useState } from "react";
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
}

export interface Subheading {
  title: string;
  parameterNames: string[];
}

export interface Subpricing {
  subpricingName: string;
  price: number;
  includedParameters: string[];
}

export interface BloodTestFormInputs {
  testName: string;
  price: number;
  parameters: Parameter[];
  subheadings: Subheading[];
  subpricing: Subpricing[];
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
          {...register(`parameters.${index}.unit`, { required: "Required" })}
          className="w-full border rounded px-2 py-1"
        />
        {paramUnitErr && <p className="text-red-500 text-xs">{paramUnitErr}</p>}
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
                {...register(
                  `parameters.${index}.range.male.${mIndex}.rangeKey`,
                  { required: "Required" }
                )}
                className="w-1/2 border rounded px-2 py-1"
              />
              <input
                type="text"
                {...register(
                  `parameters.${index}.range.male.${mIndex}.rangeValue`,
                  { required: "Required" }
                )}
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
                {...register(
                  `parameters.${index}.range.female.${fIndex}.rangeKey`,
                  { required: "Required" }
                )}
                className="w-1/2 border rounded px-2 py-1"
              />
              <input
                type="text"
                {...register(
                  `parameters.${index}.range.female.${fIndex}.rangeValue`,
                  { required: "Required" }
                )}
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

  // Called on parameter select
  const handleParameterChange = (pIndex: number, newValue: string) => {
    if (!newValue) return;
    // Gather *all* subheading param names across all subheadings
    const allSubheadings = getValues("subheadings") || [];
    // The parameter the user changed
    for (let shIndex = 0; shIndex < allSubheadings.length; shIndex++) {
      // skip the one we're editing
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
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                    handleParameterChange(pIndex, e.target.value);
                  },
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
// SUBPRICING EDITOR
// -----------------------------
interface SubpricingEditorProps {
  index: number;
  control: any;
  register: any;
  errors: FieldErrorsImpl<any>;
  remove: (index: number) => void;
  getValues: UseFormGetValues<BloodTestFormInputs>;
  setValue: UseFormSetValue<BloodTestFormInputs>;
}

const SubpricingEditor: React.FC<SubpricingEditorProps> = ({
  index,
  control,
  register,
  errors,
  remove,
  getValues,
  setValue,
}) => {
  const includedParamsArray = useFieldArray({
    control,
    name: `subpricing.${index}.includedParameters`,
  });
  const globalParameters = useWatch({ control, name: "parameters" }) || [];

  const subpricingNameErr = getFieldErrorMessage(errors, [
    "subpricing",
    index.toString(),
    "subpricingName",
  ]);
  const subpricingPriceErr = getFieldErrorMessage(errors, [
    "subpricing",
    index.toString(),
    "price",
  ]);

  const handleIncludedParamChange = (incIndex: number, newVal: string) => {
    if (!newVal) return;
    // Check across ALL subpricing objects
    const allSubpricing = getValues("subpricing") || [];
    for (let spIndex = 0; spIndex < allSubpricing.length; spIndex++) {
      if (spIndex === index) continue; // skip current
      const paramNames = allSubpricing[spIndex]?.includedParameters || [];
      if (paramNames.includes(newVal)) {
        alert(
          `Parameter "${newVal}" is already used in a different subpricing block!`
        );
        setValue(
          `subpricing.${index}.includedParameters.${incIndex}`,
          ""
        );
        return;
      }
    }

    // Auto-fill subpricingName if it's empty and this is the only param
    const incParams = getValues(`subpricing.${index}.includedParameters`);
    const nonEmpty = incParams.filter((p) => p).length;
    const currentName = getValues(`subpricing.${index}.subpricingName`);
    if (!currentName && nonEmpty === 1) {
      setValue(`subpricing.${index}.subpricingName`, newVal);
    }
  };

  return (
    <div className="border p-4 rounded mb-4 bg-gray-50">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">Subpricing #{index + 1}</h3>
        <button
          type="button"
          onClick={() => remove(index)}
          className="text-red-500 hover:text-red-700"
        >
          <FaTrash />
        </button>
      </div>

      {/* subpricingName */}
      <div className="mt-2">
        <label className="block text-xs">Subpricing Name</label>
        <input
          type="text"
          {...register(`subpricing.${index}.subpricingName`, {
            required: "Required",
          })}
          className="w-full border rounded px-2 py-1"
        />
        {subpricingNameErr && (
          <p className="text-red-500 text-xs">{subpricingNameErr}</p>
        )}
      </div>

      {/* price */}
      <div className="mt-2">
        <label className="block text-xs">Subpricing Price (Rs.)</label>
        <input
          type="number"
          step="0.01"
          {...register(`subpricing.${index}.price`, {
            required: "Required",
            valueAsNumber: true,
          })}
          className="w-full border rounded px-2 py-1"
        />
        {subpricingPriceErr && (
          <p className="text-red-500 text-xs">{subpricingPriceErr}</p>
        )}
      </div>

      {/* includedParameters */}
      <div className="mt-2">
        <h4 className="text-xs font-medium">Included Parameters</h4>
        {includedParamsArray.fields.map((field, incIndex) => {
          const incParamErr = getFieldErrorMessage(errors, [
            "subpricing",
            index.toString(),
            "includedParameters",
            incIndex.toString(),
          ]);
          return (
            <div key={field.id} className="flex items-center space-x-2 mt-1">
              <select
                {...register(`subpricing.${index}.includedParameters.${incIndex}`, {
                  required: "Required",
                  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => handleIncludedParamChange(incIndex, e.target.value),
                })}
                className="w-full border rounded px-2 py-1"
              >
                <option value="">Select Parameter</option>
                {globalParameters.map((param: { name: string }, pIdx: number) => (
                  <option key={pIdx} value={param.name}>
                    {param.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => includedParamsArray.remove(incIndex)}
                className="text-red-500 hover:text-red-700"
              >
                <FaTrash />
              </button>
              {incParamErr && (
                <p className="text-red-500 text-xs w-full">{incParamErr}</p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => includedParamsArray.append("")}
          className="mt-2 inline-flex items-center px-2 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
        >
          <FaPlus className="mr-1" /> Add Parameter
        </button>
      </div>
    </div>
  );
};

// -----------------------------
// TEST MODAL (Create & Edit)
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
  const defaultValues: BloodTestFormInputs = testData
    ? {
        testName: testData.testName,
        price: testData.price,
        parameters: testData.parameters,
        subheadings: testData.subheadings,
        subpricing: testData.subpricing || [],
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
          },
        ],
        subheadings: [],
        subpricing: [],
      };

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    getValues,
    setValue,
  } = useForm<BloodTestFormInputs>({ defaultValues });

  const paramFields = useFieldArray({ control, name: "parameters" });
  const subheadingFields = useFieldArray({ control, name: "subheadings" });
  const subpricingFields = useFieldArray({ control, name: "subpricing" });

  const testNameErr = getFieldErrorMessage(errors, ["testName"]);
  const testPriceErr = getFieldErrorMessage(errors, ["price"]);

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

          {/* Subpricing */}
          <div>
            <label className="block text-sm font-medium">
              Parameter-Based Pricing (Optional)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              If subpricing #1 uses   Hemoglobin,  no other subpricing can use  Hemoglobin. 
              If only one parameter is chosen, subpricingName auto-fills. You can still edit it.
            </p>
            <div className="space-y-4">
              {subpricingFields.fields.map((field, spIndex) => (
                <SubpricingEditor
                  key={field.id}
                  index={spIndex}
                  control={control}
                  register={register}
                  errors={errors as FieldErrorsImpl<any>}
                  remove={subpricingFields.remove}
                  getValues={getValues}
                  setValue={setValue}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                subpricingFields.append({
                  subpricingName: "",
                  price: 0,
                  includedParameters: [],
                })
              }
              className="mt-2 inline-flex items-center px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
            >
              <FaPlus className="mr-1" /> Add Subpricing
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
              <th className="border px-4 py-2">Subpricing</th>
              <th className="border px-4 py-2">Created At</th>
              <th className="border px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t.key} className="hover:bg-gray-50">
                <td className="border px-4 py-2">{t.testName}</td>
                <td className="border px-4 py-2">₹{t.price}</td>
                <td className="border px-4 py-2">
                  {t.parameters?.length || 0} parameters
                </td>
                <td className="border px-4 py-2">
                  {t.subheadings?.length || 0} subheadings
                </td>
                <td className="border px-4 py-2">
                  {t.subpricing?.length || 0} subpricing
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
                  colSpan={7}
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
