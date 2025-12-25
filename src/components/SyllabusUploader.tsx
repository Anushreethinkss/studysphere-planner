import { useState, useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Sparkles, AlertCircle, Upload, FileText, Loader2, X, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createWorker } from 'tesseract.js';

interface SyllabusUploaderProps {
  value: string;
  onChange: (text: string) => void;
}

const SyllabusUploader = ({ value, onChange }: SyllabusUploaderProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [usedOcr, setUsedOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    if (error && e.target.value.trim()) {
      setError(null);
    }
  };

  // Convert PDF pages to images for OCR
  const pdfToImages = async (pdfData: ArrayBuffer): Promise<string[]> => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;
    
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    const images: string[] = [];
    
    const maxPages = Math.min(pdf.numPages, 10); // Limit to 10 pages for OCR
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({
        canvasContext: context!,
        viewport: viewport,
      }).promise;
      
      images.push(canvas.toDataURL('image/png'));
    }
    
    return images;
  };

  // Run OCR on PDF images
  const runOcr = async (pdfData: ArrayBuffer): Promise<string> => {
    setIsOcrProcessing(true);
    setOcrProgress(0);
    
    try {
      toast({
        title: 'Running OCR...',
        description: 'Extracting Hindi text from PDF images. This may take a moment.',
      });

      // Convert PDF to images
      const images = await pdfToImages(pdfData);
      
      // Create Tesseract worker with Hindi + English
      const worker = await createWorker('hin+eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });
      
      const textParts: string[] = [];
      
      for (let i = 0; i < images.length; i++) {
        setOcrProgress(Math.round(((i + 0.5) / images.length) * 100));
        const { data: { text } } = await worker.recognize(images[i]);
        if (text.trim()) {
          textParts.push(text.trim());
        }
      }
      
      await worker.terminate();
      
      return textParts.join('\n\n');
    } finally {
      setIsOcrProcessing(false);
      setOcrProgress(0);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadedFileName(file.name);
    setUsedOcr(false);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data, error: fnError } = await supabase.functions.invoke('parse-pdf', {
        body: formData,
      });

      if (fnError) throw fnError;

      // Check if OCR is needed (garbage text or empty)
      if (data?.needsOcr || data?.isGarbage || data?.isEmpty || data?.parseError) {
        console.log('Text extraction failed, running OCR fallback...');
        
        try {
          const pdfData = await file.arrayBuffer();
          const ocrText = await runOcr(pdfData);
          
          if (ocrText && ocrText.length > 20) {
            onChange(ocrText);
            setUsedOcr(true);
            toast({
              title: 'OCR extraction complete',
              description: 'Hindi text extracted using OCR. Please review and edit.',
            });
            return;
          }
        } catch (ocrError) {
          console.error('OCR failed:', ocrError);
        }
        
        // OCR also failed - show manual paste option
        const warningText = `⚠️ Text extraction failed — please paste your syllabus manually below.\n\nExample format:\n\nHindi:\nChapter 1 – अपठित गद्यांश\n- गद्यांश पढ़ना\n- प्रश्न उत्तर\n\nEnglish:\nChapter 1 – A Letter to God\n- Reading Comprehension\n- Vocabulary`;
        onChange(warningText);
        toast({
          title: 'PDF text extraction limited',
          description: 'Please edit the text area to add your syllabus manually.',
        });
        return;
      }

      // Success - use extracted text
      onChange(data.extractedText);
      toast({
        title: 'Syllabus uploaded successfully',
        description: 'Review and edit the extracted text below.',
      });
    } catch (err) {
      console.error('PDF upload error:', err);
      const warningText = `⚠️ Text extraction failed — please paste your syllabus manually below.\n\nExample format:\n\nHindi:\nChapter 1 – अपठित गद्यांश\n- गद्यांश पढ़ना\n- प्रश्न उत्तर\n\nEnglish:\nChapter 1 – A Letter to God\n- Reading Comprehension\n- Vocabulary`;
      onChange(warningText);
      toast({
        title: 'PDF could not be read',
        description: 'Please paste your syllabus text manually.',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const clearUpload = () => {
    setUploadedFileName(null);
    onChange('');
    setError(null);
    setUsedOcr(false);
  };

  const isProcessing = isUploading || isOcrProcessing;

  return (
    <div className="space-y-4">
      {/* OCR Banner */}
      {usedOcr && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-accent/10 border border-accent/30">
          <Eye className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm text-accent font-medium">
            OCR used to extract Hindi text — please review for accuracy
          </span>
        </div>
      )}

      {/* PDF Upload Section */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-foreground">Upload PDF Syllabus</Label>
        
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileSelect}
            className="hidden"
            id="pdf-upload"
          />
          
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="h-12 px-6 gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isOcrProcessing ? `OCR ${ocrProgress}%...` : 'Extracting...'}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload PDF
              </>
            )}
          </Button>

          {uploadedFileName && !isProcessing && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium truncate max-w-[150px]">
                {uploadedFileName}
              </span>
              <button
                onClick={clearUpload}
                className="p-0.5 rounded hover:bg-primary/20 transition-colors"
              >
                <X className="w-3 h-3 text-primary" />
              </button>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          PDF file, max 10MB. Supports Hindi (Devanagari) text via OCR.
        </p>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground uppercase">or paste text</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* Textarea */}
      <div>
        <Label htmlFor="syllabus-text" className="text-sm font-medium text-foreground mb-2 block">
          {uploadedFileName ? 'Edit extracted text' : 'Paste your syllabus here'}
        </Label>
        <Textarea
          id="syllabus-text"
          placeholder={`Example format (subjects auto-detected):

Hindi:
Chapter 1 – अपठित गद्यांश
- गद्यांश पढ़ना
- प्रश्न उत्तर

English:
Chapter 1 – A Letter to God
- Reading Comprehension
- Vocabulary
- Q&A

Science:
Chapter 1 – Chemical Reactions
- Types of Reactions
- Balancing Equations`}
          value={value}
          onChange={handleTextChange}
          className="min-h-[300px] font-mono text-sm"
        />
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="w-4 h-4 text-accent" />
        <span>Use "Subject:" for subjects, "Chapter" for chapters, and "-" for topics</span>
      </div>
    </div>
  );
};

export default SyllabusUploader;