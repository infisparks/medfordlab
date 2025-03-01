"use client";

import React, { useEffect, useState } from "react";
import { database } from "../../firebase";
import { ref, get, update} from "firebase/database";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFlask,
  faEdit,
  faTrash,
  faRupeeSign,
  faPlusCircle,
  faTimes,
  faChartLine,
  faListOl,
  faCalendar,
} from "@fortawesome/free-solid-svg-icons";

// ------------------------------------------
// INTERFACES
// ------------------------------------------
interface Parameter {
  name: string;
  unit: string;
  normalRangeStart: number;
  normalRangeEnd: number;
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

interface EditTestModalProps {
  testData: TestData;
  onClose: () => void;
  onTestUpdated: () => void;
  onTestDeleted: () => void;
}

// ------------------------------------------
// EDIT MODAL COMPONENT
// ------------------------------------------
const EditTestModal: React.FC<EditTestModalProps> = ({
  testData,
  onClose,
  onTestUpdated,
  onTestDeleted,
}) => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<BloodTestFormInputs>({
    defaultValues: {
      testName: testData.testName,
      price: testData.price,
      parameters: testData.parameters || [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "parameters",
  });

  const onSubmit: SubmitHandler<BloodTestFormInputs> = async (data) => {
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

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this test?")) return;
    try {
      const testRef = ref(database, `bloodTests/${testData.key}`);
      await remove(testRef);
      alert("Test deleted successfully!");
      onTestDeleted();
      onClose();
    } catch (error) {
      console.error("Error deleting test:", error);
      alert("Error deleting test. Please try again.");
    }
  };

  return (
    // The modal overlay now covers only the main content area
    <div
      className="fixed top-0 bottom-0 right-0 left-[256px] z-50 flex items-center justify-end bg-black bg-opacity-40 backdrop-blur-sm"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 mx-4 transition-all duration-300 ease-out max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            <FontAwesomeIcon icon={faEdit} className="mr-2 text-indigo-600" />
            Edit Blood Test
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} className="text-xl" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Test Name */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <label className="block text-sm font-medium text-gray-600 mb-2">
              <FontAwesomeIcon icon={faFlask} className="mr-2 text-indigo-500" />
              Test Name
            </label>
            <input
              type="text"
              {...register("testName", { required: "Test Name is required" })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
            {errors.testName && (
              <p className="text-red-500 text-sm mt-1">
                {errors.testName.message}
              </p>
            )}
          </div>

          {/* Price */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <label className="block text-sm font-medium text-gray-600 mb-2">
              <FontAwesomeIcon icon={faRupeeSign} className="mr-2 text-green-500" />
              Price (Rs.)
            </label>
            <input
              type="number"
              step="0.01"
              {...register("price", {
                required: "Price is required",
                valueAsNumber: true,
              })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
            {errors.price && (
              <p className="text-red-500 text-sm mt-1">
                {errors.price.message}
              </p>
            )}
          </div>

          {/* Parameters */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <label className="block text-sm font-medium text-gray-600">
                <FontAwesomeIcon icon={faListOl} className="mr-2 text-purple-500" />
                Parameters
              </label>
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
                className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
              >
                <FontAwesomeIcon icon={faPlusCircle} className="mr-2" />
                Add Parameter
              </button>
            </div>

            {fields.map((field, index) => (
              <div
                key={field.id}
                className="bg-white p-4 rounded-lg shadow-sm mb-4 border border-gray-100"
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold text-gray-500">
                    Parameter #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      {...register(`parameters.${index}.name`, {
                        required: "Required",
                      })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500"
                      placeholder="Hemoglobin"
                    />
                    {errors.parameters?.[index]?.name && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.parameters[index]?.name?.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Unit
                    </label>
                    <input
                      type="text"
                      {...register(`parameters.${index}.unit`, {
                        required: "Required",
                      })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500"
                      placeholder="g/dL"
                    />
                    {errors.parameters?.[index]?.unit && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors.parameters[index]?.unit?.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Normal Range Start
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register(`parameters.${index}.normalRangeStart`, {
                        required: "Required",
                        valueAsNumber: true,
                      })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Normal Range End
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register(`parameters.${index}.normalRangeEnd`, {
                        required: "Required",
                        valueAsNumber: true,
                      })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4 mt-8">
            <button
              type="button"
              onClick={handleDelete}
              className="px-6 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
            >
              <FontAwesomeIcon icon={faTrash} className="mr-2" />
              Delete Test
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              <FontAwesomeIcon icon={faEdit} className="mr-2" />
              Update Test
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ------------------------------------------
// ADMIN TESTS PAGE COMPONENT
// ------------------------------------------
const AdminTestsPage: React.FC = () => {
  const [tests, setTests] = useState<TestData[]>([]);
  const [selectedTest, setSelectedTest] = useState<TestData | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);

  useEffect(() => {
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
    fetchTests();
  }, []);

  const handleEdit = (test: TestData) => {
    setSelectedTest(test);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedTest(null);
    // Optionally refresh tests list if needed.
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                <FontAwesomeIcon
                  icon={faFlask}
                  className="mr-3 text-indigo-600"
                />
                Blood Test Management
              </h1>
              <p className="text-gray-500 mt-2">
                Manage and update laboratory test configurations
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-indigo-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-indigo-600">
                    <FontAwesomeIcon icon={faFlask} className="mr-2" />
                    Test Name
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-indigo-600">
                    <FontAwesomeIcon icon={faRupeeSign} className="mr-2" />
                    Price
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-indigo-600">
                    <FontAwesomeIcon icon={faChartLine} className="mr-2" />
                    Parameters
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-indigo-600">
                    <FontAwesomeIcon icon={faCalendar} className="mr-2" />
                    Created Date
                  </th>
                  <th className="px-6 py-4 text-sm font-semibold text-indigo-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {tests.map((test: TestData) => (
                  <tr
                    key={test.key}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-800">
                      {test.testName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      ₹{test.price}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm">
                        {test.parameters?.length || 0} parameters
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                      {new Date(test.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleEdit(test)}
                        className="text-indigo-600 hover:text-indigo-900 p-2 rounded-lg hover:bg-indigo-50 transition-colors"
                      >
                        <FontAwesomeIcon icon={faEdit} className="text-lg" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {tests.length === 0 && (
            <div className="text-center py-12">
              <FontAwesomeIcon
                icon={faFlask}
                className="text-4xl text-gray-300 mb-4"
              />
              <p className="text-gray-500">No blood tests found</p>
            </div>
          )}
        </div>
      </div>

      {showModal && selectedTest && (
        <EditTestModal
          testData={selectedTest}
          onClose={handleModalClose}
          onTestUpdated={handleModalClose}
          onTestDeleted={handleModalClose}
        />
      )}
    </div>
  );
};

export default AdminTestsPage;
