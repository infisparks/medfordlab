/* ------------------------------------------------------------------ */
/*  BloodValuesForm.client.tsx                                        */
/* ------------------------------------------------------------------ */
"use client";

import React, { useEffect, useState } from "react";
import {
  useForm,
  SubmitHandler,
  Path,
} from "react-hook-form";
import { useSearchParams, useRouter } from "next/navigation";
import { database } from "../../../firebase";
import { ref, get, set } from "firebase/database";
import {
  FiDroplet,
  FiUser,
  FiAlertCircle,
  FiCheckCircle,
  FiLoader,
} from "react-icons/fi";
import { FaCalculator } from "react-icons/fa";

/* ─────────────────── Types ─────────────────── */
interface SubParameterValue {
  name: string;
  unit: string;
  value: string | number;
  range: string;
  formula?: string;
  valueType: "number" | "text";
}
interface TestParameterValue {
  name: string;
  unit: string;
  value: string | number;
  range: string;
  formula?: string;
  
  valueType: "number" | "text";
  visibility?: string;
  subparameters?: SubParameterValue[];
  suggestions?: { shortName: string; description: string }[];
}

interface SubHeading {
  title: string;
  parameterNames: string[];
  is100?: boolean | string;
}
interface TestValueEntry {
  testId: string;
  testName: string;
  testType: string;
  parameters: TestParameterValue[];
  subheadings?: SubHeading[];
  selectedParameters?: string[];
}

interface BloodValuesFormInputs {
  patientId: string;
  tests: TestValueEntry[];
}
export type IndexedParam = TestParameterValue & { originalIndex: number };

/* ───────────── Helpers ───────────── */
const parseRangeKey = (key: string) => {
  const unit = key.trim().slice(-1);
  const [l, u] = key.slice(0, -1).split("-").map(Number);
  const mul = unit === "y" ? 365 : unit === "m" ? 30 : 1;
  return { lower: l * mul, upper: u * mul };
};
const round2 = (n: number) => +n.toFixed(2);
const isNumeric = (s: string) => !isNaN(+s) && isFinite(+s);

/* ---------- dropdown position helper ---------- */
interface SuggestPos {
  t: number;
  p: number;
  x: number;
  y: number;
  width: number;
}

/* ------------------------------------------------------------------ */
const BloodValuesForm: React.FC = () => {
  const router = useRouter();
  const sp = useSearchParams();
  const patientId = sp.get("patientId");

  const [loading, setLoading] = useState(true);

  /* autocomplete list fetched once */
  const [dbText, setDbText] = useState<string[]>([]);

  /* dropdown state */
  const [suggest, setSuggest] = useState<string[]>([]);
  const [showSug, setShowSug] = useState<SuggestPos | null>(null);

  /* 100 % warnings */
  const [warn100, setWarn100] = useState<Record<string, boolean>>({});

  /* react‑hook‑form */
  const {
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BloodValuesFormInputs>({
    defaultValues: { patientId: patientId || "", tests: [] },
  });

  /* ───────── Load autocomplete once ───────── */
  useEffect(() => {
    (async () => {
      try {
        const snap = await get(ref(database, "autocompleteValues"));
        if (snap.exists()) setDbText(Object.values<string>(snap.val()));
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  /* ───────── Fetch patient + tests ───────── */
  useEffect(() => {
    if (!patientId) return;
    (async () => {
      try {
        const pSnap = await get(ref(database, `patients/${patientId}`));
        if (!pSnap.exists()) {
          setLoading(false);
          return;
        }

        const p = pSnap.val();
        const booked = p.bloodTests || [];
        const stored = p.bloodtest || {};
        const ageDays = p.total_day ? +p.total_day : +p.age * 365;
        const genderKey = p.gender?.toLowerCase() === "male" ? "male" : "female";

        const tests: TestValueEntry[] = await Promise.all(
          booked.map(async (bt: any) => {
            const defSnap = await get(ref(database, `bloodTests/${bt.testId}`));
            if (!defSnap.exists())
              return {
                testId: bt.testId,
                testName: bt.testName,
                testType: bt.testType,
                parameters: [],
                subheadings: [],
                selectedParameters: bt.selectedParameters,
              } as TestValueEntry;

            const def = defSnap.val();
            const allParams = Array.isArray(def.parameters) ? def.parameters : [];

            const wanted = bt.selectedParameters?.length
              ? allParams.filter((p: any) => bt.selectedParameters.includes(p.name))
              : allParams;

            const params: TestParameterValue[] = wanted.map((p: any) => {
              /* normal range */
              const ranges = p.range?.[genderKey] || [];
              let normal = "";
              for (const r of ranges) {
                const { lower, upper } = parseRangeKey(r.rangeKey);
                if (ageDays >= lower && ageDays <= upper) {
                  normal = r.rangeValue;
                  break;
                }
              }
              if (!normal && ranges.length) normal = ranges[ranges.length - 1].rangeValue;

              const testKey = def.testName.toLowerCase().replace(/\s+/g, "_");
              const saved = stored?.[testKey]?.parameters?.find((q: any) => q.name === p.name);

              let subps;
              if (Array.isArray(p.subparameters)) {
                subps = p.subparameters.map((s: any) => {
                  const sr = s.range?.[genderKey] || [];
                  let sNorm = "";
                  for (const x of sr) {
                    const { lower, upper } = parseRangeKey(x.rangeKey);
                    if (ageDays >= lower && ageDays <= upper) {
                      sNorm = x.rangeValue;
                      break;
                    }
                  }
                  if (!sNorm && sr.length) sNorm = sr[sr.length - 1].rangeValue;
                  const savedSp = saved?.subparameters?.find((z: any) => z.name === s.name);
                  return {
                    name: s.name,
                    unit: s.unit,
                    value: savedSp ? savedSp.value : "",
                    range: sNorm,
                    formula: s.formula || "",
                    valueType: s.valueType || "number",
                  } as SubParameterValue;
                });
              }
              return {
                name: p.name,
                unit: p.unit,
                value: saved ? saved.value : "",
                range: normal,
                formula: p.formula || "",
                valueType: p.valueType || "number",
                visibility: p.visibility ?? "visible",
                ...(subps ? { subparameters: subps } : {}),
                ...(p.suggestions ? { suggestions: p.suggestions } : {}),
              } as TestParameterValue;
            });

            return {
              testId: bt.testId,
              testName: def.testName,
              testType: bt.testType,
              parameters: params,
              subheadings: def.subheadings || [],
              selectedParameters: bt.selectedParameters,
            } as TestValueEntry;
          })
        );

        reset({ patientId, tests });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId, reset]);

  /* ───────── SHIFT → recalc all formulas ───────── */
  useEffect(() => {
    const runAll = () => {
      const tArr = watch("tests");
      tArr.forEach((t, tIdx) => {
        const nums: Record<string, number> = {};
        t.parameters.forEach((p) => {
          const v = +p.value;
          if (!isNaN(v)) nums[p.name] = v;
        });
        t.parameters.forEach((p, pIdx) => {
          if (p.formula && p.valueType === "number") {
            let expr = p.formula;
            Object.entries(nums).forEach(([k, v]) => {
              expr = expr.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), v + "");
            });
            try {
              const r = Function('"use strict";return (' + expr + ")")();
              if (!isNaN(r)) {
                setValue(`tests.${tIdx}.parameters.${pIdx}.value`, round2(+r).toFixed(2), {
                  shouldValidate: false,
                });
              }
            } catch {}
          }
        });
      });
    };
    const onKey = (e: KeyboardEvent) => e.key === "Shift" && runAll();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [watch, setValue]);

  /* ───────── Live rounding & warn flags ───────── */
  const testsWatch = watch("tests");
  useEffect(() => {
    const clone = JSON.parse(JSON.stringify(testsWatch)) as TestValueEntry[];
    const warn: Record<string, boolean> = {};
    let dirty = false;
    clone.forEach((t, tIdx) => {
      t.parameters.forEach((p, pIdx) => {
        if (p.valueType === "number" && p.value !== "") {
          const vs = (+p.value).toFixed(2);
          if (String(p.value) !== vs) {
            clone[tIdx].parameters[pIdx].value = vs;
            dirty = true;
          }
        }
      });

      t.subheadings?.forEach((sh, shIdx) => {
        if (!(sh.is100 === true || sh.is100 === "true")) return;
        const tag = `${tIdx}-${shIdx}`;
        const idxs = sh.parameterNames
          .map((n) => t.parameters.findIndex((p) => p.name === n))
          .filter((i) => i >= 0);
        let sum = 0;
        idxs.forEach((i) => {
          const v = +clone[tIdx].parameters[i].value;
          if (!isNaN(v)) sum += v;
        });
        warn[tag] = sum > 100.0001;
      });
    });
    if (dirty) setValue("tests", clone, { shouldValidate: false });
    setWarn100(warn);
  }, [testsWatch, setValue]);

  /* ───────── Handlers ───────── */
  const numericChange = (v: string, t: number, p: number, sp?: number) => {
    if (v !== "" && !isNumeric(v)) return;
    const path =
      sp == null
        ? `tests.${t}.parameters.${p}.value`
        : `tests.${t}.parameters.${p}.subparameters.${sp}.value`;
    setValue(path as Path<BloodValuesFormInputs>, v, { shouldValidate: false });
  };

  /* suggestion helpers */
  const buildMatches = (param: TestParameterValue, q: string): string[] => {
      // Show test‑specific suggestions only when the array is **not empty**
  if (Array.isArray(param.suggestions) && param.suggestions.length > 0) {
    const pool = param.suggestions.map((s) => s.description);
    return q ? pool.filter((d) => d.toLowerCase().includes(q)) : pool;
  }

    return q ? dbText.filter((s) => s.toLowerCase().includes(q)) : dbText;
  };

  const showDropdown = (t: number, p: number, rect: DOMRect, q: string) => {
    const currentParam = watch("tests")[t].parameters[p];
    const matches = buildMatches(currentParam, q);
    setSuggest(matches);
    if (matches.length) {
      setShowSug({
        t,
        p,
        x: rect.left + window.scrollX,
        y: rect.bottom + window.scrollY,
        width: rect.width,
      });
    } else {
      setShowSug(null);
    }
  };

  const textChange = (txt: string, t: number, p: number, rect: DOMRect) => {
    setValue(`tests.${t}.parameters.${p}.value` as Path<BloodValuesFormInputs>, txt, {
      shouldValidate: false,
    });
    showDropdown(t, p, rect, txt.trim().toLowerCase());
  };

  const pickSug = (val: string, t: number, p: number) => {
    setValue(`tests.${t}.parameters.${p}.value` as Path<BloodValuesFormInputs>, val);
    setSuggest([]);
    setShowSug(null);
  };

  const calcFormulaOnce = (tIdx: number, pIdx: number) => {
    const data = watch("tests")[tIdx];
    const p = data.parameters[pIdx];
    if (!p.formula || p.valueType !== "number") return;
    const nums: Record<string, number> = {};
    data.parameters.forEach((x) => {
      const v = +x.value;
      if (!isNaN(v)) nums[x.name] = v;
    });
    let expr = p.formula;
    Object.entries(nums).forEach(([k, v]) => {
      expr = expr.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), v + "");
    });
    try {
      const r = Function('"use strict";return (' + expr + ")")();
      if (!isNaN(r))
        setValue(`tests.${tIdx}.parameters.${pIdx}.value`, round2(+r).toFixed(2));
    } catch {}
  };

  /* manual "Calculate" 100% */
  const fillRemaining = (tIdx: number, sh: SubHeading, lastIdx: number) => {
    const test = watch("tests")[tIdx];
    const idxs = sh.parameterNames
      .map((n) => test.parameters.findIndex((p) => p.name === n))
      .filter((i) => i >= 0);
    let total = 0;
    idxs.slice(0, -1).forEach((i) => {
      const v = +test.parameters[i].value;
      if (!isNaN(v)) total += v;
    });
    setValue(
      `tests.${tIdx}.parameters.${lastIdx}.value`,
      round2(100 - total).toFixed(2),
      { shouldValidate: false }
    );
  };

  /* ───────── Submit ───────── */
  const onSubmit: SubmitHandler<BloodValuesFormInputs> = async (data) => {
    try {
      for (const t of data.tests) {
        const key = t.testName.toLowerCase().replace(/\s+/g, "_").replace(/[.#$[\]]/g, "");
        const params = t.parameters
          .map((p) => {
            const subs = p.subparameters?.filter((sp) => sp.value !== "") ?? [];
            if (p.value !== "" || subs.length) {
              const obj: any = { ...p, subparameters: subs };
              if (p.valueType === "number" && p.value !== "") obj.value = +p.value;
              subs.forEach((sp) => {
                if (sp.valueType === "number" && sp.value !== "") sp.value = +sp.value;
              });
              return obj;
            }
            return null;
          })
          .filter(Boolean) as TestParameterValue[];

        await set(ref(database, `patients/${data.patientId}/bloodtest/${key}`), {
          parameters: params,
          subheadings: t.subheadings || [],
          createdAt: new Date().toISOString(),
        });
      }

      alert("Saved!");
      router.push(`/download-report?patientId=${data.patientId}`);
    } catch (e) {
      console.error(e);
      alert("Save failed.");
    }
  };

  /* ───────── Render helpers ───────── */
  if (!patientId)
    return (
      <CenterCard icon={FiUser} title="Patient Not Found">
        <button onClick={() => router.push("/")} className="btn-blue">
          Back
        </button>
      </CenterCard>
    );
  if (loading)
    return (
      <CenterCard icon={FiLoader} spin>
        Loading…
      </CenterCard>
    );

  const tests = watch("tests");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-2">
      <div className="w-full max-w-3xl bg-white p-4 rounded-xl shadow relative">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-full">
            <FiDroplet className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="font-bold text-lg">Blood Test Analysis</h1>
            <p className="text-sm text-gray-600">Patient ID: {patientId}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {tests.map((test, tIdx) => {
            if (test.testType?.toLowerCase() === "outsource") {
              return (
                <div
                  key={test.testId}
                  className="border-l-4 border-yellow-400 bg-yellow-50 mb-4 p-3 rounded"
                >
                  <div className="flex items-center gap-2">
                    <FiDroplet className="w-4 h-4 text-yellow-600" />
                    <h3 className="font-semibold">{test.testName}</h3>
                  </div>
                  <p className="mt-2 text-sm text-yellow-800">
                    This is an outsourced test. No data entry is required.
                  </p>
                </div>
              );
            }

            const sh = test.subheadings || [];
            const shNames = sh.flatMap((x) => x.parameterNames);
            const globals = test.parameters
              .map((p, i) => ({ ...p, originalIndex: i }))
              .filter((p) => !shNames.includes(p.name));

            return (
              <div
                key={test.testId}
                className="border-l-4 border-blue-600 bg-gray-50 mb-4 p-3 rounded"
              >
                <div className="flex items-center gap-2 mb-2">
                  <FiDroplet className="w-4 h-4 text-blue-600" />
                  <h3 className="font-semibold">{test.testName}</h3>
                </div>

                {/* Globals */}
                {sh.length > 0 && globals.length > 0 && (
                  <>
                    <h4 className="font-bold text-sm mb-1">Global Parameters</h4>
                    {globals.map((p) => (
                      <ParamRow
                        key={p.originalIndex}
                        tIdx={tIdx}
                        pIdx={p.originalIndex}
                        param={p}
                        tests={tests}
                        errors={errors}
                        numericChange={numericChange}
                        textChange={textChange}
                        pickSug={pickSug}
                        calcOne={calcFormulaOnce}
                        setSuggest={setSuggest}
                        setShowSug={setShowSug}
                      />
                    ))}
                  </>
                )}

                {/* Sub‑headings */}
                {sh.length ? (
                  sh.map((s, shIdx) => {
                    const tag = `${tIdx}-${shIdx}`;
                    const list = test.parameters
                      .map((p, i) => ({ ...p, originalIndex: i }))
                      .filter((p) => s.parameterNames.includes(p.name));
                    const need100 = s.is100 === true || s.is100 === "true";
                    const last = list[list.length - 1];

                    return (
                      <div key={shIdx} className="mt-3">
                        <h4
                          className={`font-bold text-sm mb-1 ${
                            warn100[tag] ? "text-red-600" : ""
                          }`}
                        >
                          {s.title}
                          {need100 && (
                            <span className="text-xs text-gray-500 ml-2">
                              (must total 100%)
                            </span>
                          )}
                        </h4>
                        {list.map((p) => {
                          const isLast = need100 && p.originalIndex === last.originalIndex;
                          return (
                            <ParamRow
                              key={p.originalIndex}
                              tIdx={tIdx}
                              pIdx={p.originalIndex}
                              param={{ ...p, originalIndex: p.originalIndex }}
                              tests={tests}
                              errors={errors}
                              pickSug={pickSug}
                              numericChange={numericChange}
                              textChange={textChange}
                              calcOne={calcFormulaOnce}
                              isLastOf100={isLast}
                              fillRemaining={() => fillRemaining(tIdx, s, p.originalIndex)}
                              setSuggest={setSuggest}
                              setShowSug={setShowSug}
                            />
                          );
                        })}
                      </div>
                    );
                  })
                ) : (
                  test.parameters.map((p, pIdx) => (
                    <ParamRow
                      key={pIdx}
                      tIdx={tIdx}
                      pIdx={pIdx}
                      param={{ ...p, originalIndex: pIdx }}
                      tests={tests}
                      errors={errors}
                      numericChange={numericChange}
                      textChange={textChange}
                      calcOne={calcFormulaOnce}
                      setSuggest={setSuggest}
                      setShowSug={setShowSug}
                      pickSug={pickSug}
                    />
                  ))
                )}
              </div>
            );
          })}

          <div className="border-t pt-3 mt-4">
            <button disabled={isSubmitting} className="btn-blue w-full flex gap-2 justify-center">
              {isSubmitting ? (
                <>
                  <FiLoader className="animate-spin w-5 h-5" />
                  Saving…
                </>
              ) : (
                <>
                  <FiCheckCircle className="w-5 h-5" />
                  Save
                </>
              )}
            </button>
          </div>
        </form>

        {/* dropdown */}
        {showSug && suggest.length > 0 && (
  <div
    className="fixed z-50 bg-white border rounded shadow max-h-40 overflow-auto py-1"
    style={{
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: `${showSug.width}px`,
      maxWidth: "90vw",       // never wider than 90% of viewport
      maxHeight: "80vh",      // never taller than 80% of viewport
    }}
  >
    {suggest.map((s, i) => (
      <div
        key={i}
        className="px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm"
        onMouseDown={(e) => {
          e.preventDefault();
          pickSug(s, showSug.t, showSug.p);
        }}
      >
        {s}
      </div>
    ))}
  </div>
)}

      </div>
    </div>
  );
};

/* ---------- sub‑row component ---------- */
interface RowProps {
  tIdx: number;
  pIdx: number;
  param: IndexedParam;
  tests: TestValueEntry[];
  errors: any;
  numericChange: (v: string, t: number, p: number, sp?: number) => void;
  textChange: (txt: string, t: number, p: number, rect: DOMRect) => void;
  calcOne: (t: number, p: number) => void;
  isLastOf100?: boolean;
  fillRemaining?: () => void;
  setSuggest: (s: string[]) => void;
  setShowSug: (p: SuggestPos | null) => void;
  pickSug: (val: string, t: number, p: number) => void;
}
const ParamRow: React.FC<RowProps> = ({
  tIdx,
  pIdx,
  param,
  tests,
  errors,
  numericChange,
  textChange,
  calcOne,
  isLastOf100,
  fillRemaining,
  setSuggest,
  setShowSug,
 
}) => {
  const common = { className: "input", placeholder: param.valueType === "number" ? "Value" : "Text" };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const rect = e.target.getBoundingClientRect();
    textChange(e.target.value, tIdx, pIdx, rect);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rect = e.target.getBoundingClientRect();
    textChange(e.target.value, tIdx, pIdx, rect);
  };

  const handleBlur = () => {
    /* hide dropdown AFTER click selection (50 ms delay) */
    setTimeout(() => {
      setSuggest([]);
      setShowSug(null);
    }, 50);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (!form) return;
      // collect only the INPUTs in document order
      const inputs = Array.from(form.elements)
        .filter((el): el is HTMLInputElement => el.tagName === 'INPUT');
      const idx = inputs.indexOf(e.currentTarget);
      const next = inputs[idx + 1];
      if (next) next.focus();
    }
  };
  return (
    <div className="pl-2 mb-1">
      <div className="flex items-center text-sm border rounded px-2 py-1">
        <div className="flex-1 flex items-center">
          <span className="font-medium text-gray-700">
            {param.name}
            {param.unit && (
              <span className="ml-1 text-xs text-gray-500">({param.unit})</span>
            )}
          </span>
          {param.formula && param.valueType === "number" && (
            <button
              type="button"
              onClick={() => calcOne(tIdx, pIdx)}
              className="ml-2 text-blue-600 hover:text-blue-800"
            >
              <FaCalculator className="w-3 h-3" />
            </button>
          )}
          {isLastOf100 && (
            <button
              type="button"
              onClick={fillRemaining}
              className="ml-2 text-green-600 hover:text-green-800 text-xs border border-green-600 px-1 rounded"
            >
              Calculate
            </button>
          )}
        </div>

        {param.valueType === "number" ? (
          <div className="mx-2 w-28 relative">
            <input
              {...common}
              onKeyDown={handleKeyDown}    
              type="text"
              value={String(tests[tIdx].parameters[pIdx].value ?? "")}
              onChange={(e) => numericChange(e.target.value, tIdx, pIdx)}
            />
            {errors.tests?.[tIdx]?.parameters?.[pIdx]?.value && (
              <FiAlertCircle className="absolute right-1 top-1.5 w-4 h-4 text-red-500" />
            )}
          </div>
        ) : (
          <div className="mx-2 w-32">
            <input
              {...common}
              type="text"
              value={String(tests[tIdx].parameters[pIdx].value ?? "")}
              onFocus={handleFocus}
              onChange={handleChange}
              onBlur={handleBlur}
            />
          </div>
        )}

        <div className="flex-1 text-right text-gray-600">
          Normal Range: <span className="font-medium text-green-600">{param.range}</span>
        </div>
      </div>
    </div>
  );
};

/* ---------- CenterCard helper ---------- */
const CenterCard: React.FC<{
  icon: any;
  title?: string;
  spin?: boolean;
  children: React.ReactNode;
}> = ({ icon: Icon, title, spin, children }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <div className="bg-white p-8 rounded-xl shadow text-center max-w-md">
      <Icon className={`w-12 h-12 text-blue-600 mx-auto mb-4 ${spin ? "animate-spin" : ""}`} />
      {title && <h2 className="font-bold text-xl mb-2">{title}</h2>}
      {children}
    </div>
  </div>
);

/* ---------- tiny Tailwind helpers ---------- */
// const input = "w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200";
// const btn = "px-6 py-2 rounded-lg font-medium transition-colors focus:outline-none";
/* in globals.css:
.input   { @apply w-full px-2 py-1 border rounded focus:ring-1 focus:ring-blue-200; }
.btn-blue{ @apply bg-blue-600 text-white hover:bg-blue-700; }
*/
export default BloodValuesForm;
