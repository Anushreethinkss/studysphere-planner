import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { FileText, Save, ChevronLeft, Loader2, Sparkles, BookOpen } from 'lucide-react';

interface LocationState {
  extractedText: string;
  subjects: { name: string; color: string }[];
  examDate: string;
  dailyHours: number;
  prepType: string;
  board: string | null;
}

interface ParsedChapter {
  name: string;
  topics: string[];
}

const SyllabusPreview = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const state = location.state as LocationState | null;
  const [syllabusText, setSyllabusText] = useState(state?.extractedText || '');
  const [isLoading, setIsLoading] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<ParsedChapter[]>([]);

  useEffect(() => {
    if (!state) {
      navigate('/onboarding');
      return;
    }
  }, [state, navigate]);

  useEffect(() => {
    // Parse preview as user edits
    const parsed = parseSyllabus(syllabusText);
    setParsedPreview(parsed);
  }, [syllabusText]);

  const parseSyllabus = (text: string): ParsedChapter[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const chapters: ParsedChapter[] = [];
    let currentChapter: ParsedChapter | null = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Check if it's a chapter line
      if (/^(chapter|unit|\d+\.|\d+\))/i.test(trimmed) || 
          (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !trimmed.startsWith('-'))) {
        if (currentChapter && currentChapter.topics.length > 0) {
          chapters.push(currentChapter);
        }
        const chapterName = trimmed
          .replace(/^(chapter|unit)\s*\d*[:.)\s]*/i, '')
          .replace(/^\d+[.:)\s]+/, '')
          .trim();
        currentChapter = { name: chapterName || `Chapter ${chapters.length + 1}`, topics: [] };
      } else if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*')) {
        // It's a topic
        const topicName = trimmed.replace(/^[-•*\s]+/, '').trim();
        if (topicName) {
          if (currentChapter) {
            currentChapter.topics.push(topicName);
          } else {
            currentChapter = { name: 'Chapter 1', topics: [topicName] };
          }
        }
      } else if (currentChapter && trimmed && !trimmed.match(/^(chapter|unit)/i)) {
        currentChapter.topics.push(trimmed.replace(/^[-•*\d.)\s]+/, '').trim());
      }
    });

    if (currentChapter && currentChapter.topics.length > 0) {
      chapters.push(currentChapter);
    }

    // If no chapters detected, create default structure
    if (chapters.length === 0 && lines.length > 0) {
      const allTopics = lines
        .filter(l => l.trim())
        .map(l => l.replace(/^[-•*\d.)\s]+/, '').trim())
        .filter(l => l.length > 0);
      
      const chunkSize = 5;
      for (let i = 0; i < allTopics.length; i += chunkSize) {
        chapters.push({
          name: `Part ${Math.floor(i / chunkSize) + 1}`,
          topics: allTopics.slice(i, i + chunkSize)
        });
      }
    }

    return chapters;
  };

  const handleSave = async () => {
    if (!user || !state) return;
    
    setIsLoading(true);
    
    try {
      // Update profile
      await supabase
        .from('profiles')
        .update({
          prep_type: state.prepType,
          board: state.board,
          daily_study_hours: state.dailyHours,
          exam_date: state.examDate || null,
          onboarding_completed: true,
        })
        .eq('user_id', user.id);

      // Create subjects, chapters, topics
      for (const subject of state.subjects) {
        const { data: subjectData, error: subjectError } = await supabase
          .from('subjects')
          .insert({
            user_id: user.id,
            name: subject.name,
            color: subject.color,
          })
          .select()
          .single();

        if (subjectError) throw subjectError;

        // Create chapters and topics
        for (let chapterIndex = 0; chapterIndex < parsedPreview.length; chapterIndex++) {
          const chapter = parsedPreview[chapterIndex];
          
          const { data: chapterData, error: chapterError } = await supabase
            .from('chapters')
            .insert({
              user_id: user.id,
              subject_id: subjectData.id,
              name: chapter.name,
              order_index: chapterIndex,
            })
            .select()
            .single();

          if (chapterError) throw chapterError;

          const topicsToInsert = chapter.topics.map((topic, topicIndex) => ({
            user_id: user.id,
            chapter_id: chapterData.id,
            name: topic,
            order_index: topicIndex,
            status: 'pending' as const,
          }));

          if (topicsToInsert.length > 0) {
            await supabase
              .from('topics')
              .insert(topicsToInsert);
          }
        }
      }

      toast({
        title: 'Syllabus saved!',
        description: 'Your study plan is ready.',
      });
      
      navigate('/plan');
    } catch (error) {
      console.error('Error saving syllabus:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save syllabus. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const totalTopics = parsedPreview.reduce((sum, ch) => sum + ch.topics.length, 0);

  if (!state) return null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Review Your Syllabus</h1>
            <p className="text-muted-foreground">Edit the extracted text before saving</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Editor */}
          <Card className="shadow-card border-0">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent" />
                Syllabus Text
              </CardTitle>
              <CardDescription>
                Edit the text below. Use "Chapter" for headings and "-" for topics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={syllabusText}
                onChange={(e) => setSyllabusText(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
                placeholder="Paste or edit your syllabus here..."
              />
            </CardContent>
          </Card>

          {/* Preview */}
          <Card className="shadow-card border-0">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                Parsed Preview
              </CardTitle>
              <CardDescription>
                {parsedPreview.length} chapters • {totalTopics} topics detected
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {parsedPreview.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Add chapters and topics to see preview...
                  </p>
                ) : (
                  parsedPreview.map((chapter, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-muted/50 border border-border">
                      <h4 className="font-semibold text-foreground mb-2">{chapter.name}</h4>
                      <ul className="space-y-1">
                        {chapter.topics.map((topic, tidx) => (
                          <li key={tidx} className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                            {topic}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-between mt-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/onboarding')}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Onboarding
          </Button>

          <Button
            variant="accent"
            onClick={handleSave}
            disabled={isLoading || parsedPreview.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save & Generate Plan
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SyllabusPreview;
