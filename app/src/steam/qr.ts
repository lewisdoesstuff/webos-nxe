import qrcodeGenerator from "qrcode-generator";

/** The QR's modules as rows of booleans, true for a dark one. */
export function qrMatrix(text: string): boolean[][] {
  const code = qrcodeGenerator(0, "M");
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_row, y) =>
    Array.from({ length: size }, (_column, x) => code.isDark(y, x)),
  );
}

/** The matrix as one SVG path, a rect per dark module, so it draws as a single element. */
export function qrPath(matrix: readonly (readonly boolean[])[]): string {
  let out = "";
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) out += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return out;
}
