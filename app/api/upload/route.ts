import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

const uploadsDir = path.join(process.cwd(), '/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ...existing code...
export default async function POST(req: NextApiRequest, res: NextApiResponse) {
  const form = new formidable.IncomingForm({ uploadDir: uploadsDir, keepExtensions: true });

  await new Promise<void>((resolve, reject) => {
    form.parse(req, (err: any, fields: any, files: { file: { filepath: any; }[]; }) => {
      if (err) {
        res.status(500).json({ error: 'File parsing error' });
        reject(err);
        return;
      }

      const filePath = files.file?.[0]?.filepath;
      if (!filePath) {
        res.status(400).json({ error: 'No file found' });
        resolve();
        return;
      }

      res.status(200).json({ filePath });
      resolve();
    });
  });
}
// ...existing code...
