import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    const pdfUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/data/cigna-policy.pdf`;

    const response = await fetch(pdfUrl);
    console.log(`Fetching PDF from: ${pdfUrl}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch the PDF file: ${response.statusText}`);
    }

    const pdfBuffer = await response.arrayBuffer();

    // Use PDF.js to parse the PDF
    const pdf = await getDocument({ data: pdfBuffer }).promise;
    const numPages = pdf.numPages;
    let text = "";

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(" ");
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error(
      `Error parsing the PDF file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return NextResponse.json(
      {
        error: `Failed to parse the PDF file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
      { status: 500 },
    );
  }
}
