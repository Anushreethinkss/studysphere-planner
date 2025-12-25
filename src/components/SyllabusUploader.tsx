import { useState, useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Sparkles, AlertCircle, Upload, FileText, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SyllabusUploaderProps {
  value: string;
  onChange: (text: string) => void;
}

const SyllabusUploader = ({ value, onChange }: SyllabusUploaderProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    if (error && e.target.value.trim()) {
      setError(null);
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

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data, error: fnError } = await supabase.functions.invoke('parse-pdf', {
        body: formData,
      });

      if (fnError) throw fnError;

      // Check if extraction was successful
      if (data?.needsOcr || data?.isGarbage || data?.isEmpty || data?.parseError || !data?.extractedText) {
        // Show warning and let user paste manually
        const warningText = `⚠️ PDF text could not be extracted automatically.

This may be a scanned PDF or contain Hindi text that requires manual input.

Please paste your syllabus below in this format:

Hindi:
Chapter 1 – अपठित गद्यांश
- गद्यांश पढ़ना
- प्रश्न उत्तर

English:
Chapter 1 – A Letter to God
- Reading Comprehension
- Vocabulary`;
        onChange(warningText);
        toast({
          title: 'Manual input required',
          description: 'Please paste your syllabus text in the text area below.',
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
      const warningText = `⚠️ PDF upload failed.

Please paste your syllabus manually in this format:

Hindi:
Chapter 1 – अपठित गद्यांश
- गद्यांश पढ़ना
- प्रश्न उत्तर

English:
Chapter 1 – A Letter to God
- Reading Comprehension
- Vocabulary`;
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
  };

  return (
    <div className="space-y-4">
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
            disabled={isUploading}
            className="h-12 px-6 gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Extracting text...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload PDF
              </>
            )}
          </Button>

          {uploadedFileName && !isUploading && (
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
          PDF file, max 10MB. Text-based PDFs work best.
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