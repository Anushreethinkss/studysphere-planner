import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Loader2, X, Sparkles, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SyllabusUploaderProps {
  value: string;
  onChange: (text: string) => void;
}

const SyllabusUploader = ({ value, onChange }: SyllabusUploaderProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validTypes = ['application/pdf', 'text/plain'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.pdf')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please upload a PDF or TXT file.',
      });
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB.',
      });
      return;
    }

    setIsProcessing(true);
    setUploadedFileName(file.name);
    setError(null);

    try {
      let extractedText = '';

      // Handle text files directly on client
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        extractedText = await file.text();
      } else {
        // Send PDF to backend for parsing
        const base64 = await fileToBase64(file);
        
        const { data, error: funcError } = await supabase.functions.invoke('parse-pdf', {
          body: {
            fileData: base64,
            fileName: file.name,
            fileType: file.type,
          },
        });

        if (funcError) {
          throw new Error(funcError.message || 'Failed to parse PDF');
        }

        if (data?.error) {
          setError(data.error);
          toast({
            variant: 'destructive',
            title: 'PDF parsing issue',
            description: data.error,
          });
          return;
        }

        extractedText = data?.extractedText || '';
      }

      if (extractedText.trim()) {
        onChange(extractedText);
        toast({
          title: 'File processed!',
          description: `Extracted ${extractedText.split('\n').filter(l => l.trim()).length} lines from ${file.name}`,
        });
      } else {
        setError('No text found in the file. Try pasting manually.');
        toast({
          variant: 'destructive',
          title: 'No text found',
          description: 'Could not extract text from the file. Try pasting manually.',
        });
      }
    } catch (error) {
      console.error('Error processing file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not read the file';
      setError(errorMessage);
      toast({
        variant: 'destructive',
        title: 'PDF could not be parsed',
        description: errorMessage,
      });
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const clearFile = () => {
    setUploadedFileName(null);
    setError(null);
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
          accept=".pdf,.txt,application/pdf,text/plain"
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
              : error 
                ? 'border-destructive bg-destructive/5'
                : 'border-border hover:border-primary hover:bg-primary/5'
            }
          `}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <span className="text-sm text-muted-foreground">Processing file...</span>
              <span className="text-xs text-muted-foreground">This may take a moment</span>
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

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm text-destructive">{error}</div>
        </div>
      )}

      {/* File Name Display */}
      {uploadedFileName && !error && (
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
