import React, { useState } from "react";

interface MultiPDFUploaderProps {
  onFilesExtracted: (texts: string[]) => void;
}

export default function MultiPDFUploader({ onFilesExtracted }: MultiPDFUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");

  async function extractTextFromPDF(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        resolve(text || "");
      };
      reader.readAsText(file);
    });
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    setFiles(selectedFiles);

    try {
      const extractedTexts: string[] = [];
      for (const file of selectedFiles) {
        const text = await extractTextFromPDF(file);
        extractedTexts.push(text);
      }
      onFilesExtracted(extractedTexts);
    } catch {
      setError("❌ Could not read one or more PDFs.");
    }
  };

  return (
    <div className="border p-3 rounded-md">
      <label className="cursor-pointer bg-purple-600 text-white px-4 py-2 rounded-md">
        📎 Upload PDFs
        <input type="file" accept=".pdf" onChange={handleUpload} multiple hidden />
      </label>

      {files.length > 0 && (
        <p className="text-sm mt-2 text-gray-700">
          {files.length} PDF(s) selected
        </p>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}
