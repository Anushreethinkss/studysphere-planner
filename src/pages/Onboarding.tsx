import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import SyllabusUploader from '@/components/SyllabusUploader';
import { 
  School, Trophy, Plus, X, Clock, FileText, 
  ChevronRight, ChevronLeft, BookOpen, CalendarDays, Loader2
} from 'lucide-react';

type PrepType = 'school' | 'competitive';

interface Subject {
  name: string;
  color: string;
}

const SUBJECT_COLORS = [
  '#18206F', '#D88373', '#17255A', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'
];

const Onboarding = () => {
  const [step, setStep] = useState(1);
  const [prepType, setPrepType] = useState<PrepType | null>(null);
  const [board, setBoard] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [dailyHours, setDailyHours] = useState(2);
  const [examDate, setExamDate] = useState('');
  const [syllabusText, setSyllabusText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [syllabusError, setSyllabusError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Parse syllabus text into chapters and topics
  const parseSyllabus = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const chapters: { name: string; topics: string[] }[] = [];
    let currentChapter: { name: string; topics: string[] } | null = null;

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

  const handleSaveAndContinue = async () => {
    if (!syllabusText.trim()) {
      setSyllabusError('Please enter a syllabus to continue');
      return;
    }

    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to continue.',
      });
      return;
    }

    setSyllabusError(null);
    setIsLoading(true);

    try {
      const parsedChapters = parseSyllabus(syllabusText);
      
      if (parsedChapters.length === 0) {
        setSyllabusError('Could not parse syllabus. Please use "Chapter" for headings and "-" for topics.');
        setIsLoading(false);
        return;
      }

      // Update profile
      await supabase
        .from('profiles')
        .update({
          prep_type: prepType,
          board: board || null,
          daily_study_hours: dailyHours,
          exam_date: examDate || null,
          onboarding_completed: true,
        })
        .eq('user_id', user.id);

      // Create subjects, chapters, topics
      for (const subject of subjects) {
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

        for (let chapterIndex = 0; chapterIndex < parsedChapters.length; chapterIndex++) {
          const chapter = parsedChapters[chapterIndex];
          
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
            await supabase.from('topics').insert(topicsToInsert);
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

  const totalSteps = 5;
  const progress = (step / totalSteps) * 100;

  const addSubject = () => {
    if (newSubject.trim() && !subjects.find(s => s.name.toLowerCase() === newSubject.toLowerCase())) {
      setSubjects([...subjects, { 
        name: newSubject.trim(), 
        color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length] 
      }]);
      setNewSubject('');
    }
  };

  const removeSubject = (name: string) => {
    setSubjects(subjects.filter(s => s.name !== name));
  };


  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Setup Your Study Plan</h1>
            <p className="text-muted-foreground">Step {step} of {totalSteps}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step 1: Preparation Type */}
        {step === 1 && (
          <Card className="shadow-card border-0 animate-fade-up">
            <CardHeader>
              <CardTitle className="font-display">What are you preparing for?</CardTitle>
              <CardDescription>Choose your study focus</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setPrepType('school')}
                  className={`p-6 rounded-2xl border-2 transition-all duration-300 ${
                    prepType === 'school' 
                      ? 'border-primary bg-primary/10 shadow-card' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <School className={`w-12 h-12 mx-auto mb-3 ${prepType === 'school' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="font-semibold text-foreground">School Exams</p>
                  <p className="text-sm text-muted-foreground">Board & school exams</p>
                </button>
                
                <button
                  onClick={() => setPrepType('competitive')}
                  className={`p-6 rounded-2xl border-2 transition-all duration-300 ${
                    prepType === 'competitive' 
                      ? 'border-primary bg-primary/10 shadow-card' 
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Trophy className={`w-12 h-12 mx-auto mb-3 ${prepType === 'competitive' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <p className="font-semibold text-foreground">Competitive</p>
                  <p className="text-sm text-muted-foreground">JEE, NEET, UPSC, etc.</p>
                </button>
              </div>

              {prepType === 'school' && (
                <div className="pt-4 animate-fade-up">
                  <Label>Select your board (optional)</Label>
                  <Select value={board} onValueChange={setBoard}>
                    <SelectTrigger className="mt-2 h-12">
                      <SelectValue placeholder="Choose board..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CBSE">CBSE</SelectItem>
                      <SelectItem value="ICSE">ICSE</SelectItem>
                      <SelectItem value="State">State Board</SelectItem>
                      <SelectItem value="IB">IB</SelectItem>
                      <SelectItem value="Cambridge">Cambridge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Exam Date */}
        {step === 2 && (
          <Card className="shadow-card border-0 animate-fade-up">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <CalendarDays className="w-6 h-6 text-accent" />
                When is your exam?
              </CardTitle>
              <CardDescription>We'll create a study plan to help you prepare in time</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="exam-date">Exam Date</Label>
                <Input
                  id="exam-date"
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  min={getMinDate()}
                  className="h-12 mt-2"
                />
              </div>
              
              {examDate && (
                <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 animate-fade-up">
                  <p className="text-sm text-muted-foreground">Days until exam:</p>
                  <p className="text-3xl font-bold text-accent">
                    {Math.ceil((new Date(examDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Subjects */}
        {step === 3 && (
          <Card className="shadow-card border-0 animate-fade-up">
            <CardHeader>
              <CardTitle className="font-display">Add your subjects</CardTitle>
              <CardDescription>What subjects are you studying?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter subject name..."
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addSubject()}
                  className="h-12"
                />
                <Button onClick={addSubject} size="icon" className="h-12 w-12 shrink-0">
                  <Plus className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 min-h-[50px]">
                {subjects.map((subject) => (
                  <Badge
                    key={subject.name}
                    variant="secondary"
                    className="px-4 py-2 text-sm flex items-center gap-2 animate-pop"
                    style={{ backgroundColor: `${subject.color}20`, borderColor: subject.color }}
                  >
                    <span style={{ color: subject.color }}>{subject.name}</span>
                    <button onClick={() => removeSubject(subject.name)} className="hover:opacity-70">
                      <X className="w-4 h-4" style={{ color: subject.color }} />
                    </button>
                  </Badge>
                ))}
                {subjects.length === 0 && (
                  <p className="text-muted-foreground text-sm">Add subjects to continue...</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Daily Hours */}
        {step === 4 && (
          <Card className="shadow-card border-0 animate-fade-up">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Clock className="w-6 h-6 text-accent" />
                Daily study time
              </CardTitle>
              <CardDescription>How many hours can you dedicate each day?</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((hours) => (
                  <button
                    key={hours}
                    onClick={() => setDailyHours(hours)}
                    className={`p-4 rounded-xl border-2 transition-all duration-300 ${
                      dailyHours === hours 
                        ? 'border-accent bg-accent/10 shadow-soft' 
                        : 'border-border hover:border-accent/50'
                    }`}
                  >
                    <p className={`text-2xl font-bold ${dailyHours === hours ? 'text-accent' : 'text-foreground'}`}>
                      {hours}
                    </p>
                    <p className="text-xs text-muted-foreground">hour{hours > 1 ? 's' : ''}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Syllabus */}
        {step === 5 && (
          <Card className="shadow-card border-0 animate-fade-up">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <FileText className="w-6 h-6 text-accent" />
                Add your syllabus
              </CardTitle>
              <CardDescription>
                Paste your syllabus content below. Use "Chapter" for headings and "-" for topics.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SyllabusUploader 
                value={syllabusText} 
                onChange={(text) => {
                  setSyllabusText(text);
                  if (syllabusError && text.trim()) {
                    setSyllabusError(null);
                  }
                }} 
              />
              
              {syllabusError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                  {syllabusError}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button
            variant="ghost"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1 || isLoading}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {step < totalSteps ? (
            <Button
              variant="accent"
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 1 && !prepType) ||
                (step === 2 && !examDate) ||
                (step === 3 && subjects.length === 0)
              }
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              variant="hero"
              onClick={handleSaveAndContinue}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <ChevronRight className="w-4 h-4 mr-2" />
                  Extract & Continue
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
