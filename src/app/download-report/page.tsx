"use client"

import type React from "react"
import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { jsPDF } from "jspdf"
import { ref as dbRef, get, update } from "firebase/database"
import { database } from "../../firebase"
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"
import { generateGraphPDF, generateAndSendGraphReport } from "./graphrerport"
import letterhead from "../../../public/letterhead.png"
import firstpage from "../../../public/first.png"
import stamp from "../../../public/stamp.png"
import stamp2 from "../../../public/stamp2.png"

// -----------------------------
// Type Definitions
// -----------------------------
export interface AgeRangeItem {
  rangeKey: string
  rangeValue: string
}
export interface Parameter {
  name: string
  value: string | number
  unit: string
  range: string | { male: AgeRangeItem[]; female: AgeRangeItem[] }
  subparameters?: Parameter[]
  visibility?: string
  formula?: string
}
export interface BloodTestData {
  testId: string
  parameters: Parameter[]
  subheadings?: { title: string; parameterNames: string[] }[]
  type?: string
  reportedOn?: string
  enteredBy?: string
  descriptions?: { heading: string; content: string }[]
}
export interface PatientData {
  name: string
  age: string | number
  gender: string
  patientId: string
  createdAt: string
  contact: string
  total_day?: string | number
  sampleCollectedAt?: string
  doctorName?: string
  hospitalName?: string
  bloodtest?: Record<string, BloodTestData>
  dayType?: string
  title?: string
}

// Combined Test Group interface
interface CombinedTestGroup {
  id: string
  name: string
  tests: string[]
}

// Table interfaces for HTML parsing
interface TableCell {
  content: string
  isHeader: boolean
  colspan?: number
  rowspan?: number
  styles?: CSSStyles
}

interface TableRow {
  cells: TableCell[]
  styles?: CSSStyles
}

interface ParsedTable {
  rows: TableRow[]
  hasHeader: boolean
  styles?: CSSStyles
}

// CSS Styles interface
interface CSSStyles {
  color?: string
  backgroundColor?: string
  fontWeight?: string
  fontStyle?: string
  fontSize?: number
  textAlign?: string
  margin?: number
  padding?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: string
  width?: number
  height?: number
}

// -----------------------------
// Helper Functions
// -----------------------------
// Compress image as JPEG
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

// Convert date to local YYYY-MM-DDTHH:mm format for datetime-local
const toLocalDateTimeString = (dateInput?: string | Date) => {
  const date = dateInput ? new Date(dateInput) : new Date()
  const offset = date.getTimezoneOffset()
  const adjustedDate = new Date(date.getTime() - offset * 60 * 1000)
  return adjustedDate.toISOString().slice(0, 16)
}

// Format ISO date to 12-hour format with day/month/year
const format12Hour = (isoString: string) => {
  const date = new Date(isoString)
  let hours = date.getHours()
  const minutes = date.getMinutes()
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12
  const minutesStr = minutes < 10 ? "0" + minutes : minutes

  // Format as day/month/year
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const year = date.getFullYear()

  return `${day}/${month}/${year}, ${hours}:${minutesStr} ${ampm}`
}
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

// Generate a unique ID
const generateId = () => {
  return Math.random().toString(36).substring(2, 9)
}

// Decode HTML entities
const decodeHTMLEntities = (text: string): string => {
  const entities: Record<string, string> = {
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&quot;": '"',
    "&apos;": "'",
    "&nbsp;": " ",
    "&ge;": "≥",
    "&le;": "≤",
    "&ne;": "≠",
    "&plusmn;": "±",
    "&times;": "×",
    "&divide;": "÷",
    "&deg;": "°",
    "&micro;": "µ",
    "&alpha;": "α",
    "&beta;": "β",
    "&gamma;": "γ",
    "&delta;": "δ",
    "&omega;": "ω",
  }

  return text.replace(/&[a-zA-Z0-9#]+;/g, (entity) => {
    return entities[entity] || entity
  })
}

// Parse CSS color to RGB values
const parseColor = (color: string): [number, number, number] | null => {
  if (!color) return null

  // Handle hex colors
  if (color.startsWith("#")) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      return [
        Number.parseInt(hex[0] + hex[0], 16),
        Number.parseInt(hex[1] + hex[1], 16),
        Number.parseInt(hex[2] + hex[2], 16),
      ]
    } else if (hex.length === 6) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ]
    }
  }

  // Handle rgb() colors
  const rgbMatch = color.match(/rgb$$\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$$/)
  if (rgbMatch) {
    return [Number.parseInt(rgbMatch[1]), Number.parseInt(rgbMatch[2]), Number.parseInt(rgbMatch[3])]
  }

  // Handle named colors
  const namedColors: Record<string, [number, number, number]> = {
    red: [255, 0, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    black: [0, 0, 0],
    white: [255, 255, 255],
    gray: [128, 128, 128],
    grey: [128, 128, 128],
    yellow: [255, 255, 0],
    orange: [255, 165, 0],
    purple: [128, 0, 128],
    pink: [255, 192, 203],
    brown: [165, 42, 42],
    navy: [0, 0, 128],
    teal: [0, 128, 128],
    lime: [0, 255, 0],
    cyan: [0, 255, 255],
    magenta: [255, 0, 255],
    silver: [192, 192, 192],
    maroon: [128, 0, 0],
    olive: [128, 128, 0],
  }

  const lowerColor = color.toLowerCase()
  return namedColors[lowerColor] || null
}

// Parse CSS unit values (px, pt, em, %, etc.)
const parseCSSUnit = (value: string, baseFontSize = 9): number => {
  if (!value) return 0

  const numMatch = value.match(/^([\d.]+)(px|pt|em|rem|%)?$/i)
  if (!numMatch) return 0

  const num = Number.parseFloat(numMatch[1])
  const unit = numMatch[2]?.toLowerCase() || "px"

  switch (unit) {
    case "pt":
      return num
    case "px":
      return num * 0.75 // Convert px to pt (1px = 0.75pt)
    case "em":
    case "rem":
      return num * baseFontSize
    case "%":
      return (num / 100) * baseFontSize
    default:
      return num
  }
}

// Parse inline CSS styles
const parseInlineCSS = (styleAttr: string): CSSStyles => {
  const styles: CSSStyles = {}

  if (!styleAttr) return styles

  const declarations = styleAttr.split(";").filter(Boolean)

  declarations.forEach((declaration) => {
    const [property, value] = declaration.split(":").map((s) => s.trim())
    if (!property || !value) return

    const prop = property.toLowerCase()

    switch (prop) {
      case "color":
        styles.color = value
        break
      case "background-color":
      case "background":
        styles.backgroundColor = value
        break
      case "font-weight":
        styles.fontWeight = value
        break
      case "font-style":
        styles.fontStyle = value
        break
      case "font-size":
        styles.fontSize = parseCSSUnit(value)
        break
      case "text-align":
        styles.textAlign = value
        break
      case "margin":
        styles.margin = parseCSSUnit(value)
        break
      case "padding":
        styles.padding = parseCSSUnit(value)
        break
      case "border-width":
        styles.borderWidth = parseCSSUnit(value)
        break
      case "border-color":
        styles.borderColor = value
        break
      case "border-style":
        styles.borderStyle = value
        break
      case "border":
        // Parse shorthand border property
        const borderParts = value.split(/\s+/)
        borderParts.forEach((part) => {
          if (part.match(/^\d/)) {
            styles.borderWidth = parseCSSUnit(part)
          } else if (part.match(/^(solid|dashed|dotted)$/)) {
            styles.borderStyle = part
          } else {
            styles.borderColor = part
          }
        })
        break
      case "width":
        styles.width = parseCSSUnit(value)
        break
      case "height":
        styles.height = parseCSSUnit(value)
        break
    }
  })

  return styles
}

// Apply CSS styles to jsPDF
const applyCSSStyles = (doc: jsPDF, styles: CSSStyles, defaultFontSize = 9) => {
  // Apply font size
  if (styles.fontSize) {
    doc.setFontSize(styles.fontSize)
  }

  // Apply font weight and style
  let fontStyle = "normal"
  if (
    styles.fontWeight === "bold" ||
    styles.fontWeight === "bolder" ||
    Number.parseInt(styles.fontWeight || "400") >= 600
  ) {
    fontStyle = "bold"
  }
  if (styles.fontStyle === "italic") {
    fontStyle = fontStyle === "bold" ? "bolditalic" : "italic"
  }
  doc.setFont("helvetica", fontStyle)

  // Apply text color
  if (styles.color) {
    const color = parseColor(styles.color)
    if (color) {
      doc.setTextColor(color[0], color[1], color[2])
    }
  }
}

// Parse table from HTML element with CSS support
const parseTable = (tableElement: Element): ParsedTable => {
  const rows: TableRow[] = []
  let hasHeader = false

  // Parse table styles
  const tableStyles = parseInlineCSS(tableElement.getAttribute("style") || "")

  // Check if table has thead
  const thead = tableElement.querySelector("thead")
  const tbody = tableElement.querySelector("tbody")

  if (thead) {
    hasHeader = true
    const headerRows = thead.querySelectorAll("tr")
    headerRows.forEach((row) => {
      const rowStyles = parseInlineCSS(row.getAttribute("style") || "")
      const cells: TableCell[] = []
      const cellElements = row.querySelectorAll("th, td")
      cellElements.forEach((cell) => {
        const cellStyles = parseInlineCSS(cell.getAttribute("style") || "")
        cells.push({
          content: decodeHTMLEntities(cell.innerHTML.replace(/<br\s*\/?>/gi, "\n")),
          isHeader: true,
          colspan: Number.parseInt(cell.getAttribute("colspan") || "1"),
          rowspan: Number.parseInt(cell.getAttribute("rowspan") || "1"),
          styles: cellStyles,
        })
      })
      rows.push({ cells, styles: rowStyles })
    })
  }

  // Process tbody or direct tr elements
  const bodyRows = tbody ? tbody.querySelectorAll("tr") : tableElement.querySelectorAll("tr")
  bodyRows.forEach((row) => {
    // Skip if this row is already processed as header
    if (thead && thead.contains(row)) return

    const rowStyles = parseInlineCSS(row.getAttribute("style") || "")
    const cells: TableCell[] = []
    const cellElements = row.querySelectorAll("th, td")
    cellElements.forEach((cell) => {
      const cellStyles = parseInlineCSS(cell.getAttribute("style") || "")
      cells.push({
        content: decodeHTMLEntities(cell.innerHTML.replace(/<br\s*\/?>/gi, "\n")),
        isHeader: cell.tagName.toLowerCase() === "th",
        colspan: Number.parseInt(cell.getAttribute("colspan") || "1"),
        rowspan: Number.parseInt(cell.getAttribute("rowspan") || "1"),
        styles: cellStyles,
      })
    })
    rows.push({ cells, styles: rowStyles })
  })

  return { rows, hasHeader, styles: tableStyles }
}

// Render table in PDF with CSS support
const renderTable = (table: ParsedTable, doc: jsPDF, x: number, y: number, maxWidth: number): number => {
  if (table.rows.length === 0) return y

  const lineHeight = 5
  const defaultCellPadding = 2
  const defaultBorderWidth = 0.5

  // Calculate column widths
  const maxCols = Math.max(...table.rows.map((row) => row.cells.length))
  const colWidth = maxWidth / maxCols

  let currentY = y

  table.rows.forEach((row, rowIndex) => {
    let maxRowHeight = 0
    const cellHeights: number[] = []

    // Calculate heights for all cells in this row
    row.cells.forEach((cell, cellIndex) => {
      const cellPadding = cell.styles?.padding || defaultCellPadding
      const cellWidth = colWidth * (cell.colspan || 1) - 2 * cellPadding

      // Apply cell font styles for text measurement
      if (cell.styles) {
        applyCSSStyles(doc, cell.styles)
      } else if (cell.isHeader) {
        doc.setFont("helvetica", "bold").setFontSize(9)
      } else {
        doc.setFont("helvetica", "normal").setFontSize(8)
      }

      const lines = doc.splitTextToSize(cell.content.replace(/<[^>]*>/g, ""), cellWidth)
      const cellHeight = Math.max(lines.length * lineHeight + 2 * cellPadding, lineHeight + 2 * cellPadding)
      cellHeights.push(cellHeight)
      maxRowHeight = Math.max(maxRowHeight, cellHeight)
    })

    // Draw cells
    let currentX = x
    row.cells.forEach((cell, cellIndex) => {
      const cellWidth = colWidth * (cell.colspan || 1)
      const cellHeight = maxRowHeight
      const cellPadding = cell.styles?.padding || defaultCellPadding
      const borderWidth = cell.styles?.borderWidth || defaultBorderWidth

      // Set border properties
      doc.setLineWidth(borderWidth)
      if (cell.styles?.borderColor) {
        const borderColor = parseColor(cell.styles.borderColor)
        if (borderColor) {
          doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2])
        }
      } else {
        doc.setDrawColor(0, 0, 0)
      }

      // Set background color
      let hasFill = false
      if (cell.styles?.backgroundColor) {
        const bgColor = parseColor(cell.styles.backgroundColor)
        if (bgColor) {
          doc.setFillColor(bgColor[0], bgColor[1], bgColor[2])
          hasFill = true
        }
      } else if (cell.isHeader) {
        doc.setFillColor(240, 240, 240) // Default light gray for headers
        hasFill = true
      }

      // Draw cell rectangle
      if (hasFill) {
        doc.rect(currentX, currentY, cellWidth, cellHeight, "FD") // Fill and Draw
      } else {
        doc.rect(currentX, currentY, cellWidth, cellHeight, "D") // Draw only
      }

      // Apply text styles
      if (cell.styles) {
        applyCSSStyles(doc, cell.styles)
      } else if (cell.isHeader) {
        doc.setFont("helvetica", "bold").setFontSize(9)
        doc.setTextColor(0, 0, 0)
      } else {
        doc.setFont("helvetica", "normal").setFontSize(8)
        doc.setTextColor(0, 0, 0)
      }

      // Draw text
      const textWidth = cellWidth - 2 * cellPadding
      const lines = doc.splitTextToSize(cell.content.replace(/<[^>]*>/g, ""), textWidth)

      // Handle text alignment
      const textAlign = cell.styles?.textAlign || "left"
      lines.forEach((line: string, lineIndex: number) => {
        let textX = currentX + cellPadding
        if (textAlign === "center") {
          textX = currentX + cellWidth / 2
        } else if (textAlign === "right") {
          textX = currentX + cellWidth - cellPadding
        }

        doc.text(line, textX, currentY + cellPadding + (lineIndex + 1) * lineHeight, {
          align: textAlign as any,
        })
      })

      currentX += cellWidth
    })

    currentY += maxRowHeight
  })

  return currentY + 5 // Add some spacing after table
}

// HTML Parser for PDF rendering with CSS and table support
const parseHTMLContent = (htmlContent: string, doc: jsPDF, x: number, y: number, maxWidth: number): number => {
  // Remove HTML tags and extract text with formatting info
  const parser = new DOMParser()
  const htmlDoc = parser.parseFromString(`<div>${htmlContent}</div>`, "text/html")
  const container = htmlDoc.querySelector("div")

  let currentY = y
  const lineHeight = 5

  if (!container) {
    // Fallback to plain text
    const cleanText = decodeHTMLEntities(htmlContent.replace(/<[^>]*>/g, ""))
    const lines = doc.splitTextToSize(cleanText, maxWidth)
    doc.setFont("helvetica", "normal").setFontSize(9)
    doc.text(lines, x, currentY)
    return currentY + lines.length * lineHeight
  }

  const processNode = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = decodeHTMLEntities(node.textContent?.trim() || "")
      if (text) {
        const lines = doc.splitTextToSize(text, maxWidth)
        doc.text(lines, x, currentY)
        currentY += lines.length * lineHeight
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      const tagName = element.tagName.toLowerCase()

      // Parse inline styles
      const styles = parseInlineCSS(element.getAttribute("style") || "")

      // Handle table elements
      if (tagName === "table") {
        const table = parseTable(element)
        currentY = renderTable(table, doc, x, currentY, maxWidth)
        return
      }

      // Apply CSS styles first
      if (Object.keys(styles).length > 0) {
        applyCSSStyles(doc, styles)
      } else {
        // Set font based on HTML tag (fallback)
        switch (tagName) {
          case "h1":
            doc.setFont("helvetica", "bold").setFontSize(14)
            currentY += 2 // Extra spacing before heading
            break
          case "h2":
            doc.setFont("helvetica", "bold").setFontSize(12)
            currentY += 2
            break
          case "h3":
            doc.setFont("helvetica", "bold").setFontSize(11)
            currentY += 1
            break
          case "h4":
          case "h5":
          case "h6":
            doc.setFont("helvetica", "bold").setFontSize(10)
            currentY += 1
            break
          case "strong":
          case "b":
            doc.setFont("helvetica", "bold").setFontSize(9)
            break
          case "em":
          case "i":
            doc.setFont("helvetica", "italic").setFontSize(9)
            break
          case "u":
            doc.setFont("helvetica", "normal").setFontSize(9)
            // Note: jsPDF doesn't support underline directly
            break
          case "p":
            doc.setFont("helvetica", "normal").setFontSize(9)
            if (currentY > y) currentY += 2 // Add spacing between paragraphs
            break
          case "br":
            currentY += lineHeight
            return
          case "li":
            doc.setFont("helvetica", "normal").setFontSize(9)
            // Add bullet point
            doc.text("• ", x, currentY)
            const bulletWidth = doc.getTextWidth("• ")
            const listText = decodeHTMLEntities(element.textContent?.trim() || "")
            const listLines = doc.splitTextToSize(listText, maxWidth - bulletWidth)
            doc.text(listLines, x + bulletWidth, currentY)
            currentY += listLines.length * lineHeight
            return
          case "ul":
          case "ol":
            currentY += 1 // Add spacing before list
            break
          case "thead":
          case "tbody":
          case "tr":
          case "th":
          case "td":
            // These are handled by the table parser
            return
          default:
            doc.setFont("helvetica", "normal").setFontSize(9)
        }
      }

      // Handle special elements with CSS support
      if (tagName === "div" || tagName === "span") {
        // Apply background color if specified
        if (styles.backgroundColor) {
          const bgColor = parseColor(styles.backgroundColor)
          if (bgColor) {
            // Draw background rectangle
            doc.setFillColor(bgColor[0], bgColor[1], bgColor[2])
            const textHeight = lineHeight * 1.2
            doc.rect(x, currentY - textHeight + 2, maxWidth, textHeight, "F")
          }
        }
      }

      // Process child nodes
      for (let i = 0; i < node.childNodes.length; i++) {
        processNode(node.childNodes[i])
      }

      // Add spacing after certain elements
      if (["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "div"].includes(tagName)) {
        currentY += styles.margin || 1
      }

      // Reset font after processing element
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0, 0, 0)
    }
  }

  // Process all child nodes
  for (let i = 0; i < container.childNodes.length; i++) {
    processNode(container.childNodes[i])
  }

  return currentY
}

// -----------------------------
// Component
// -----------------------------
export default function DownloadReportPage() {
  return (
    <Suspense fallback={<div>Loading Report...</div>}>
      <DownloadReport />
    </Suspense>
  )
}

function DownloadReport() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const patientId = searchParams.get("patientId")

  const [patientData, setPatientData] = useState<PatientData | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isGeneratingGraph, setIsGeneratingGraph] = useState(false)
  const [isSendingGraphReport, setIsSendingGraphReport] = useState(false)
  const [selectedTests, setSelectedTests] = useState<string[]>([])

  // State for combined test groups
  const [combinedGroups, setCombinedGroups] = useState<CombinedTestGroup[]>([])
  const [showCombineInterface, setShowCombineInterface] = useState(false)
  const [draggedTest, setDraggedTest] = useState<string | null>(null)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)

  // State for updating reportedOn time
  const [updateTimeModal, setUpdateTimeModal] = useState<{
    isOpen: boolean
    testKey: string
    currentTime: string
  }>({
    isOpen: false,
    testKey: "",
    currentTime: "",
  })

  // State for updating sampleCollectedAt time
  const [updateSampleTimeModal, setUpdateSampleTimeModal] = useState<{
    isOpen: boolean
    currentTime: string
  }>({
    isOpen: false,
    currentTime: "",
  })

  const [updateRegistrationTimeModal, setUpdateRegistrationTimeModal] = useState({
    isOpen: false,
    currentTime: "",
  })

  // Fetch patient data
  useEffect(() => {
    if (!patientId) return
    ;(async () => {
      try {
        const snap = await get(dbRef(database, `patients/${patientId}`))
        if (!snap.exists()) return alert("Patient not found")

        const data = snap.val() as PatientData
        if (!data.bloodtest) return alert("No report found.")

        // 1) fetch the shared descriptions for each test from /bloodTests/<testKey>/descriptions
        await Promise.all(
          Object.keys(data.bloodtest).map(async (testKey) => {
            const rec = data.bloodtest![testKey]

            const defSnap = await get(dbRef(database, `bloodTests/${rec.testId}/descriptions`))
            if (defSnap.exists()) {
              const raw = defSnap.val()
              const arr = Array.isArray(raw) ? raw : Object.values(raw)
              rec.descriptions = arr as { heading: string; content: string }[]
            }
          }),
        )

        // 2) then filter out hidden parameters as before
        data.bloodtest = hideInvisible(data)

        // 3) finally set into state
        setPatientData(data)
      } catch (e) {
        console.error(e)
        alert("Error fetching patient.")
      }
    })()
  }, [patientId])

  // Initialize selected tests
  useEffect(() => {
    if (patientData?.bloodtest) {
      setSelectedTests(Object.keys(patientData.bloodtest))
    }
  }, [patientData])

  // Hide invisible parameters
  const hideInvisible = (d: PatientData): Record<string, BloodTestData> => {
    const out: Record<string, BloodTestData> = {}
    if (!d.bloodtest) return out

    for (const k in d.bloodtest) {
      const t = d.bloodtest[k]
      if (t.type === "outsource") continue

      const keptParams = Array.isArray(t.parameters)
        ? t.parameters
            .filter((p) => p.visibility !== "hidden")
            .map((p) => ({
              ...p,
              subparameters: Array.isArray(p.subparameters)
                ? p.subparameters.filter((sp) => sp.visibility !== "hidden")
                : [],
            }))
        : []

      out[k] = {
        ...t,
        parameters: keptParams,
        subheadings: t.subheadings,
        reportedOn: t.reportedOn,
        // preserve fetched descriptions
        descriptions: t.descriptions,
      }
    }

    return out
  }

  // Update reportedOn time for a test
  const updateReportedOnTime = (testKey: string) => {
    const test = patientData?.bloodtest?.[testKey]
    if (!test) return

    const currentTime = test.reportedOn ? toLocalDateTimeString(test.reportedOn) : toLocalDateTimeString()

    setUpdateTimeModal({
      isOpen: true,
      testKey,
      currentTime,
    })
  }

  // Save updated reportedOn time
  const saveUpdatedTime = async () => {
    if (!patientData || !updateTimeModal.testKey) return

    try {
      const testRef = dbRef(database, `patients/${patientId}/bloodtest/${updateTimeModal.testKey}`)
      const newReportedOn = new Date(updateTimeModal.currentTime).toISOString()

      await update(testRef, { reportedOn: newReportedOn })

      setPatientData((prev) => {
        if (!prev || !prev.bloodtest) return prev
        return {
          ...prev,
          bloodtest: {
            ...prev.bloodtest,
            [updateTimeModal.testKey]: {
              ...prev.bloodtest[updateTimeModal.testKey],
              reportedOn: newReportedOn,
            },
          },
        }
      })

      setUpdateTimeModal((prev) => ({ ...prev, isOpen: false }))
      alert("Report time updated successfully!")
    } catch (error) {
      console.error("Error updating report time:", error)
      alert("Failed to update report time.")
    }
  }

  // Open modal to update sampleCollectedAt time
  const updateSampleCollectedTime = () => {
    const currentTime = patientData?.sampleCollectedAt
      ? toLocalDateTimeString(patientData.sampleCollectedAt)
      : toLocalDateTimeString()

    setUpdateSampleTimeModal({
      isOpen: true,
      currentTime,
    })
  }

  // Open modal to update createdAt (Registration On)
  const updateRegistrationTime = () => {
    const currentTime = patientData?.createdAt ? toLocalDateTimeString(patientData.createdAt) : toLocalDateTimeString()

    setUpdateRegistrationTimeModal({
      isOpen: true,
      currentTime,
    })
  }

  // Save updated sampleCollectedAt time
  const saveUpdatedSampleTime = async () => {
    if (!patientData) return

    try {
      const patientRef = dbRef(database, `patients/${patientId}`)
      const newSampleAt = new Date(updateSampleTimeModal.currentTime).toISOString()
      await update(patientRef, { sampleCollectedAt: newSampleAt })
      setPatientData((prev) => (prev ? { ...prev, sampleCollectedAt: newSampleAt } : prev))
      setUpdateSampleTimeModal((prev) => ({ ...prev, isOpen: false }))
    } catch (error) {
      console.error("Error updating sample collected time:", error)
      alert("Failed to update sample collected time.")
    }
  }

  // Save updated registration time (createdAt)
  const saveUpdatedRegistrationTime = async () => {
    if (!patientData) return

    try {
      const patientRef = dbRef(database, `patients/${patientId}`)
      const newCreatedAt = new Date(updateRegistrationTimeModal.currentTime).toISOString()

      await update(patientRef, { createdAt: newCreatedAt })

      setPatientData((prev) => (prev ? { ...prev, createdAt: newCreatedAt } : prev))

      setUpdateRegistrationTimeModal((prev) => ({ ...prev, isOpen: false }))
    } catch (error) {
      console.error("Error updating registration time:", error)
      alert("Failed to update registration time.")
    }
  }

  // Add a new combined test group
  const addCombinedGroup = () => {
    const newGroup: CombinedTestGroup = {
      id: generateId(),
      name: `Combined Group ${combinedGroups.length + 1}`,
      tests: [],
    }
    setCombinedGroups([...combinedGroups, newGroup])
  }

  // Remove a combined test group
  const removeCombinedGroup = (groupId: string) => {
    setCombinedGroups(combinedGroups.filter((group) => group.id !== groupId))
  }

  // Update group name
  const updateGroupName = (groupId: string, newName: string) => {
    setCombinedGroups(combinedGroups.map((group) => (group.id === groupId ? { ...group, name: newName } : group)))
  }

  // Handle drag start
  const handleDragStart = (testKey: string) => {
    setDraggedTest(testKey)
  }

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault()
    setActiveGroupId(groupId)
  }

  // Handle drag leave
  const handleDragLeave = () => {
    setActiveGroupId(null)
  }

  // Handle drop
  const handleDrop = (e: React.DragEvent, groupId: string) => {
    e.preventDefault()
    if (!draggedTest) return

    const updatedGroups = combinedGroups.map((group) => {
      if (group.id === groupId) {
        if (!group.tests.includes(draggedTest)) {
          return {
            ...group,
            tests: [...group.tests, draggedTest],
          }
        }
      }
      return group
    })

    setCombinedGroups(updatedGroups)
    setDraggedTest(null)
    setActiveGroupId(null)
  }

  // Remove a test from a group
  const removeTestFromGroup = (groupId: string, testKey: string) => {
    setCombinedGroups(
      combinedGroups.map((group) =>
        group.id === groupId ? { ...group, tests: group.tests.filter((t) => t !== testKey) } : group,
      ),
    )
  }

  // Generate PDF report
  const generatePDFReport = async (
    data: PatientData,
    includeLetterhead: boolean,
    skipCover: boolean,
    combinedGroups: CombinedTestGroup[] = [],
  ) => {
    const doc = new jsPDF("p", "mm", "a4")
    let printedBy = "Unknown"
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

    const addCover = async () => {
      if (skipCover) return
      try {
        const img = await loadImageAsCompressedJPEG(firstpage.src, 0.5)
        doc.addImage(img, "JPEG", 0, 0, w, h)
      } catch (e) {
        console.error(e)
      }
    }

    const addLetter = async () => {
      if (!includeLetterhead) return
      try {
        const img = await loadImageAsCompressedJPEG(letterhead.src, 0.5)
        doc.addImage(img, "JPEG", 0, 0, w, h)
      } catch (e) {
        console.error(e)
      }
    }

    const addStamp = async () => {
      const targetWidth = 40; // mm, fixed width for both stamps
    
      try {
        // Load image elements to get their natural sizes
        const imgElem1 = new window.Image();
        imgElem1.src = stamp2.src;
        await new Promise((res) => (imgElem1.onload = res));
        const aspect1 = imgElem1.naturalHeight / imgElem1.naturalWidth;
        const sh1 = targetWidth * aspect1;
    
        const imgElem2 = new window.Image();
        imgElem2.src = stamp.src;
        await new Promise((res) => (imgElem2.onload = res));
        const aspect2 = imgElem2.naturalHeight / imgElem2.naturalWidth;
        const sh2 = targetWidth * aspect2;
    
        // Compressed images
        const img1 = await loadImageAsCompressedJPEG(stamp2.src, 0.5);
        const img2 = await loadImageAsCompressedJPEG(stamp.src, 0.5);
    
        // Define BOTTOM Y position for stamps (e.g., 23mm from bottom)
        const bottomMargin = 23; // mm
        const sy1 = h - bottomMargin - sh1; // stamp2 (right), aligns bottom at (h - bottomMargin)
        const sy2 = h - bottomMargin - sh2; // stamp (centered), aligns bottom at (h - bottomMargin)
    
        const sx = w - left - targetWidth; // right-aligned
        const cx = (w - targetWidth) / 2; // centered
    
        // Draw both images
        doc.addImage(img1, "JPEG", sx, sy1, targetWidth, sh1); // Right
        doc.addImage(img2, "JPEG", cx, sy2, targetWidth, sh2); // Centered
    
        // "Printed by" text: 5mm above the bottom margin
        doc.setFont("helvetica", "normal").setFontSize(10);
        doc.text(`Printed by ${printedBy}`, left, h - bottomMargin - 5);
      } catch (e) {
        console.error("Stamp load error:", e);
      }
    };
    
    const headerY = (reportedOnRaw?: string) => {
      const gap = 7
      let y = 50
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
      return y
    }

    let yPos = 0

    const printRow = (p: Parameter, indent = 0) => {
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

      // Determine if value indicates low/high via "<" or ">"
      let mark = ""
      const rawValue = String(p.value).trim()
      if (rawValue.startsWith("<")) {
        mark = " L"
      } else if (rawValue.startsWith(">")) {
        mark = " H"
      } else {
        // Fallback numeric comparison if not prefixed by < or >
        const numRange = parseNumericRangeString(rangeStr)
        const numVal = Number.parseFloat(rawValue)
        if (numRange && !isNaN(numVal)) {
          if (numVal < numRange.lower) mark = " L"
          else if (numVal > numRange.upper) mark = " H"
        }
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
        p.subparameters.forEach((sp) => printRow({ ...sp }, indent + 2))
      }
    }

    const printTest = (testKey: string, tData: BloodTestData) => {
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

      globals.forEach((g) => printRow(g))
      subheads.forEach((sh) => {
        const rows = tData.parameters.filter((p) => sh.parameterNames.includes(p.name))
        if (!rows.length) return
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 51, 102)
        doc.text(sh.title, x1, yPos + 5)
        yPos += 6
        rows.forEach((r) => printRow(r))
      })
      yPos += 3

      // Updated descriptions rendering with HTML, CSS, and table support
      if (Array.isArray(tData.descriptions) && tData.descriptions.length) {
        yPos += 4

        tData.descriptions.forEach(({ heading, content }) => {
          // Render heading
          doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0, 51, 102)
          doc.text(heading, x1, yPos + lineH)
          yPos += lineH + 2

          // Render HTML content with CSS and table support
          doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(0, 0, 0)
          yPos = parseHTMLContent(content, doc, x1, yPos, totalW)
          yPos += 4 // Add some spacing after each description
        })
      }
    }

    await addCover()
    if (!data.bloodtest) return doc.output("blob")

    let first = true

    // Process combined groups first (without printing the group heading)
    for (const group of combinedGroups) {
      if (group.tests.length === 0) continue

      const testsToInclude = group.tests.filter(
        (testKey) => selectedTests.includes(testKey) && data.bloodtest![testKey],
      )

      if (testsToInclude.length === 0) continue

      const firstTestKey = testsToInclude[0]
      const firstTest = data.bloodtest[firstTestKey]
      let printerName = "Unknown"

      if (firstTest.enteredBy) {
        try {
          const userSnap = await get(dbRef(database, `users/${firstTest.enteredBy}`))
          if (userSnap.exists()) {
            const usr = userSnap.val() as { name?: string }
            printerName = usr.name || firstTest.enteredBy
          } else {
            printerName = firstTest.enteredBy
          }
        } catch (error) {
          console.error("Error fetching user data:", error)
          printerName = firstTest.enteredBy
        }
      }
      printedBy = printerName

      if (skipCover) {
        if (!first) doc.addPage()
      } else {
        doc.addPage()
      }
      first = false

      await addLetter()
      yPos = headerY(firstTest.reportedOn)

      for (const testKey of testsToInclude) {
        const tData = data.bloodtest[testKey]
        printTest(testKey, tData)
        yPos += 10
      }

      doc.setFont("helvetica", "italic").setFontSize(7).setTextColor(0)
      doc.text("--------------------- END OF REPORT ---------------------", w / 2, yPos + 4, { align: "center" })
      yPos += 10
    }

    // Process remaining individual tests (that aren't in combined groups)
    const combinedTestKeys = combinedGroups.flatMap((group) => group.tests)
    const remainingTests = Object.keys(data.bloodtest).filter(
      (key) => selectedTests.includes(key) && !combinedTestKeys.includes(key),
    )

    for (const testKey of remainingTests) {
      const tData = data.bloodtest[testKey]
      if (tData.type === "outsource" || !tData.parameters.length) continue

      let printerName = "Unknown"
      if (tData.enteredBy) {
        try {
          const userSnap = await get(dbRef(database, `users/${tData.enteredBy}`))
          if (userSnap.exists()) {
            const usr = userSnap.val() as { name?: string }
            printerName = usr.name || tData.enteredBy
          } else {
            console.log(`User not found in database, using enteredBy value: ${tData.enteredBy}`)
            printerName = tData.enteredBy
          }
        } catch (error) {
          console.error("Error fetching user data:", error)
          printerName = tData.enteredBy
        }
      }
      printedBy = printerName
      if (skipCover) {
        if (!first) doc.addPage()
      } else {
        doc.addPage()
      }
      first = false

      await addLetter()
      yPos = headerY(tData.reportedOn)

      printTest(testKey, tData)

      doc.setFont("helvetica", "italic").setFontSize(7).setTextColor(0)
      doc.text("--------------------- END OF REPORT ---------------------", w / 2, yPos + 4, { align: "center" })
      yPos += 10
    }

    const startPage = skipCover ? 1 : 2
    const pages = doc.getNumberOfPages()
    for (let i = startPage; i <= pages; i++) {
      doc.setPage(i)
      await addStamp()
    }

    return doc.output("blob")
  }

  // Action handlers
  const downloadWithLetter = async () => {
    if (!patientData) return
    const filteredData: PatientData = {
      ...patientData,
      bloodtest: Object.fromEntries(
        Object.entries(patientData.bloodtest!).filter(([key]) => selectedTests.includes(key)),
      ),
    }
    const blob = await generatePDFReport(filteredData, true, true, combinedGroups)
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${filteredData.name}_with_letterhead.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadNoLetter = async () => {
    if (!patientData) return
    const filteredData: PatientData = {
      ...patientData,
      bloodtest: Object.fromEntries(
        Object.entries(patientData.bloodtest!).filter(([key]) => selectedTests.includes(key)),
      ),
    }
    const blob = await generatePDFReport(filteredData, false, true, combinedGroups)
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${filteredData.name}_no_letterhead.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const preview = async (withLetter: boolean) => {
    if (!patientData) return
    const filteredData: PatientData = {
      ...patientData,
      bloodtest: Object.fromEntries(
        Object.entries(patientData.bloodtest ?? {}).filter(([key]) => selectedTests.includes(key)),
      ),
    }
    try {
      const blob = await generatePDFReport(filteredData, withLetter, true, combinedGroups)
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      console.error("Preview error:", err)
      alert("Failed to generate preview.")
    }
  }

  const sendWhatsApp = async () => {
    if (!patientData) return
    try {
      setIsSending(true)
      const filteredData: PatientData = {
        ...patientData,
        bloodtest: Object.fromEntries(
          Object.entries(patientData.bloodtest ?? {}).filter(([key]) => selectedTests.includes(key)),
        ),
      }
      const blob = await generatePDFReport(filteredData, true, false, combinedGroups)
      const store = getStorage()
      const filename = `reports/${filteredData.name}.pdf`
      const snap = await uploadBytes(storageRef(store, filename), blob)
      const url = await getDownloadURL(snap.ref)

      const payload = {
        token: "99583991573",
        number: "91" + filteredData.contact,
        imageUrl: url,
        caption: `Dear ${filteredData.name},\n\nYour blood test report is now available:\n${url}\n\nRegards,\nYour Lab Team`,
      }

      const res = await fetch("https://a.infispark.in/send-image-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Unknown error" }))
        console.error("WhatsApp API Error:", errorData)
        alert(`Failed to send via WhatsApp. Status: ${res.status}`)
      } else {
        alert("Report sent on WhatsApp!")
      }
    } catch (e) {
      console.error("Error sending WhatsApp message:", e)
      alert("Error sending WhatsApp message.")
    } finally {
      setIsSending(false)
    }
  }

  const downloadGraphReport = async () => {
    if (!patientData) return
    setIsGeneratingGraph(true)
    try {
      const blob = await generateGraphPDF(patientData)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${patientData.name}_report.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error generating report:", error)
      alert("Failed to generate report.")
    } finally {
      setIsGeneratingGraph(false)
    }
  }

  const sendGraphReportWhatsApp = async () => {
    if (!patientData) return
    setIsSendingGraphReport(true)
    try {
      const result = await generateAndSendGraphReport(patientData)
      if (result.success) {
        alert(result.message)
      } else {
        alert(result.message)
      }
    } catch (error) {
      console.error("Error sending report via WhatsApp:", error)
      alert("Failed to send report via WhatsApp.")
    } finally {
      setIsSendingGraphReport(false)
    }
  }

  // UI
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full space-y-4">
        {patientData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Report Actions Card */}
            <div className="bg-white rounded-xl shadow-lg p-8 space-y-4 col-span-1 md:col-span-2">
              <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">Report Ready</h2>
              {/* Registration On Display and Update Button */}
              <div className="p-4 bg-gray-100 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Registration On:</p>
                    <p className="text-sm text-gray-600">
                      {patientData.createdAt ? format12Hour(patientData.createdAt) : "Not set"}
                    </p>
                  </div>
                  <button
                    onClick={updateRegistrationTime}
                    className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Update Time
                  </button>
                </div>
              </div>

              {/* Sample Collected On Display and Update Button */}
              <div className="p-4 bg-gray-100 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Sample Collected On:</p>
                    <p className="text-sm text-gray-600">
                      {patientData.sampleCollectedAt ? format12Hour(patientData.sampleCollectedAt) : "Not set"}
                    </p>
                  </div>
                  <button
                    onClick={updateSampleCollectedTime}
                    className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Update Time
                  </button>
                </div>
              </div>

              {/* Existing Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={downloadWithLetter}
                  className="w-full flex items-center justify-center space-x-3 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  <span>Download PDF (Letterhead)</span>
                </button>

                <button
                  onClick={downloadNoLetter}
                  className="w-full flex items-center justify-center space-x-3 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                    />
                  </svg>
                  <span>Download PDF (No letterhead)</span>
                </button>
              </div>

              {/* Report Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={downloadGraphReport}
                  disabled={isGeneratingGraph}
                  className={`w-full flex items-center justify-center space-x-3 px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out ${
                    isGeneratingGraph ? "bg-gray-400 cursor-not-allowed" : "bg-teal-600 hover:bg-teal-700 text-white"
                  }`}
                >
                  {isGeneratingGraph ? (
                    <>
                      <svg
                        className="animate-spin h-5 w-5 mr-3 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        ></path>
                      </svg>
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                      <span>Download Ai Graph Report</span>
                    </>
                  )}
                </button>

                <button
                  onClick={sendGraphReportWhatsApp}
                  disabled={isSendingGraphReport}
                  className={`w-full flex items-center justify-center space-x-3 px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out ${
                    isSendingGraphReport
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-[#25D366] hover:bg-[#128C7E] text-white"
                  }`}
                >
                  {isSendingGraphReport ? (
                    <>
                      <svg
                        className="animate-spin h-5 w-5 mr-3 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        ></path>
                      </svg>
                      <span>Sending Report…</span>
                    </>
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c0-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
                      </svg>
                      <span>Send Graph Report via WhatsApp under Maintenance</span>
                    </>
                  )}
                </button>
              </div>

              {/* Preview Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => preview(true)}
                  className="w-full flex items-center justify-center space-x-3 bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  <span>Preview (Letterhead)</span>
                </button>

                <button
                  onClick={() => preview(false)}
                  className="w-full flex items-center justify-center space-x-3 bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                  <span>Preview (No letterhead)</span>
                </button>
              </div>

              {/* WhatsApp Button */}
              <button
                onClick={sendWhatsApp}
                disabled={isSending}
                className={`w-full flex items-center justify-center space-x-3 px-6 py-3 rounded-xl font-medium transition duration-150 ease-in-out ${
                  isSending ? "bg-gray-400 cursor-not-allowed" : "bg-[#25D366] hover:bg-[#128C7E] text-white"
                }`}
              >
                {isSending ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5 mr-3 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      ></path>
                    </svg>
                    <span>Sending…</span>
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c0-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
                    </svg>
                    <span>Send via WhatsApp</span>
                  </>
                )}
              </button>

              <p className="text-center text-sm text-gray-500 pt-2">Report generated for {patientData.name}</p>
            </div>

            {/* Test Selection Card */}
            <div className="bg-white rounded-xl shadow-lg p-6 col-span-1 md:col-span-2">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Select Tests to Include</h3>
                <button
                  onClick={() => setShowCombineInterface(!showCombineInterface)}
                  className="flex items-center text-sm font-medium px-4 py-2 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                >
                  {showCombineInterface ? (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 mr-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Hide Combine Interface
                    </>
                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 mr-1"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                        />
                      </svg>
                      Combine Tests
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {patientData?.bloodtest &&
                  Object.keys(patientData.bloodtest).map((testKey) => {
                    const test = patientData.bloodtest![testKey]
                    const reportedOn = test.reportedOn ? new Date(test.reportedOn) : null
                    const isStoolTest = testKey === "stool_occult_blood"

                    return (
                      <div
                        key={testKey}
                        className={`flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 ${
                          isStoolTest ? "border-amber-300 bg-amber-50 hover:bg-amber-100" : ""
                        }`}
                        draggable={showCombineInterface}
                        onDragStart={() => handleDragStart(testKey)}
                      >
                        <div className="flex items-start space-x-3">
                          <input
                            type="checkbox"
                            id={`test-${testKey}`}
                            className="form-checkbox h-5 w-5 text-indigo-600 mt-1"
                            checked={selectedTests.includes(testKey)}
                            onChange={() => {
                              setSelectedTests((prev) =>
                                prev.includes(testKey) ? prev.filter((k) => k !== testKey) : [...prev, testKey],
                              )
                            }}
                          />
                          <div>
                            <label htmlFor={`test-${testKey}`} className="font-medium cursor-pointer">
                              {testKey.replace(/_/g, " ").toUpperCase()}
                              {isStoolTest && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                  Stool Test
                                </span>
                              )}
                            </label>
                            {reportedOn && (
                              <p className="text-sm text-gray-500">
                                Reported on: {reportedOn.toLocaleString()}
                                {isStoolTest && test.enteredBy && (
                                  <span className="ml-2 text-xs text-gray-500">by {test.enteredBy}</span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => updateReportedOnTime(testKey)}
                          className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 mr-1"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                          Update Time
                        </button>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Combined Tests Interface */}
            {showCombineInterface && (
              <div className="bg-white rounded-xl shadow-lg p-6 col-span-1 md:col-span-2">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Combine Tests</h3>
                  <button
                    onClick={addCombinedGroup}
                    className="flex items-center text-sm font-medium px-4 py-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                    Add Group
                  </button>
                </div>

                <div className="space-y-4">
                  {combinedGroups.length === 0 ? (
                    <div className="text-center p-8 border-2 border-dashed border-gray-300 rounded-lg">
                      <p className="text-gray-500">Click Add Group to create a new combined test group</p>
                      <p className="text-sm text-gray-400 mt-2">
                        You can drag and drop tests into groups to combine them in the report
                      </p>
                    </div>
                  ) : (
                    combinedGroups.map((group) => (
                      <div
                        key={group.id}
                        className={`p-4 border-2 ${
                          activeGroupId === group.id ? "border-purple-400 bg-purple-50" : "border-gray-200"
                        } rounded-lg`}
                        onDragOver={(e) => handleDragOver(e, group.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, group.id)}
                      >
                        <div className="flex justify-between items-center mb-3">
                          <div className="flex-1 mr-2">
                            <input
                              type="text"
                              value={group.name}
                              onChange={(e) => updateGroupName(group.id, e.target.value)}
                              className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                              placeholder="Group Name"
                            />
                          </div>
                          <button
                            onClick={() => removeCombinedGroup(group.id)}
                            className="p-1 text-red-500 hover:text-red-700 rounded-full hover:bg-red-50"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>

                        <div className="min-h-[100px] p-3 bg-gray-50 rounded-lg">
                          {group.tests.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                              Drag tests here to combine them
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {group.tests.map((testKey) => (
                                <div
                                  key={testKey}
                                  className="flex justify-between items-center p-2 bg-white rounded border"
                                >
                                  <span className="text-sm font-medium">
                                    {testKey.replace(/_/g, " ").toUpperCase()}
                                  </span>
                                  <button
                                    onClick={() => removeTestFromGroup(group.id, testKey)}
                                    className="text-gray-500 hover:text-red-500"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      className="h-4 w-4"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-2 text-xs text-gray-500">
                          <span className="font-medium">Tip:</span> Drag tests from the list above to add them to this
                          group
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {combinedGroups.length > 0 && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <h4 className="font-medium text-yellow-800 mb-1">How Combined Tests Work</h4>
                    <p className="text-sm text-yellow-700">
                      Tests in the same group will be printed sequentially on the same page in the PDF report, each with
                      its own heading and values.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center bg-white p-8 rounded-xl shadow-lg">
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
              <span className="text-gray-600">Fetching patient data…</span>
            </div>
            <p className="mt-4 text-sm text-gray-500">This may take a few moments.</p>
          </div>
        )}

        {/* Update Registration Time Modal */}
        {updateRegistrationTimeModal.isOpen && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 relative">
              <button
                onClick={() => setUpdateRegistrationTimeModal((p) => ({ ...p, isOpen: false }))}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
              <h3 className="text-lg font-semibold mb-4">Update Registration Time for {patientData?.name}</h3>
              <label className="block text-sm font-medium text-gray-700 mb-2">Registration Date & Time</label>
              <input
                type="datetime-local"
                value={updateRegistrationTimeModal.currentTime}
                onChange={(e) => setUpdateRegistrationTimeModal((p) => ({ ...p, currentTime: e.target.value }))}
                max={toLocalDateTimeString()}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-2 text-sm text-gray-600">
                Selected:{" "}
                {updateRegistrationTimeModal.currentTime ? format12Hour(updateRegistrationTimeModal.currentTime) : ""}
              </p>
              <div className="mt-6 flex justify-end space-x-2">
                <button
                  onClick={() => setUpdateRegistrationTimeModal((p) => ({ ...p, isOpen: false }))}
                  className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={saveUpdatedRegistrationTime}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Update ReportedOn Time Modal */}
        {updateTimeModal.isOpen && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 relative">
              <button
                onClick={() => setUpdateTimeModal((prev) => ({ ...prev, isOpen: false }))}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
              <h3 className="text-lg font-semibold mb-4">
                Update Report Time for {updateTimeModal.testKey.replace(/_/g, " ").toUpperCase()}
              </h3>
              <label className="block text-sm font-medium text-gray-700 mb-2">Report Date & Time</label>
              <input
                type="datetime-local"
                value={updateTimeModal.currentTime}
                onChange={(e) => setUpdateTimeModal((prev) => ({ ...prev, currentTime: e.target.value }))}
                max={toLocalDateTimeString()}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-2 text-sm text-gray-600">
                Selected: {updateTimeModal.currentTime ? format12Hour(updateTimeModal.currentTime) : ""}
              </p>
              <div className="mt-6 flex justify-end space-x-2">
                <button
                  onClick={() => setUpdateTimeModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={saveUpdatedTime}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Update Sample Collected Time Modal */}
        {updateSampleTimeModal.isOpen && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 relative">
              <button
                onClick={() => setUpdateSampleTimeModal((prev) => ({ ...prev, isOpen: false }))}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
              <h3 className="text-lg font-semibold mb-4">Update Sample Collected Time for {patientData?.name}</h3>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sample Collected Date & Time</label>
              <input
                type="datetime-local"
                value={updateSampleTimeModal.currentTime}
                onChange={(e) => setUpdateSampleTimeModal((prev) => ({ ...prev, currentTime: e.target.value }))}
                max={toLocalDateTimeString()}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-2 text-sm text-gray-600">
                Selected: {updateSampleTimeModal.currentTime ? format12Hour(updateSampleTimeModal.currentTime) : ""}
              </p>
              <div className="mt-6 flex justify-end space-x-2">
                <button
                  onClick={() => setUpdateSampleTimeModal((prev) => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={saveUpdatedSampleTime}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
