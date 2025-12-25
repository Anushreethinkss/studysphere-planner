import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  School, Trophy, Plus, X, Clock, FileText, 
  ChevronRight, ChevronLeft, Sparkles, Loader2, BookOpen
} from 'lucide-react';

type PrepType = 'school' | 'competitive';

interface Subject {
  name: string;
  color: string;
}

interface ParsedSyllabus {
  chapters: {
    name: string;
    topics: string[];
  }[];
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
  const [syllabusText, setSyllabusText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const totalSteps = 4;
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

  const parseSyllabus = (text: string, subjectName: string): ParsedSyllabus => {
    const lines = text.split('\n').filter(line => line.trim());
    const chapters: ParsedSyllabus['chapters'] = [];
    let currentChapter: { name: string; topics: string[] } | null = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      // Check if it's a chapter (starts with number, "Chapter", "Unit", or is all caps)
      if (/^(chapter|unit|\d+\.|\d+\))/i.test(trimmed) || 
          (trimmed === trimmed.toUpperCase() && trimmed.length > 3)) {
        if (currentChapter) {
          chapters.push(currentChapter);
        }
        currentChapter = { name: trimmed.replace(/^(chapter|unit)\s*\d*[:.)\s]*/i, ''), topics: [] };
      } else if (currentChapter && trimmed) {
        // It's a topic
        currentChapter.topics.push(trimmed.replace(/^[-•*\d.)\s]+/, ''));
      }
    });

    if (currentChapter) {
      chapters.push(currentChapter);
    }

    // If no chapters detected, create a default one
    if (chapters.length === 0 && lines.length > 0) {
      chapters.push({
        name: `${subjectName} Fundamentals`,
        topics: lines.slice(0, 10).map(l => l.replace(/^[-•*\d.)\s]+/, ''))
      });
    }

    return { chapters };
  };

  const generateStudyPlan = async () => {
    if (!user) return;
    
    setIsLoading(true);
    
    try {
      // Update profile
      await supabase
        .from('profiles')
        .update({
          prep_type: prepType,
          board: board || null,
          daily_study_hours: dailyHours,
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

        // Parse syllabus for this subject
        const parsed = parseSyllabus(syllabusText, subject.name);
        
        // Create chapters and topics
        for (let chapterIndex = 0; chapterIndex < parsed.chapters.length; chapterIndex++) {
          const chapter = parsed.chapters[chapterIndex];
          
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

          // Create topics
          const topicsToInsert = chapter.topics.map((topic, topicIndex) => ({
            user_id: user.id,
            chapter_id: chapterData.id,
            name: topic,
            order_index: topicIndex,
            status: 'pending' as const,
          }));

          if (topicsToInsert.length > 0) {
            const { data: topicsData, error: topicsError } = await supabase
              .from('topics')
              .insert(topicsToInsert)
              .select();

            if (topicsError) throw topicsError;

            // Create study tasks for each topic
            const today = new Date();
            const minutesPerTopic = Math.floor((dailyHours * 60) / (topicsToInsert.length || 1));
            
            const tasksToInsert = topicsData.map((topic, index) => {
              const scheduledDate = new Date(today);
              scheduledDate.setDate(today.getDate() + Math.floor(index / 3)); // 3 topics per day
              
              return {
                user_id: user.id,
                topic_id: topic.id,
                scheduled_date: scheduledDate.toISOString().split('T')[0],
                duration_minutes: Math.min(minutesPerTopic, 45),
                task_type: 'study' as const,
              };
            });

            await supabase.from('study_tasks').insert(tasksToInsert);
          }
        }
      }

      toast({
        title: 'Study plan created!',
        description: 'Your personalized study schedule is ready.',
      });
      
      navigate('/dashboard');
    } catch (error) {
      console.error('Error creating study plan:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to create study plan. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
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

        {/* Step 2: Subjects */}
        {step === 2 && (
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

        {/* Step 3: Daily Hours */}
        {step === 3 && (
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

        {/* Step 4: Syllabus */}
        {step === 4 && (
          <Card className="shadow-card border-0 animate-fade-up">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <FileText className="w-6 h-6 text-accent" />
                Add your syllabus
              </CardTitle>
              <CardDescription>
                Paste your syllabus content below. List chapters and topics.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={`Example format:

Chapter 1: Introduction to Physics
- Motion and Rest
- Distance and Displacement
- Speed and Velocity

Chapter 2: Force and Laws of Motion
- Newton's First Law
- Newton's Second Law
- Newton's Third Law`}
                value={syllabusText}
                onChange={(e) => setSyllabusText(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-accent" />
                <span>AI will automatically parse chapters and topics</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <Button
            variant="ghost"
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
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
                (step === 2 && subjects.length === 0)
              }
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              variant="hero"
              onClick={generateStudyPlan}
              disabled={isLoading || !syllabusText.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Creating plan...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Study Plan
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
