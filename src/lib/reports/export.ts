import { buildReportFilename } from "@/lib/reports/format";
import type { ReportExportConfig } from "@/types/reports";
export type { ReportExportConfig } from "@/types/reports";

type CellValue = string | number | boolean | null | undefined;
type WorkbookSheet = { name: string; rows: CellValue[][] };
type WorkbookExportConfig = { sheets: WorkbookSheet[]; filename?: string };

const textEncoder = new TextEncoder();

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const csvEscape = (value: CellValue) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const normalizeCellValue = (value: CellValue) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const buildCsvContent = (rows: CellValue[][]) => {
  const lines = rows.map((row) => row.map(csvEscape).join(","));
  return `\uFEFF${lines.join("\n")}`;
};

const columnRef = (index: number) => {
  let value = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
};

const buildWorksheetXml = (rows: CellValue[][]) => {
  const xmlRows = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const normalized = normalizeCellValue(value);
          if (normalized === "") {
            return "";
          }

          const ref = `${columnRef(columnIndex)}${rowIndex + 1}`;
          if (typeof normalized === "number" && Number.isFinite(normalized)) {
            return `<c r="${ref}"><v>${normalized}</v></c>`;
          }

          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(String(normalized))}</t></is></c>`;
        })
        .filter(Boolean)
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${xmlRows}</sheetData>
</worksheet>`;
};

const uint16 = (value: number) => new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
const uint32 = (value: number) =>
  new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);

const concatUint8 = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = crcTable[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const getDosDateTime = () => {
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { dosTime, dosDate };
};

const buildZip = (files: Array<{ name: string; data: Uint8Array }>) => {
  const { dosTime, dosDate } = getDosDateTime();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = textEncoder.encode(file.name);
    const dataBytes = file.data;
    const checksum = crc32(dataBytes);

    const localHeader = concatUint8([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(dataBytes.length),
      uint32(dataBytes.length),
      uint16(nameBytes.length),
      uint16(0),
      nameBytes,
      dataBytes,
    ]);

    localChunks.push(localHeader);

    const centralHeader = concatUint8([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(dataBytes.length),
      uint32(dataBytes.length),
      uint16(nameBytes.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBytes,
    ]);

    centralChunks.push(centralHeader);
    offset += localHeader.length;
  });

  const centralDirectory = concatUint8(centralChunks);
  const localDirectory = concatUint8(localChunks);

  const endOfCentralDirectory = concatUint8([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(localDirectory.length),
    uint16(0),
  ]);

  return concatUint8([localDirectory, centralDirectory, endOfCentralDirectory]);
};

const buildWorkbook = (sheets: Array<{ name: string; rows: CellValue[][] }>) => {
  const safeSheets = sheets.map((sheet) => ({
    name: xmlEscape(sheet.name.slice(0, 31)),
    rows: sheet.rows,
  }));

  const sheetOverrides = safeSheets
    .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("\n  ");

  const workbookSheetXml = safeSheets
    .map((sheet, index) => `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("\n    ");

  const workbookRels = safeSheets
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join("\n  ");

  const files = [
    {
      name: "[Content_Types].xml",
      data: textEncoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheetOverrides}
</Types>`),
    },
    {
      name: "_rels/.rels",
      data: textEncoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: textEncoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${workbookSheetXml}
  </sheets>
</workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: textEncoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels}
</Relationships>`),
    },
    ...safeSheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: textEncoder.encode(buildWorksheetXml(sheet.rows)),
    })),
  ];

  return buildZip(files);
};

export const exportReportCsv = (config: ReportExportConfig) => {
  const sheetRows: CellValue[][] = [config.columns, ...(config.rows ?? [])];
  const content = buildCsvContent(sheetRows);
  downloadBlob(new Blob([content], { type: "text/csv;charset=utf-8;" }), buildReportFilename(config.filename, "csv"));
};

export const exportReportXlsx = (config: { sheets: WorkbookSheet[]; filename?: string }) => {
  const sheets = config.sheets.map((sheet) => ({
    name: sheet.name,
    rows: sheet.rows ?? [],
  }));

  const workbook = buildWorkbook(sheets);
  const filenameBase = config.filename || (sheets[0]?.name || "report").replace(/\s+/g, "_").toLowerCase();
  downloadBlob(
    new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    buildReportFilename(filenameBase, "xlsx"),
  );
};
