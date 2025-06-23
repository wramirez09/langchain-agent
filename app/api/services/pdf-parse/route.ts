import { NextApiRequest, NextApiResponse } from "next";
import pdfParse from "pdf-parse";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Define the URL to the PDF file in the public directory
    const pdfUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/data/cigna-policy.pdf`;

    // Fetch the PDF file from the static directory
    const response = await fetch(pdfUrl);
    console.log(`Fetching PDF from: ${pdfUrl}`);

    if (!response) {
      throw new Error(`Failed to fetch the PDF file: ${response}`);
    }

    const pdfBuffer = await response.arrayBuffer();

    // Parse the PDF content
    const parsedPdf = await pdfParse(Buffer.from(pdfBuffer));
    console.log("PDF file parsed successfully.", parsedPdf);

    // Return the parsed text content
    res.status(200).json({ text: parsedPdf.text });
  } catch (error) {
    console.error(
      `Error parsing the PDF file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    res.status(500).json({
      error: `Failed to parse the PDF file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}
