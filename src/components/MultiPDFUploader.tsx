import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import worker from "pdfjs-dist/legacy/build/pdf.worker?url";

// attach worker
pdfjsLib.GlobalWorkerOptions.workerSrc = worker;

interface MultiPDFUploaderProps {
  onExtract: (text: string) => void;
}

export default function MultiPDFUploader({ onExtract }: MultiPDFUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePDFSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    setFiles(selected);
    setError(null);
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str).join(" ");
          text += strings + "\n";
        }
        resolve(text);
      } catch (err) {
        reject("Could not extract text");
      }
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);

    let finalText = "";

    for (const f of files) {
      try {
        const txt = await extractTextFromPDF(f);
        finalText += "\n\n" + txt;
      } catch (err) {
        setError(`❌ Could not read: ${f.name}`);
      }
    }

    onExtract(finalText);
    setLoading(false);
  };

  return (
    <Card className="border-dashed border-2 p-4">
      <CardContent className="space-y-3">
        <label className="w-full cursor-pointer">
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={handlePDFSelect}
          />
          <div className="bg-primary text-white px-4 py-2 rounded flex items-center gap-2 w-full justify-center">
            <Upload size={18} /> Upload PDFs
          </div>
        </label>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        {files.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {files.length} PDF(s) selected
          </p>
        )}

        <Button onClick={handleUpload} disabled={loading || files.length === 0}>
          {loading ? "Extracting text..." : "Extract Text"}
        </Button>
      </CardContent>
    </Card>
  );
}
