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
import MultiPDFUploader from '@/components/MultiPDFUploader';
import { 
  School, Trophy, Plus, X, Clock, FileText, 
  ChevronRight, ChevronLeft, BookOpen, CalendarDays, Loader2, Target
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

type PrepType = 'school' | 'competitive';
type DifficultyLevel = 'strong' | 'medium' | 'weak';

interface Subject {
  name: string;
  color: string;
}

interface SubjectDifficulty {
  name: string;
  difficulty: DifficultyLevel;
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
  const [parsedSubjectNames, setParsedSubjectNames] = useState<string[]>([]);
  const [subjectDifficulties, setSubjectDifficulties] = useState<SubjectDifficulty[]>([]);
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Parse syllabus text into 3-layer structure: subjects -> chapters -> topics
  interface ParsedChapter {
    name: string;
    topics: string[];
  }
  
  interface ParsedSubject {
    name: string;
    color: string;
    chapters: ParsedChapter[];
  }

  const parseSyllabus = (text: string): ParsedSubject[] => {
    const lines = text.split('\n');
    const parsedSubjects: ParsedSubject[] = [];
    
    let currentSubject: ParsedSubject | null = null;
    let currentChapter: ParsedChapter | null = null;
    let colorIndex = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip blank lines
      if (!trimmed) continue;
      
      // Rule 1: Line ending with ":" starts a new subject
      // e.g., "Hindi:", "English:", "Science:", "गणित:"
      if (trimmed.endsWith(':') && !trimmed.startsWith('-')) {
        // Save current chapter to current subject before switching
        if (currentChapter && currentChapter.topics.length > 0 && currentSubject) {
          currentSubject.chapters.push(currentChapter);
          currentChapter = null;
        }
        // Save current subject before starting new one
        if (currentSubject && currentSubject.chapters.length > 0) {
          parsedSubjects.push(currentSubject);
        }
        
        const subjectName = trimmed.slice(0, -1).trim(); // Remove trailing ":"
        currentSubject = {
          name: subjectName,
          color: SUBJECT_COLORS[colorIndex % SUBJECT_COLORS.length],
          chapters: []
        };
        colorIndex++;
        currentChapter = null;
        continue;
      }
      
      // Rule 2: Line starting with "Chapter" creates a new chapter
      if (/^chapter/i.test(trimmed)) {
        // Save current chapter before starting new one
        if (currentChapter && currentChapter.topics.length > 0 && currentSubject) {
          currentSubject.chapters.push(currentChapter);
        }
        
        // Extract chapter name (remove "Chapter X - " or "Chapter X: " etc.)
        const chapterName = trimmed
          .replace(/^chapter\s*\d*\s*[-–:.)\s]*/i, '')
          .trim() || trimmed;
        
        currentChapter = { 
          name: chapterName, 
          topics: [] 
        };
        
        // If no subject defined yet, create a default one
        if (!currentSubject) {
          currentSubject = {
            name: subjects.length > 0 ? subjects[0].name : 'General',
            color: subjects.length > 0 ? subjects[0].color : SUBJECT_COLORS[0],
            chapters: []
          };
          colorIndex++;
        }
        continue;
      }
      
      // Rule 3: Line starting with "-" creates a topic under current chapter
      if (trimmed.startsWith('-')) {
        const topicName = trimmed.slice(1).trim(); // Remove leading "-"
        if (topicName) {
          // Create default chapter if none exists
          if (!currentChapter) {
            currentChapter = { name: 'Chapter 1', topics: [] };
          }
          // Create default subject if none exists
          if (!currentSubject) {
            currentSubject = {
              name: subjects.length > 0 ? subjects[0].name : 'General',
              color: subjects.length > 0 ? subjects[0].color : SUBJECT_COLORS[0],
              chapters: []
            };
            colorIndex++;
          }
          currentChapter.topics.push(topicName);
        }
        continue;
      }
    }

    // Don't forget the last chapter and subject
    if (currentChapter && currentChapter.topics.length > 0 && currentSubject) {
      currentSubject.chapters.push(currentChapter);
    }
    if (currentSubject && currentSubject.chapters.length > 0) {
      parsedSubjects.push(currentSubject);
    }

    return parsedSubjects;
  };
const handleSaveAndContinue = async () => {
  // ===== Basic validation =====
  if (!syllabusText.trim()) {
    setSyllabusError("Please enter a syllabus to continue");
    return;
  }

  if (!user) {
    toast({
      variant: "destructive",
      title: "Error",
      description: "You must be logged in to continue.",
    });
    return;
  }

  setSyllabusError(null);
  setIsLoading(true);

  try {
    // ===== 1️⃣ Parse syllabus =====
    const parsedSubjects = parseSyllabus(syllabusText);

    if (
      parsedSubjects.length === 0 ||
      parsedSubjects.every(s => s.chapters.length === 0)
    ) {
      setSyllabusError(
        'Could not parse syllabus. Use "Subject:" for subjects, "Chapter" for chapters, and "-" for topics.'
      );
      return;
    }

    // ===== 2️⃣ Generate AI schedule =====
    const response = await fetch("/.netlify/functions/generateSchedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: syllabusText,
        examDate,
        subjects: parsedSubjects,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to generate schedule");
    }

    // ===== 3️⃣ Save study plan =====
    const { error: planError } = await supabase.from("study_plan").insert({
      user_id: user.id,
      merged_text: syllabusText,
      exam_date: examDate,
      subjects_json: parsedSubjects,
      schedule_json: result.schedule,
    });

    if (planError) throw planError;

    // ===== 4️⃣ Update profile =====
    await supabase
      .from("profiles")
      .update({
        prep_type: prepType,
        board: board || null,
        daily_study_hours: dailyHours,
        exam_date: examDate || null,
        onboarding_completed: true,
      })
      .eq("user_id", user.id);

    // ===== 5️⃣ Save subjects / chapters / topics =====
    for (const parsedSubject of parsedSubjects) {
      if (parsedSubject.chapters.length === 0) continue;

      const difficultyEntry = subjectDifficulties.find(
        d => d.name === parsedSubject.name
      );
      const difficulty = difficultyEntry?.difficulty || "medium";

      const { data: subjectData, error: subjectError } = await supabase
        .from("subjects")
        .insert({
          user_id: user.id,
          name: parsedSubject.name,
          color: parsedSubject.color,
          difficulty,
        })
        .select()
        .single();

      if (subjectError) throw subjectError;

      for (let chapterIndex = 0; chapterIndex < parsedSubject.chapters.length; chapterIndex++) {
        const chapter = parsedSubject.chapters[chapterIndex];

        const { data: chapterData, error: chapterError } = await supabase
          .from("chapters")
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
          status: "pending" as const,
        }));

        if (topicsToInsert.length > 0) {
          await supabase.from("topics").insert(topicsToInsert);
        }
      }
    }

    // ===== 6️⃣ Success =====
    toast({
      title: "Syllabus saved!",
      description: `Created ${parsedSubjects.length} subject(s) with your study plan.`,
    });

    navigate("/plan");
  } catch (error) {
    console.error(error);
    toast({
      variant: "destructive",
      title: "Error",
      description: "Something went wrong. Please try again.",
    });
  } finally {
    setIsLoading(false);
  }
};


  const totalSteps = 6;
  const progress = (step / totalSteps) * 100;

  // Parse syllabus and extract subject names for step 6
  const handleParseSyllabus = () => {
    if (!syllabusText.trim()) {
      setSyllabusError('Please enter a syllabus to continue');
      return false;
    }
    
    const parsed = parseSyllabus(syllabusText);
    if (parsed.length === 0 || parsed.every(s => s.chapters.length === 0)) {
      setSyllabusError('Could not parse syllabus. Use "Subject:" for subjects, "Chapter" for chapters, and "-" for topics.');
      return false;
    }
    
    setSyllabusError(null);
    const names = parsed.map(s => s.name);
    setParsedSubjectNames(names);
    
    // Initialize difficulties with 'medium' as default
    setSubjectDifficulties(names.map(name => ({ name, difficulty: 'medium' as DifficultyLevel })));
    return true;
  };

  const updateSubjectDifficulty = (subjectName: string, difficulty: DifficultyLevel) => {
    setSubjectDifficulties(prev => 
      prev.map(s => s.name === subjectName ? { ...s, difficulty } : s)
    );
  };

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
              {/* Multi-PDF uploader (new feature) */}
<MultiPDFUploader
  onFilesExtracted={(texts: string[]) => {
    const merged = texts.filter(Boolean).join("\n\n");
    setSyllabusText(prev => (prev ? prev + "\n\n" + merged : merged));
    if (syllabusError) setSyllabusError(null);
  }}
/>

{/* Old single PDF uploader — kept for backup */}
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

        {/* Step 6: Subject Difficulty */}
        {step === 6 && (
          <Card className="shadow-card border-0 animate-fade-up">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Target className="w-6 h-6 text-accent" />
                Which subjects do you find difficult?
              </CardTitle>
              <CardDescription>
                Rate your comfort level with each subject to personalize your study plan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Header row */}
              <div className="grid grid-cols-[1fr,auto] gap-4 items-center pb-2 border-b border-border">
                <span className="text-sm font-medium text-muted-foreground">Subject</span>
                <div className="grid grid-cols-3 gap-6 text-center">
                  <span className="text-sm font-medium text-success">Strong</span>
                  <span className="text-sm font-medium text-warning">Medium</span>
                  <span className="text-sm font-medium text-destructive">Weak</span>
                </div>
              </div>

              {/* Subject rows */}
              {subjectDifficulties.map((subject) => (
                <div 
                  key={subject.name}
                  className="grid grid-cols-[1fr,auto] gap-4 items-center p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium text-foreground">{subject.name}</span>
                  <RadioGroup
                    value={subject.difficulty}
                    onValueChange={(value) => updateSubjectDifficulty(subject.name, value as DifficultyLevel)}
                    className="grid grid-cols-3 gap-6"
                  >
                    <div className="flex justify-center">
                      <RadioGroupItem 
                        value="strong" 
                        id={`${subject.name}-strong`}
                        className="border-success data-[state=checked]:bg-success data-[state=checked]:border-success"
                      />
                    </div>
                    <div className="flex justify-center">
                      <RadioGroupItem 
                        value="medium" 
                        id={`${subject.name}-medium`}
                        className="border-warning data-[state=checked]:bg-warning data-[state=checked]:border-warning"
                      />
                    </div>
                    <div className="flex justify-center">
                      <RadioGroupItem 
                        value="weak" 
                        id={`${subject.name}-weak`}
                        className="border-destructive data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
                      />
                    </div>
                  </RadioGroup>
                </div>
              ))}

              {subjectDifficulties.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No subjects found. Please go back and add your syllabus.
                </p>
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
              onClick={() => {
                // Special handling for step 5 -> 6 transition
                if (step === 5) {
                  if (handleParseSyllabus()) {
                    setStep(step + 1);
                  }
                } else {
                  setStep(step + 1);
                }
              }}
              disabled={
                (step === 1 && !prepType) ||
                (step === 2 && !examDate) ||
                (step === 3 && subjects.length === 0) ||
                (step === 5 && !syllabusText.trim())
              }
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              variant="hero"
              onClick={handleSaveAndContinue}
              disabled={isLoading || subjectDifficulties.length === 0}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <ChevronRight className="w-4 h-4 mr-2" />
                  Complete Setup
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
