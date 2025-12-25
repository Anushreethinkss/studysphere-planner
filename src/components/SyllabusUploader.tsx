import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Loader2, X, Sparkles } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface SyllabusUploaderProps {
  value: string;
  onChange: (text: string) => void;
}

const SyllabusUploader = ({ value, onChange }: SyllabusUploaderProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ['application/pdf', 'text/plain'];
    if (!validTypes.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload a PDF or TXT file.',
      });
      return;
    }

    setIsProcessing(true);
    setUploadedFileName(file.name);

    try {
      let extractedText = '';

      if (file.type === 'text/plain') {
        // Read text file directly
        extractedText = await file.text();
      } else if (file.type === 'application/pdf') {
        // Parse PDF using PDF.js
        extractedText = await extractTextFromPdf(file);
      }

      if (extractedText.trim()) {
        onChange(extractedText);
        toast({
          title: 'File processed!',
          description: `Extracted ${extractedText.split('\n').filter(l => l.trim()).length} lines from ${file.name}`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'No text found',
          description: 'Could not extract text from the file. Try pasting manually.',
        });
      }
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        variant: 'destructive',
        title: 'Error processing file',
        description: 'Could not read the file. Please try again or paste manually.',
      });
    } finally {
      setIsProcessing(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    // Clean up and format the text
    return fullText
      .replace(/\s+/g, ' ')
      .replace(/([.!?])\s+/g, '$1\n')
      .replace(/Chapter/gi, '\nChapter')
      .replace(/Unit/gi, '\nUnit')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .join('\n');
  };

  const clearFile = () => {
    setUploadedFileName(null);
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* File Upload Area */}
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          onChange={handleFileSelect}
          className="hidden"
          id="syllabus-upload"
        />
        
        <label
          htmlFor="syllabus-upload"
          className={`
            flex flex-col items-center justify-center w-full h-32 
            border-2 border-dashed rounded-2xl cursor-pointer
            transition-all duration-300
            ${isProcessing 
              ? 'border-accent bg-accent/10' 
              : 'border-border hover:border-primary hover:bg-primary/5'
            }
          `}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <span className="text-sm text-muted-foreground">Processing file...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Upload Syllabus File</span>
              <span className="text-xs text-muted-foreground">PDF or TXT (max 10MB)</span>
            </div>
          )}
        </label>

        {uploadedFileName && !isProcessing && (
          <div className="absolute top-2 right-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-destructive/10 hover:bg-destructive/20"
              onClick={clearFile}
            >
              <X className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {uploadedFileName && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-accent/10 border border-accent/30">
          <FileText className="w-4 h-4 text-accent" />
          <span className="text-sm text-foreground">{uploadedFileName}</span>
        </div>
      )}

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-sm text-muted-foreground">or paste manually</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Manual Textarea */}
      <div>
        <Label htmlFor="syllabus-text" className="sr-only">Syllabus Text</Label>
        <Textarea
          id="syllabus-text"
          placeholder={`Example format:

Chapter 1: Introduction to Physics
- Motion and Rest
- Distance and Displacement
- Speed and Velocity

Chapter 2: Force and Laws of Motion
- Newton's First Law
- Newton's Second Law
- Newton's Third Law`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[250px] font-mono text-sm"
        />
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="w-4 h-4 text-accent" />
        <span>AI will automatically parse chapters and topics</span>
      </div>
    </div>
  );
};

export default SyllabusUploader;
