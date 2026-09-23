/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Helper to create a minimal valid PDF binary with text content
export function createSimplePdf(textLines: string[]): Buffer {
  const content = textLines
    .map((line, idx) => `BT /F1 12 Tf 50 ${750 - idx * 18} Td (${escapePdfString(line)}) Tj ET`)
    .join('\n');

  const stream = `q\n${content}\nQ`;
  const streamLength = Buffer.byteLength(stream, 'utf-8');

  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`,
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`,
  ];

  let offset = 9; // strlen("%PDF-1.4\n")
  const xrefEntries = ['0000000000 65535 f '];

  const body = objects
    .map((obj) => {
      const entry = offset.toString().padStart(10, '0') + ' 00000 n ';
      xrefEntries.push(entry);
      offset += Buffer.byteLength(obj, 'utf-8') + 1;
      return obj;
    })
    .join('\n');

  const xrefOffset = offset;
  const xref = `xref\n0 ${xrefEntries.length}\n${xrefEntries.join('\n')}\n`;
  const trailer = `trailer\n<< /Size ${xrefEntries.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(`%PDF-1.4\n${body}\n${xref}${trailer}`, 'utf-8');
}

function escapePdfString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function createSamplePdfBase64(name: string, role: string, skills: string[]): string {
  const lines = [
    `CURRICULUM VITAE - ${name.toUpperCase()}`,
    `Role: ${role}`,
    `Contact: candidate@example.com | +1 (555) 019-2834`,
    `---------------------------------------------------------------------------------`,
    `PROFESSIONAL SUMMARY`,
    `Experienced software professional dedicated to crafting reliable, performant systems.`,
    `Specializes in modern engineering best practices, agile delivery, and cross-team collaboration.`,
    `---------------------------------------------------------------------------------`,
    `CORE COMPETENCIES`,
    ...skills.map((s) => `• ${s}`),
    `---------------------------------------------------------------------------------`,
    `WORK EXPERIENCE`,
    `Senior Engineer at Apex Tech (2021 - Present)`,
    `- Spearheaded frontend architecture and scalable backend APIs.`,
    `- Improved application throughput by 40% with optimized data structures.`,
    `Software Engineer at CloudNine Systems (2018 - 2021)`,
    `- Delivered resilient microservices, comprehensive test suites, and CI/CD pipelines.`,
    `---------------------------------------------------------------------------------`,
    `EDUCATION & CERTIFICATIONS`,
    `B.S. in Computer Science - University of Engineering & Technology`,
  ];

  const pdfBuffer = createSimplePdf(lines);
  return `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
}
