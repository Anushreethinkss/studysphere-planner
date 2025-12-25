import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sparkles, AlertCircle } from 'lucide-react';

interface SyllabusUploaderProps {
  value: string;
  onChange: (text: string) => void;
}

const SyllabusUploader = ({ value, onChange }: SyllabusUploaderProps) => {
  const [error, setError] = useState<string | null>(null);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    if (error && e.target.value.trim()) {
      setError(null);
    }
  };

  return (
    <div className="space-y-4">
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
          Paste your syllabus here
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
