"use client"

import { jsPDF } from "jspdf"
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"
import { getStorage } from "firebase/storage"
import type { PatientData, Parameter } from "../download-report/page"
import letterhead from "../../../public/letterhead.png"
import firstpage from "../../../public/first.png"

// MedZeal services list for Gemini API
const MEDZEAL_SERVICES = {
  physiotherapy: [
    "Neuro Physiotherapy",
    "Cardiorespiratory Physiotherapy",
    "Sports Therapy",
    "Speech Therapy",
    "Paediatric Physiotherapy",
    "Orthopaedic Physiotherapy",
    "Post-operative Physiotherapy",
    "Geriatric Physiotherapy",
    "Maternal Physiotherapy",
  ],
  wellness: [
    "Massage Therapy",
    "Yoga",
    "Acupuncture",
    "Clinical Nutrition Counselling",
    "Virtual Reality (VR) Therapy",
    "Sensory Desensitization",
    "De-Addiction Programs",
    "Hijama Therapy",
    "Chiropractic Services",
  ],
  aesthetic: [
    "Advance Peel",
    "Yellow Peel",
    "Black Peel",
    "Cocktail Peel",
    "Body Peel",
    "BioRePeel",
    "Glycolic Peel",
    "Party Peel",
    "Salicylic Peel",
    "Whitening Peel",
    "Basic Peel",
  ],
  ivDrips: ["Glutathione Drip", "NAD⁺ Anti-aging Drip", "Hydration Drip", "Myers Cocktail IV Therapy"],
  facials: [
    "MedZeal Facial",
    "Exoluxe Facial",
    "Snail Medifacial",
    "Vampire Facial",
    "Medifacial",
    "Microneedling",
    "PRP",
    "GFC",
    "QR678 Neo",
  ],
}

// Helper function to compress image as JPEG
const loadImageAsCompressedJPEG = async (url: string, quality = 0.5) => {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise<string>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement("canvas")
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext("2d")
      if (!ctx) return reject(new Error("canvas"))
      ctx.drawImage(img, 0, 0)
      resolve(c.toDataURL("image/jpeg", quality))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(blob)
  })
}

// Parse range key
const parseRangeKey = (key: string) => {
  key = key.trim()
  const suf = key.slice(-1)
  let mul = 1
  if (suf === "m") mul = 30
  else if (suf === "y") mul = 365
  const core = key.replace(/[dmy]$/, "")
  const [lo, hi] = core.split("-")
  return { lower: Number(lo) * mul || 0, upper: Number(hi) * mul || Number.POSITIVE_INFINITY }
}

// Parse numeric range string
const parseNumericRangeString = (str: string) => {
  const up = /^\s*up\s*(?:to\s*)?([\d.]+)\s*$/i.exec(str)
  if (up) {
    const upper = Number.parseFloat(up[1])
    return isNaN(upper) ? null : { lower: 0, upper }
  }
  const m = /^\s*([\d.]+)\s*(?:-|to)\s*([\d.]+)\s*$/i.exec(str)
  if (!m) return null
  const lower = Number.parseFloat(m[1]),
    upper = Number.parseFloat(m[2])
  return isNaN(lower) || isNaN(upper) ? null : { lower, upper }
}

// Format date to DMY format with time
const formatDMY = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date
  const day = d.getDate().toString().padStart(2, "0")
  const month = (d.getMonth() + 1).toString().padStart(2, "0") // months are 0-based
  const year = d.getFullYear()
  let hours = d.getHours()
  const mins = d.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12 || 12 // 12-hour clock
  const hrsStr = hours.toString().padStart(2, "0")
  return `${day}/${month}/${year}, ${hrsStr}:${mins} ${ampm}`
}

// Get all out of range parameters
const getOutOfRangeParameters = (data: PatientData): { testName: string; parameters: Parameter[] }[] => {
  const ageDays = data.total_day ? Number(data.total_day) : Number(data.age) * 365
  const genderKey = data.gender?.toLowerCase() ?? ""
  const result: { testName: string; parameters: Parameter[] }[] = []

  if (!data.bloodtest) return result

  for (const testKey in data.bloodtest) {
    const test = data.bloodtest[testKey]
    if (test.type === "outsource" || !test.parameters.length) continue

    const outOfRangeParams: Parameter[] = []

    // Check main parameters
    for (const param of test.parameters) {
      if (isOutOfRange(param, ageDays, genderKey)) {
        outOfRangeParams.push(param)
      }

      // Check subparameters
      if (param.subparameters?.length) {
        for (const subParam of param.subparameters) {
          if (isOutOfRange(subParam, ageDays, genderKey)) {
            outOfRangeParams.push(subParam)
          }
        }
      }
    }

    if (outOfRangeParams.length > 0) {
      result.push({
        testName: testKey.replace(/_/g, " ").toUpperCase(),
        parameters: outOfRangeParams,
      })
    }
  }

  return result
}

// Check if parameter is out of range
const isOutOfRange = (parameter: Parameter, ageDays: number, genderKey: string): boolean => {
  let rangeStr = ""
  if (typeof parameter.range === "string") {
    rangeStr = parameter.range
  } else {
    const arr = parameter.range[genderKey as keyof typeof parameter.range] || []
    for (const r of arr) {
      const { lower, upper } = parseRangeKey(r.rangeKey)
      if (ageDays >= lower && ageDays <= upper) {
        rangeStr = r.rangeValue
        break
      }
    }
    if (!rangeStr && arr.length) rangeStr = arr[arr.length - 1].rangeValue
  }

  const numRange = parseNumericRangeString(rangeStr)
  const numVal = Number.parseFloat(String(parameter.value))

  if (numRange && !isNaN(numVal)) {
    return numVal < numRange.lower || numVal > numRange.upper
  }

  return false
}

// Get deviation level for color coding
const getDeviationLevel = (
  parameter: Parameter,
  ageDays: number,
  genderKey: string,
): { level: "normal" | "low" | "high"; severity: "mild" | "moderate" | "severe" } => {
  let rangeStr = ""
  if (typeof parameter.range === "string") {
    rangeStr = parameter.range
  } else {
    const arr = parameter.range[genderKey as keyof typeof parameter.range] || []
    for (const r of arr) {
      const { lower, upper } = parseRangeKey(r.rangeKey)
      if (ageDays >= lower && ageDays <= upper) {
        rangeStr = r.rangeValue
        break
      }
    }
    if (!rangeStr && arr.length) rangeStr = arr[arr.length - 1].rangeValue
  }

  const numRange = parseNumericRangeString(rangeStr)
  const numVal = Number.parseFloat(String(parameter.value))

  if (numRange && !isNaN(numVal)) {
    if (numVal < numRange.lower) {
      // Calculate how far below the range
      const deviation = (numRange.lower - numVal) / numRange.lower
      if (deviation > 0.3) return { level: "low", severity: "severe" }
      if (deviation > 0.1) return { level: "low", severity: "moderate" }
      return { level: "low", severity: "mild" }
    } else if (numVal > numRange.upper) {
      // Calculate how far above the range
      const deviation = (numVal - numRange.upper) / numRange.upper
      if (deviation > 0.3) return { level: "high", severity: "severe" }
      if (deviation > 0.1) return { level: "high", severity: "moderate" }
      return { level: "high", severity: "mild" }
    }
  }

  return { level: "normal", severity: "mild" }
}

// Generate coupon code
const generateCouponCode = (length = 10) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Generate recommendations based on test parameters using Gemini API
const generateRecommendations = async (
  outOfRangeParams: { testName: string; parameters: Parameter[] }[],
): Promise<{
  consultationReason: string
  recommendedServices: { name: string; reason: string }[]
  couponCodes: { code: string; service: string; discount: string; reason: string }[]
}> => {
  // Default response in case API fails
  const defaultResponse = {
    consultationReason:
      "General health assessment and personalized treatment plan based on your blood test results that show potential areas for improvement.",
    recommendedServices: [
      {
        name: "Clinical Nutrition Counselling",
        reason:
          "Your blood test indicates potential nutritional imbalances that could be addressed through personalized dietary recommendations and supplementation strategies tailored to your specific health needs.",
      },
      {
        name: "Yoga",
        reason:
          "Regular yoga practice can help improve circulation, reduce stress levels, and enhance overall well-being, which may help address some of the imbalances shown in your blood work.",
      },
      {
        name: "Cardiorespiratory Physiotherapy",
        reason:
          "This specialized therapy can improve oxygen circulation and cardiovascular health, potentially addressing some of the blood parameters that are currently outside optimal ranges.",
      },
      {
        name: "Massage Therapy",
        reason:
          "Therapeutic massage can enhance circulation, reduce inflammation, and promote relaxation, which may help normalize certain blood parameters while improving your overall quality of life.",
      },
    ],
    couponCodes: [
      {
        code: generateCouponCode(),
        service: "Free Consultation",
        discount: "100%",
        reason: "For comprehensive health assessment",
      },
      {
        code: generateCouponCode(),
        service: "Clinical Nutrition Counselling",
        discount: "30%",
        reason: "To address potential nutritional imbalances",
      },
      {
        code: generateCouponCode(),
        service: "Yoga",
        discount: "30%",
        reason: "To improve overall health and wellness",
      },
      {
        code: generateCouponCode(),
        service: "Cardiorespiratory Physiotherapy",
        discount: "30%",
        reason: "For personalized health recommendations",
      },
    ],
  }

  try {
    // Format parameters for the API
    const paramData = outOfRangeParams.map((test) => ({
      testName: test.testName,
      parameters: test.parameters.map((p) => ({
        name: p.name,
        value: p.value,
        unit: p.unit,
        range: typeof p.range === "string" ? p.range : "Complex range",
      })),
    }))

    // Prepare API request to Gemini
    const apiKey = "AIzaSyA0G8Jhg6yJu-D_OI97_NXgcJTlOes56P8" // Using the API key from the glucose monitoring component
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`

    const services = Object.values(MEDZEAL_SERVICES).flat()

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `Based on these out-of-range test parameters: ${JSON.stringify(paramData)}, 
              and considering these available services at MedZeal: ${JSON.stringify(services)},
              please provide:
              1. A reason why the patient should get a free consultation (consultationReason) - between 20-40 words
              2. 4 DIFFERENT recommended services from the list that would benefit the patient based on their test results (recommendedServices)
              3. Detailed reasons for each recommended service (20-40 words each) explaining specifically how each service would help with their test results
              Format your response as JSON with this structure:
              {
                "consultationReason": "string (20-40 words)",
                "recommendedServices": [
                  { "name": "service name from the list", "reason": "why this service is recommended (20-40 words)" }
                ]
              }`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      console.error("Gemini API error:", await response.text())
      return defaultResponse
    }

    const result = await response.json()
    const recommendations = JSON.parse(result.candidates[0].content.parts[0].text)

    // Ensure we have 4 unique services
    let uniqueServices = Array.from(new Set(recommendations.recommendedServices.map((s: { name: string }) => s.name)))
      .map((name) => recommendations.recommendedServices.find((s: { name: string }) => s.name === name))
      .slice(0, 4)

    // If we don't have 4 unique services, add from our default list
    if (uniqueServices.length < 4) {
      const existingNames = uniqueServices.map((s: { name: string }) => s.name)
      const additionalServices = defaultResponse.recommendedServices
        .filter((s) => !existingNames.includes(s.name))
        .slice(0, 4 - uniqueServices.length)

      uniqueServices = [...uniqueServices, ...additionalServices]
    }

    // Generate coupon codes - always return 4 coupons (1 free, 3 at 30% off)
    const couponCodes = [
      {
        code: generateCouponCode(),
        service: "Free Consultation",
        discount: "100%",
        reason: recommendations.consultationReason,
      },
    ]

    // Add service coupons - ensure we have 3 coupons at 30% off for different services
    for (let i = 0; i < 3; i++) {
      const service = uniqueServices[i]
      couponCodes.push({
        code: generateCouponCode(),
        service: service.name,
        discount: "30%",
        reason: service.reason,
      })
    }

    return {
      consultationReason: recommendations.consultationReason,
      recommendedServices: uniqueServices,
      couponCodes,
    }
  } catch (error) {
    console.error("Error generating recommendations:", error)
    return defaultResponse
  }
}

// Send report to WhatsApp
const sendReportToWhatsApp = async (patientData: PatientData, pdfBlob: Blob): Promise<boolean> => {
  try {
    const store = getStorage()
    const filename = `reports/${patientData.name}_report.pdf`
    const fileRef = storageRef(store, filename)
    const snap = await uploadBytes(fileRef, pdfBlob)
    const url = await getDownloadURL(snap.ref)

    const payload = {
      token: "99583991573",
      number: "91" + patientData.contact,
      imageUrl: url,
      caption: `Dear ${patientData.name},\n\nYour blood test report is now available:\n${url}\n\nRegards,\nYour Lab Team`,
    }

    const res = await fetch("https://wa.medblisss.com/send-image-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ message: "Unknown error" }))
      console.error("WhatsApp API Error:", errorData)
      return false
    }

    return true
  } catch (error) {
    console.error("Error sending WhatsApp message:", error)
    return false
  }
}

// Improved parameter graph function for more professional and eye-catching visualization
let doc!: jsPDF;

const drawParameterGraph = (
  param: Parameter,
  x: number,
  y: number,
  width: number,
  height: number,
  ageDays: number,
  genderKey: string,
) => {
  const numRange = parseNumericRangeString(typeof param.range === "string" ? param.range : "")
  const numVal = Number.parseFloat(String(param.value))

  if (!numRange || isNaN(numVal)) return height

  const { lower, upper } = numRange
  const range = upper - lower

  // Get deviation level for color coding
  const deviation = getDeviationLevel(param, ageDays, genderKey)

  // Draw background with gradient effect
  const segments = 20
  const segmentWidth = width / segments

  for (let i = 0; i < segments; i++) {
    // Create a gradient effect from left to right
    if (i < segments * 0.33) {
      // Yellow zone (low)
      doc.setFillColor(255, 235, 59)
    } else if (i < segments * 0.67) {
      // Green zone (normal)
      doc.setFillColor(75, 181, 67)
    } else {
      // Red zone (high)
      doc.setFillColor(244, 67, 54)
    }

    doc.rect(x + i * segmentWidth, y, segmentWidth, height, "F")
  }

  // Add a border to the entire graph
  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.2)
  doc.rect(x, y, width, height, "S")

  // Calculate position for the value marker
  let valuePosition
  if (numVal <= lower) {
    valuePosition = x + 2
  } else if (numVal >= upper) {
    valuePosition = x + width - 2
  } else {
    valuePosition = x + ((numVal - lower) / range) * width
  }

  // Draw value marker with appropriate color based on deviation
  let markerColor
  if (deviation.level === "normal") {
    markerColor = [0, 51, 102] // Blue for normal
  } else if (deviation.level === "low") {
    if (deviation.severity === "mild")
      markerColor = [255, 235, 59] // Yellow for mild low
    else if (deviation.severity === "moderate")
      markerColor = [255, 152, 0] // Orange for moderate low
    else markerColor = [244, 67, 54] // Red for severe low
  } else {
    // high
    if (deviation.severity === "mild")
      markerColor = [255, 152, 0] // Orange for mild high
    else markerColor = [244, 67, 54] // Red for moderate/severe high
  }

  // Draw value marker with shadow effect
  doc.setFillColor(30, 30, 30)
  doc.circle(valuePosition, y + height / 2 + 0.2, 1.7, "F") // Shadow
  doc.setFillColor(markerColor[0], markerColor[1], markerColor[2])
  doc.circle(valuePosition, y + height / 2, 1.5, "F") // Marker

  // Draw scale values with better styling
  doc.setFont("helvetica", "normal").setFontSize(6).setTextColor(80, 80, 80)
  doc.text(lower.toString(), x, y + height + 3)
  doc.text(upper.toString(), x + width, y + height + 3, { align: "right" })

  // Add out-of-range indicator circle at the end if needed
  if (deviation.level !== "normal") {
    const circleX = x + width + 5
    const circleY = y + height / 2

    // Set color based on severity
    if (deviation.severity === "mild") {
      doc.setFillColor(255, 235, 59) // Yellow for mild
    } else if (deviation.severity === "moderate") {
      doc.setFillColor(255, 152, 0) // Orange for moderate
    } else {
      doc.setFillColor(244, 67, 54) // Red for severe
    }

    doc.circle(circleX, circleY, 1.5, "F")
  }

  return height + 3
}

// Modify the generateGraphPDF function to change page sequence and layout
export const generateGraphPDF = async (data: PatientData): Promise<Blob> => {
  const doc = new jsPDF("p", "mm", "a4")
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  const left = 23
  const totalW = w - 2 * left
  const base = totalW / 4
  const wParam = base * 1.4
  const wValue = base * 0.6
  const wRange = base * 1.2
  const wUnit = totalW - (wParam + wValue + wRange)
  const x1 = left
  const x2 = x1 + wParam
  const x3 = x2 + wValue + 15
  const x4 = x3 + wUnit
  const lineH = 5
  const ageDays = data.total_day ? Number(data.total_day) : Number(data.age) * 365
  const genderKey = data.gender?.toLowerCase() ?? ""

  let currentPage = 1

  // Add letterhead to page
  const addLetter = async () => {
    try {
      const img = await loadImageAsCompressedJPEG(letterhead.src, 0.5)
      doc.addImage(img, "JPEG", 0, 0, w, h)
    } catch (e) {
      console.error(e)
    }
  }

  // Add first page
  const addCover = async () => {
    try {
      const img = await loadImageAsCompressedJPEG(firstpage.src, 0.5)
      doc.addImage(img, "JPEG", 0, 0, w, h)
    } catch (e) {
      console.error(e)
    }
  }

  // Check if we need to add a new page based on remaining space
  const checkPageBreak = (currentY: number, requiredSpace = 100) => {
    if (currentY > h - requiredSpace) {
      doc.addPage()
      currentPage++
      return headerY()
    }
    return currentY
  }

  // Add patient header info
  const headerY = (reportedOnRaw?: string, showHeader = false) => {
    const gap = 7
    let y = 50

    if (showHeader) {
      doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0, 0, 0)

      const sampleDT = data.sampleCollectedAt ? new Date(data.sampleCollectedAt) : new Date(data.createdAt)
      const sampleDTStr = formatDMY(sampleDT)
      const registrationStr = formatDMY(data.createdAt)
      const reportedOnStr = reportedOnRaw ? formatDMY(reportedOnRaw) : "-"

      const leftRows = [
        {
          label: "Patient Name",
          value: data.title ? `${data.title} ${data.name.toUpperCase()}` : data.name.toUpperCase(),
        },
        {
          label: "Age/Sex",
          value: `${data.age} ${
            data.dayType === "day" ? "Days" : data.dayType === "month" ? "Months" : "Years"
          } / ${data.gender}`,
        },
        { label: "Ref Doctor", value: (data.doctorName || "-").toUpperCase() },
        { label: "Client Name", value: (data.hospitalName || "-").toUpperCase() },
      ]

      const rightRows = [
        { label: "Patient ID", value: data.patientId },
        { label: "Sample Collected on", value: sampleDTStr },
        { label: "Registration On", value: registrationStr },
        { label: "Reported On", value: reportedOnStr },
      ]
      const maxLeftLabel = Math.max(...leftRows.map((r) => doc.getTextWidth(r.label)))
      const maxRightLabel = Math.max(...rightRows.map((r) => doc.getTextWidth(r.label)))

      const xLL = left
      const xLC = xLL + maxLeftLabel + 2
      const xLV = xLC + 2
      const startR = w / 2 + 10
      const xRL = startR
      const xRC = xRL + maxRightLabel + 2
      const xRV = xRC + 2
      const leftValueWidth = startR - xLV - 4

      for (let i = 0; i < leftRows.length; i++) {
        doc.text(leftRows[i].label, xLL, y)
        doc.text(":", xLC, y)
        if (i === 0) {
          doc.setFont("helvetica", "bold")
          const nameLines = doc.splitTextToSize(leftRows[i].value, leftValueWidth)
          doc.text(nameLines, xLV, y)
          doc.setFont("helvetica", "normal")
          y += nameLines.length * (gap - 2)
        } else {
          doc.text(leftRows[i].value, xLV, y)
          y += gap - 2
        }
        doc.text(rightRows[i].label, xRL, y - (gap - 2))
        doc.text(":", xRC, y - (gap - 2))
        doc.text(rightRows[i].value, xRV, y - (gap - 2))
      }
    }
    return y
  }

  // Print a parameter row
  const printRow = (p: Parameter, indent = 0, yPos: number) => {
    let rangeStr = ""
    if (typeof p.range === "string") {
      rangeStr = p.range
    } else {
      const arr = p.range[genderKey as keyof typeof p.range] || []
      for (const r of arr) {
        const { lower, upper } = parseRangeKey(r.rangeKey)
        if (ageDays >= lower && ageDays <= upper) {
          rangeStr = r.rangeValue
          break
        }
      }
      if (!rangeStr && arr.length) rangeStr = arr[arr.length - 1].rangeValue
    }
    rangeStr = rangeStr.replaceAll("/n", "\n")

    let mark = ""
    const numRange = parseNumericRangeString(rangeStr)
    const numVal = Number.parseFloat(String(p.value))
    if (numRange && !isNaN(numVal)) {
      if (numVal < numRange.lower) mark = " L"
      else if (numVal > numRange.upper) mark = " H"
    }
    const valStr = p.value !== "" ? `${p.value}${mark}` : "-"

    const rangeEmpty = rangeStr.trim() === ""
    const unitEmpty = p.unit.trim() === ""
    const unitOnlyMerge = !rangeEmpty && unitEmpty
    const fullyMerged = rangeEmpty && unitEmpty

    const nameLines = doc.splitTextToSize(" ".repeat(indent) + p.name, wParam - 4)
    let valueSpan = wValue
    if (fullyMerged) valueSpan = wValue + wUnit + wRange
    else if (unitOnlyMerge) valueSpan = wValue + wUnit

    const valueLines = doc.splitTextToSize(valStr, valueSpan - 4)
    const rangeLines = fullyMerged ? [] : doc.splitTextToSize(rangeStr, wRange - 4)
    const unitLines = !unitEmpty && !fullyMerged ? doc.splitTextToSize(p.unit, wUnit - 4) : []

    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0, 0, 0)
    doc.text(nameLines, x1, yPos + 4)
    if (fullyMerged) {
      doc.setFont("helvetica", mark ? "bold" : "normal")
      doc.text(valueLines, x2 + 2, yPos + 4)
    } else if (unitOnlyMerge) {
      doc.setFont("helvetica", mark ? "bold" : "normal")
      doc.text(valueLines, x2 + 2, yPos + 4)
      doc.setFont("helvetica", "normal")
      doc.text(rangeLines, x4 + 2, yPos + 4)
    } else {
      doc.setFont("helvetica", mark ? "bold" : "normal")
      doc.text(valueLines, x2 + 2, yPos + 4)
      doc.setFont("helvetica", "normal")
      doc.text(unitLines, x3 + 2, yPos + 4)
      doc.text(rangeLines, x4 + 2, yPos + 4)
    }

    const maxLines = Math.max(nameLines.length, valueLines.length, rangeLines.length, unitLines.length)
    yPos += maxLines * lineH

    if (p.subparameters?.length) {
      for (const sp of p.subparameters) {
        yPos = printRow({ ...sp }, indent + 2, yPos)
      }
    }

    return yPos
  }

  // Get out of range parameters
  const outOfRangeParams = getOutOfRangeParameters(data)

  // Generate recommendations using Gemini API
  const recommendations = await generateRecommendations(outOfRangeParams)

  // Fixed expiry date as requested
  const expiryDate = "27/05/2025"

  // PAGE 1: Introduction page with first page background
  await addCover()

  // PAGE 2: SPECIAL OFFERS & PROMOTIONS
  doc.addPage()
  currentPage++
  await addLetter()
  let yPos = headerY()

  doc.setDrawColor(0, 51, 102).setLineWidth(0.5)
  doc.line(left, yPos, w - left, yPos)
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0, 51, 102)
  doc.text("SPECIAL OFFERS", w / 2, yPos + 8, { align: "center" })
  yPos += 15

  // MedZeal Physiotherapy & Wellness Center
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(0, 51, 102)
  doc.text("MEDZEAL PHYSIOTHERAPY & WELLNESS CENTER", left, yPos)
  yPos += 8

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0, 0, 0)
  const centerText =
    "MedZeal Physiotherapy & Wellness Center offers comprehensive healthcare services tailored to your specific needs. Our expert team uses evidence-based techniques to help you recover faster and improve your quality of life."
  const centerLines = doc.splitTextToSize(centerText, totalW)
  doc.text(centerLines, left, yPos)
  yPos += centerLines.length * lineH + 5

  // Personalized recommendations
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 51, 102)
  doc.text("PERSONALIZED RECOMMENDATIONS", left, yPos)
  yPos += 6

  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0, 0, 0)
  const consultationText = `Based on your test results, we recommend a free consultation for: ${recommendations.consultationReason}`
  const consultationLines = doc.splitTextToSize(consultationText, totalW)
  doc.text(consultationLines, left, yPos)
  yPos += consultationLines.length * lineH + 3

  // Recommended services
  if (recommendations.recommendedServices.length > 0) {
    doc.setFont("helvetica", "bold").setFontSize(10)
    doc.text("Recommended Services:", left, yPos)
    yPos += lineH

    doc.setFont("helvetica", "normal").setFontSize(9)

    for (const service of recommendations.recommendedServices) {
      const serviceText = `• ${service.name}: ${service.reason}`
      const serviceLines = doc.splitTextToSize(serviceText, totalW - 5)
      doc.text(serviceLines, left + 5, yPos)
      yPos += serviceLines.length * lineH + 1
    }
  }

  yPos += 5

  // Coupon section
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(0, 51, 102)
  doc.text("EXCLUSIVE OFFERS FOR YOU", left, yPos)
  yPos += 6

  // Draw coupon boxes
  doc.setDrawColor(0, 51, 102)
  doc.setLineWidth(0.5)

  // Calculate coupon dimensions for 2x2 grid
  const couponWidth = totalW / 2 - 5
  const couponHeight = 30
  const couponGap = 10

  // Prepare all coupons - ensure we have 4 unique coupons (1 free, 3 at 30% off)
  const allCoupons = recommendations.couponCodes.slice(0, 4)

  // First row of coupons (2 coupons)
  if (allCoupons.length >= 1) {
    // Left coupon - Free consultation
    const leftCoupon = allCoupons[0]
    doc.roundedRect(left, yPos, couponWidth, couponHeight, 2, 2)
    doc.setFillColor(0, 51, 102)
    doc.rect(left, yPos, couponWidth, 8, "F")
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255, 255, 255)
    doc.text("FREE CONSULTATION", left + couponWidth / 2, yPos + 5.5, { align: "center" })
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 51, 102)
    doc.text(leftCoupon.code, left + couponWidth / 2, yPos + 16, { align: "center" })
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(0, 0, 0)
    const leftText = `Use this coupon for a FREE consultation`
    doc.text(leftText, left + couponWidth / 2, yPos + 23, { align: "center" })

    // Right coupon (if available)
    if (allCoupons.length >= 2) {
      const rightCoupon = allCoupons[1]
      const rightX = left + couponWidth + couponGap
      doc.roundedRect(rightX, yPos, couponWidth, couponHeight, 2, 2)
      doc.setFillColor(0, 51, 102)
      doc.rect(rightX, yPos, couponWidth, 8, "F")
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255, 255, 255)
      doc.text("30% OFF", rightX + couponWidth / 2, yPos + 5.5, { align: "center" })
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 51, 102)
      doc.text(rightCoupon.code, rightX + couponWidth / 2, yPos + 16, { align: "center" })
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(0, 0, 0)
      const rightText = `Use this coupon for 30% OFF on ${rightCoupon.service}`
      doc.text(rightText, rightX + couponWidth / 2, yPos + 23, { align: "center" })
    }
  }

  yPos += couponHeight + 5

  // Second row of coupons (2 more coupons if available)
  if (allCoupons.length >= 3) {
    // Left coupon
    const leftCoupon = allCoupons[2]
    doc.roundedRect(left, yPos, couponWidth, couponHeight, 2, 2)
    doc.setFillColor(0, 51, 102)
    doc.rect(left, yPos, couponWidth, 8, "F")
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255, 255, 255)
    doc.text("30% OFF", left + couponWidth / 2, yPos + 5.5, { align: "center" })
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 51, 102)
    doc.text(leftCoupon.code, left + couponWidth / 2, yPos + 16, { align: "center" })
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(0, 0, 0)
    const leftText2 = `Use this coupon for 30% OFF on ${leftCoupon.service}`
    doc.text(leftText2, left + couponWidth / 2, yPos + 23, { align: "center" })

    // Right coupon (if available)
    if (allCoupons.length >= 4) {
      const rightCoupon = allCoupons[3]
      const rightX = left + couponWidth + couponGap
      doc.roundedRect(rightX, yPos, couponWidth, couponHeight, 2, 2)
      doc.setFillColor(0, 51, 102)
      doc.rect(rightX, yPos, couponWidth, 8, "F")
      doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255, 255, 255)
      doc.text("30% OFF", rightX + couponWidth / 2, yPos + 5.5, { align: "center" })
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 51, 102)
      doc.text(rightCoupon.code, rightX + couponWidth / 2, yPos + 16, { align: "center" })
      doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(0, 0, 0)
      const rightText2 = `Use this coupon for 30% OFF on ${rightCoupon.service}`
      doc.text(rightText2, rightX + couponWidth / 2, yPos + 23, { align: "center" })
    }
  }

  yPos += couponHeight + 5

  // Validity with updated expiry date
  doc.setFont("helvetica", "italic").setFontSize(8).setTextColor(0, 0, 0)
  doc.text(`* All offers valid until ${expiryDate}. Cannot be combined with other promotions.`, left, yPos)
  yPos += 5

  // Contact info - centered as requested
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 51, 102)
  doc.text("BOOK YOUR APPOINTMENT TODAY", w / 2, yPos, { align: "center" })
  yPos += 5
  doc.setFont("helvetica", "normal").setFontSize(9)
  doc.text("Call: +91 7044178786 | Email: medzealpcw@gmail.com", w / 2, yPos, { align: "center" })

  // PAGE 3: PARAMETERS REQUIRING ATTENTION
  doc.addPage()
  currentPage++
  await addLetter()
  yPos = headerY(undefined, false) // Don't show patient details on this page

  doc.setDrawColor(0, 51, 102).setLineWidth(0.5)
  doc.line(left, yPos, w - left, yPos)
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0, 51, 102)
  doc.text("PARAMETERS REQUIRING ATTENTION", w / 2, yPos + 8, { align: "center" })
  yPos += 15

  if (outOfRangeParams.length === 0) {
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 0, 0)
    doc.text("All parameters are within normal range.", left, yPos)
    yPos += 10
  } else {
    for (const test of outOfRangeParams) {
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(0, 51, 102)
      doc.text(test.testName, left, yPos)
      yPos += 8

      for (const param of test.parameters) {
        // Check if we need a page break
        yPos = checkPageBreak(yPos, 100)

        // Parameter row with name and value (no graph as requested)
        doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(0, 0, 0)
        doc.text(param.name, left, yPos)

        const numVal = Number.parseFloat(String(param.value))
        const numRange = parseNumericRangeString(typeof param.range === "string" ? param.range : "")
        let mark = ""

        if (numRange && !isNaN(numVal)) {
          if (numVal < numRange.lower) mark = " L"
          else if (numVal > numRange.upper) mark = " H"
        }

        // Get deviation level for color coding
        const deviation = getDeviationLevel(param, ageDays, genderKey)

        // Set color based on deviation
        if (deviation.level === "normal") {
          doc.setTextColor(0, 0, 0) // Black for normal
        } else if (deviation.severity === "mild") {
          doc.setTextColor(255, 152, 0) // Orange for mild deviation
        } else {
          doc.setTextColor(244, 67, 54) // Red for moderate/severe deviation
        }

        doc.setFont("helvetica", "bold").setFontSize(9)
        doc.text(`${param.value}${mark} ${param.unit}`, left + totalW * 0.3, yPos)

        // Reset text color
        doc.setTextColor(0, 0, 0)

        // Add range information
        doc.setFont("helvetica", "normal").setFontSize(9)
        let rangeStr = ""
        if (typeof param.range === "string") {
          rangeStr = param.range
        } else {
          const arr = param.range[genderKey as keyof typeof param.range] || []
          for (const r of arr) {
            const { lower, upper } = parseRangeKey(r.rangeKey)
            if (ageDays >= lower && ageDays <= upper) {
              rangeStr = r.rangeValue
              break
            }
          }
          if (!rangeStr && arr.length) rangeStr = arr[arr.length - 1].rangeValue
        }

        doc.text(`Normal Range: ${rangeStr}`, left + totalW * 0.6, yPos)

        yPos += 8 // Spacing for better readability
      }

      yPos += 5
    }
  }

  // PAGES 4+: All test results
  if (data.bloodtest) {
    for (const testKey in data.bloodtest) {
      const tData = data.bloodtest[testKey]
      if (tData.type === "outsource" || !tData.parameters.length) continue

      let printerName = "Unknown"
      if (tData.enteredBy) {
        printerName = tData.enteredBy
      }

      doc.addPage()
      currentPage++
      await addLetter()
      yPos = headerY(tData.reportedOn, true) // Show header on report pages

      doc.setDrawColor(0, 51, 102).setLineWidth(0.5)
      doc.line(left, yPos, w - left, yPos)
      doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0, 51, 102)
      doc.text(testKey.replace(/_/g, " ").toUpperCase(), w / 2, yPos + 8, { align: "center" })
      yPos += 10

      doc.setFontSize(10).setFillColor(0, 51, 102)
      const rowH = 7
      doc.rect(left, yPos, totalW, rowH, "F")
      doc.setTextColor(255, 255, 255)
      doc.text("PARAMETER", x1 + 2, yPos + 5)
      doc.text("VALUE", x2 + 2, yPos + 5)
      doc.text("UNIT", x3 + 2, yPos + 5)
      doc.text("RANGE", x4 + 2, yPos + 5)

      yPos += rowH + 2
      const subheads = tData.subheadings ?? []
      const subNames = subheads.flatMap((s) => s.parameterNames)
      const globals = tData.parameters.filter((p) => !subNames.includes(p.name))

      // Print global parameters
      for (const g of globals) {
        yPos = printRow(g, 0, yPos)
      }

      // Print parameters by subheading
      for (const sh of subheads) {
        const rows = tData.parameters.filter((p) => sh.parameterNames.includes(p.name))
        if (!rows.length) continue

        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 51, 102)
        doc.text(sh.title, x1, yPos + 5)
        yPos += 6

        for (const r of rows) {
          yPos = printRow(r, 0, yPos)
        }
      }

      yPos += 3
      doc.setFont("helvetica", "italic").setFontSize(7).setTextColor(0)
      doc.text("--------------------- END OF REPORT ---------------------", w / 2, yPos + 4, { align: "center" })
    }
  }

  // LAST PAGE: Terms and conditions
  doc.addPage()
  currentPage++
  await addLetter()
  yPos = headerY(undefined, false) // Don't show header on terms page

  doc.setDrawColor(0, 51, 102).setLineWidth(0.5)
  doc.line(left, yPos, w - left, yPos)
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(0, 51, 102)
  doc.text("TERMS AND CONDITIONS", w / 2, yPos + 8, { align: "center" })
  yPos += 15

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0, 0, 0)
  const termsText = [
    "1. INTERPRETATION OF RESULTS",
    "   • The test results should be interpreted by qualified healthcare professionals.",
    "   • Results should be evaluated in the context of the patient's clinical history, symptoms, and other diagnostic information.",
    "   • Reference ranges may vary based on the laboratory, methodology, and population.",
    "",
    "2. LIMITATIONS",
    "   • Laboratory tests have inherent limitations and may be affected by various factors including medication, diet, and sample collection.",
    "   • A normal result does not guarantee the absence of disease, and an abnormal result does not always indicate disease.",
    "   • Follow-up testing may be necessary to confirm or rule out certain conditions.",
    "",
    "3. CONFIDENTIALITY",
    "   • This report contains confidential medical information protected by privacy laws.",
    "   • Unauthorized disclosure, copying, or distribution is strictly prohibited.",
    "",
    "4. DISCLAIMER",
    "   • While every effort is made to ensure accuracy, the laboratory assumes no liability for any errors or omissions.",
    "   • The laboratory is not responsible for any decisions made based on these results.",
    "",
    "5. SAMPLE RETENTION",
    "   • Samples may be retained for a limited period for quality control purposes or additional testing if required.",
    "   • After this period, samples will be disposed of according to laboratory protocols.",
    "",
    "For any questions or concerns regarding this report, please contact our laboratory at the information provided.",
  ]

  for (const line of termsText) {
    if (line === "") {
      yPos += 3
    } else {
      const lines = doc.splitTextToSize(line, totalW)
      doc.text(lines, left, yPos)
      yPos += lines.length * lineH
    }

    if (yPos > h - 40) {
      doc.addPage()
      currentPage++
      await addLetter()
      yPos = 50
    }
  }

  return doc.output("blob")
}

// Function to generate and send report to WhatsApp
export const generateAndSendGraphReport = async (data: PatientData): Promise<{ success: boolean; message: string }> => {
  try {
    const pdfBlob = await generateGraphPDF(data)
    const success = await sendReportToWhatsApp(data, pdfBlob)

    if (success) {
      return {
        success: true,
        message: "Report successfully sent to WhatsApp!",
      }
    } else {
      return {
        success: false,
        message: "Failed to send report to WhatsApp. Please try again.",
      }
    }
  } catch (error) {
    console.error("Error generating and sending report:", error)
    return {
      success: false,
      message: "An error occurred while generating and sending the report.",
    }
  }
}
