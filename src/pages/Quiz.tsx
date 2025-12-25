import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, CheckCircle2, XCircle, Sparkles, ArrowRight, 
  ArrowLeft, Trophy, AlertCircle, Smile, Meh, Frown, BookOpen
} from 'lucide-react';

interface Question {
  id?: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface TopicData {
  id: string;
  name: string;
  content: string | null;
  chapter: {
    name: string;
    subject: {
      name: string;
      color: string;
    };
  };
}

type QuizPhase = 'loading' | 'quiz' | 'result' | 'confidence';

const Quiz = () => {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [phase, setPhase] = useState<QuizPhase>('loading');
  const [topic, setTopic] = useState<TopicData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [selectedConfidence, setSelectedConfidence] = useState<'high' | 'medium' | 'low' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user && topicId) {
      loadTopicAndGenerateQuiz();
    }
  }, [user, topicId]);

  const loadTopicAndGenerateQuiz = async () => {
    if (!user || !topicId) return;

    try {
      // Fetch topic data
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select(`
          id,
          name,
          content,
          chapter:chapters (
            name,
            subject:subjects (
              name,
              color
            )
          )
        `)
        .eq('id', topicId)
        .eq('user_id', user.id)
        .single();

      if (topicError || !topicData) {
        toast({
          variant: 'destructive',
          title: 'Topic not found',
          description: 'Could not load the topic.',
        });
        navigate('/plan');
        return;
      }

      setTopic(topicData as unknown as TopicData);

      // Create quiz record
      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .insert({
          user_id: user.id,
          topic_id: topicId,
        })
        .select()
        .single();

      if (quizError) throw quizError;
      setQuizId(quizData.id);

      // Generate questions via edge function
      const response = await supabase.functions.invoke('generate-quiz', {
        body: {
          topicName: topicData.name,
          topicContent: topicData.content,
          chapterName: (topicData as any).chapter?.name || 'General',
          subjectName: (topicData as any).chapter?.subject?.name || 'General',
        },
      });

      if (response.error) {
        console.error('Quiz generation error:', response.error);
        throw new Error(response.error.message || 'Failed to generate quiz');
      }

      const generatedQuestions = response.data?.questions as Question[];
      
      if (!generatedQuestions || generatedQuestions.length === 0) {
        throw new Error('No questions generated');
      }

      setQuestions(generatedQuestions);
      setAnswers(new Array(generatedQuestions.length).fill(null));

      // Save questions to database
      const questionsToInsert = generatedQuestions.map(q => ({
        quiz_id: quizData.id,
        question: q.question,
        options: q.options,
        correct_answer: q.correctAnswer,
        explanation: q.explanation,
      }));

      await supabase.from('quiz_questions').insert(questionsToInsert);
      
      setPhase('quiz');
    } catch (error) {
      console.error('Error loading quiz:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate quiz. Please try again.',
      });
      navigate('/plan');
    }
  };

  const handleAnswer = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    const newAnswers = [...answers];
    newAnswers[currentIndex] = index;
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(answers[currentIndex + 1]);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedAnswer(answers[currentIndex - 1]);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!user || !quizId) return;

    // Calculate score
    const correctCount = answers.reduce((acc, ans, idx) => {
      return acc + (ans === questions[idx].correctAnswer ? 1 : 0);
    }, 0);
    const scorePercent = Math.round((correctCount / questions.length) * 100);
    setScore(scorePercent);

    // Save mistakes
    const mistakes = questions
      .map((q, idx) => ({ ...q, userAnswer: answers[idx], idx }))
      .filter(q => q.userAnswer !== null && q.userAnswer !== q.correctAnswer);

    if (mistakes.length > 0 && topicId) {
      const { data: questionData } = await supabase
        .from('quiz_questions')
        .select('id, question')
        .eq('quiz_id', quizId);

      const mistakesToInsert = mistakes.map(m => {
        const dbQuestion = questionData?.find(q => q.question === m.question);
        return {
          user_id: user.id,
          topic_id: topicId,
          question_id: dbQuestion?.id || '',
          question: m.question,
          user_answer: m.options[m.userAnswer ?? 0],
          correct_answer: m.options[m.correctAnswer],
          explanation: m.explanation,
        };
      }).filter(m => m.question_id);

      if (mistakesToInsert.length > 0) {
        await supabase.from('mistakes').insert(mistakesToInsert);
      }
    }

    // Update quiz with score
    await supabase
      .from('quizzes')
      .update({
        score: scorePercent,
        completed_at: new Date().toISOString(),
      })
      .eq('id', quizId);

    setPhase('result');
  };

  const handleConfidenceSubmit = async () => {
    if (!user || !topicId || !selectedConfidence || score === null) return;

    setIsSaving(true);

    try {
      // Determine status based on score and confidence
      let status: string;
      if (score >= 80 && selectedConfidence === 'high') {
        status = 'strong';
      } else if (score >= 50 || selectedConfidence === 'medium') {
        status = 'needs_revision';
      } else {
        status = 'weak';
      }

      console.log('Updating topic with status:', status, 'for topicId:', topicId);

      // Update topic - include user_id for RLS
      const { error: topicError } = await supabase
        .from('topics')
        .update({
          status,
          confidence: selectedConfidence,
          last_quiz_score: score,
          completed_at: new Date().toISOString(),
        })
        .eq('id', topicId)
        .eq('user_id', user.id);

      if (topicError) {
        console.error('Error updating topic:', topicError);
        throw topicError;
      }

      // Create study task record
      const today = new Date().toISOString().split('T')[0];
      const { error: taskError } = await supabase
        .from('study_tasks')
        .insert({
          user_id: user.id,
          topic_id: topicId,
          scheduled_date: today,
          duration_minutes: 30,
          task_type: 'study',
          is_completed: true,
          completed_at: new Date().toISOString(),
        });

      if (taskError) {
        console.error('Error creating study task:', taskError);
      }

      // Schedule revision based on status
      const todayDate = new Date();
      let revisionDates: Date[] = [];

      if (status === 'strong') {
        revisionDates = [
          new Date(todayDate.getTime() + 7 * 24 * 60 * 60 * 1000),
          new Date(todayDate.getTime() + 21 * 24 * 60 * 60 * 1000),
        ];
      } else if (status === 'needs_revision') {
        revisionDates = [
          new Date(todayDate.getTime() + 3 * 24 * 60 * 60 * 1000),
          new Date(todayDate.getTime() + 7 * 24 * 60 * 60 * 1000),
        ];
      } else {
        revisionDates = [
          new Date(todayDate.getTime() + 1 * 24 * 60 * 60 * 1000),
        ];
      }

      const revisionTasks = revisionDates.map((date, index) => ({
        user_id: user.id,
        topic_id: topicId,
        scheduled_date: date.toISOString().split('T')[0],
        duration_minutes: 20,
        task_type: 'revision' as const,
        require_quiz: status === 'weak', // Weak topics require a quiz on revision
      }));

      const { error: revisionError } = await supabase.from('study_tasks').insert(revisionTasks);
      if (revisionError) {
        console.error('Error scheduling revisions:', revisionError);
      }

      // Update streak
      const { data: profileData } = await supabase
        .from('profiles')
        .select('last_study_date, current_streak')
        .eq('user_id', user.id)
        .single();

      const todayStr = todayDate.toISOString().split('T')[0];
      const yesterday = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      let newStreak = 1;
      if (profileData?.last_study_date === yesterday) {
        newStreak = (profileData.current_streak || 0) + 1;
      } else if (profileData?.last_study_date === todayStr) {
        newStreak = profileData.current_streak || 1;
      }

      await supabase
        .from('profiles')
        .update({
          last_study_date: todayStr,
          current_streak: newStreak,
        })
        .eq('user_id', user.id);

      toast({
        title: 'Great job! Topic completed.',
        description: getStatusMessage(status),
      });

      console.log('Navigating to /plan');
      // Use state to signal Plan page to refresh data
      navigate('/plan', { state: { refreshKey: Date.now() } });
    } catch (error) {
      console.error('Error saving results:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save results. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'strong': return 'Excellent! Topic mastered! Revision in 7 days.';
      case 'needs_revision': return 'Good job! Revision scheduled in 3 days.';
      case 'weak': return 'Keep practicing! Revision scheduled for tomorrow.';
      default: return 'Progress saved!';
    }
  };

  const currentQuestion = questions[currentIndex];
  const isCorrect = selectedAnswer === currentQuestion?.correctAnswer;
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;
  const allAnswered = answers.every(a => a !== null);

  // Loading Phase
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card border-0">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-accent animate-pulse" />
            </div>
            <h3 className="text-xl font-display font-bold text-foreground mb-2">Generating Quiz</h3>
            <p className="text-muted-foreground mb-4">AI is creating personalized questions...</p>
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Quiz Phase
  if (phase === 'quiz' && currentQuestion) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${topic?.chapter.subject.color}20` }}
              >
                <BookOpen className="w-5 h-5" style={{ color: topic?.chapter.subject.color }} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{topic?.chapter.subject.name}</p>
                <p className="font-semibold text-foreground">{topic?.name}</p>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>

          {/* Question Card */}
          <Card className="shadow-card border-0 mb-6">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-6 leading-relaxed">
                {currentQuestion.question}
              </h3>

              {/* Options */}
              <div className="space-y-3 mb-6">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = selectedAnswer === idx;
                  const isCorrectOption = idx === currentQuestion.correctAnswer;
                  const showFeedback = selectedAnswer !== null;

                  let bgClass = 'bg-muted hover:bg-muted/80';
                  let borderClass = 'border-transparent';
                  
                  if (showFeedback) {
                    if (isCorrectOption) {
                      bgClass = 'bg-success/20';
                      borderClass = 'border-success';
                    } else if (isSelected) {
                      bgClass = 'bg-destructive/20';
                      borderClass = 'border-destructive';
                    }
                  } else if (isSelected) {
                    bgClass = 'bg-primary/10';
                    borderClass = 'border-primary';
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(idx)}
                      disabled={selectedAnswer !== null}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all duration-300 ${bgClass} ${borderClass}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                          showFeedback && isCorrectOption 
                            ? 'bg-success text-white' 
                            : showFeedback && isSelected 
                            ? 'bg-destructive text-white'
                            : 'bg-background text-foreground'
                        }`}>
                          {showFeedback && isCorrectOption ? (
                            <CheckCircle2 className="w-5 h-5" />
                          ) : showFeedback && isSelected ? (
                            <XCircle className="w-5 h-5" />
                          ) : (
                            String.fromCharCode(65 + idx)
                          )}
                        </div>
                        <span className="text-foreground">{option}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Explanation */}
              {selectedAnswer !== null && (
                <div className={`p-4 rounded-xl mb-6 animate-fade-up ${isCorrect ? 'bg-success/10' : 'bg-destructive/10'}`}>
                  <p className={`font-semibold mb-1 ${isCorrect ? 'text-success' : 'text-destructive'}`}>
                    {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                  </p>
                  <p className="text-sm text-muted-foreground">{currentQuestion.explanation}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={handlePrev}
              disabled={currentIndex === 0}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            {currentIndex < questions.length - 1 ? (
              <Button
                variant="accent"
                onClick={handleNext}
                disabled={selectedAnswer === null}
              >
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                variant="hero"
                onClick={handleSubmitQuiz}
                disabled={!allAnswered}
              >
                Submit Quiz
                <CheckCircle2 className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Result Phase
  if (phase === 'result') {
    const getScoreDisplay = () => {
      if (score >= 80) {
        return { icon: Trophy, color: 'text-success', bg: 'bg-success/20', message: 'Excellent work!' };
      } else if (score >= 50) {
        return { icon: AlertCircle, color: 'text-warning', bg: 'bg-warning/20', message: 'Good effort!' };
      } else {
        return { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/20', message: 'Keep practicing!' };
      }
    };

    const scoreDisplay = getScoreDisplay();
    const ScoreIcon = scoreDisplay.icon;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card border-0">
          <CardContent className="p-8 text-center">
            <div className={`w-20 h-20 rounded-full ${scoreDisplay.bg} flex items-center justify-center mx-auto mb-4 animate-bounce-in`}>
              <ScoreIcon className={`w-10 h-10 ${scoreDisplay.color}`} />
            </div>
            <p className="text-sm text-muted-foreground mb-2">Your Score</p>
            <p className="text-5xl font-display font-bold text-foreground mb-2">{score}%</p>
            <p className={`text-lg ${scoreDisplay.color} font-semibold mb-6`}>{scoreDisplay.message}</p>

            <Button variant="hero" className="w-full" onClick={() => setPhase('confidence')}>
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Confidence Phase
  if (phase === 'confidence') {
    const confidenceOptions = [
      { value: 'high' as const, icon: Smile, label: 'High', description: 'I understand this well', color: 'text-success', bg: 'bg-success/10', border: 'border-success' },
      { value: 'medium' as const, icon: Meh, label: 'Medium', description: 'I need a bit more practice', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning' },
      { value: 'low' as const, icon: Frown, label: 'Low', description: 'I need to study this more', color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive' },
    ];

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-card border-0">
          <CardContent className="p-6">
            <h3 className="text-xl font-display font-bold text-foreground text-center mb-6">
              How confident do you feel about this topic?
            </h3>
            
            <div className="space-y-3 mb-6">
              {confidenceOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedConfidence === option.value;
                
                return (
                  <button
                    key={option.value}
                    onClick={() => setSelectedConfidence(option.value)}
                    className={`w-full p-4 rounded-xl border-2 transition-all duration-300 ${
                      isSelected 
                        ? `${option.bg} ${option.border}` 
                        : 'border-border hover:border-primary/30 bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        isSelected ? option.bg : 'bg-background'
                      }`}>
                        <Icon className={`w-6 h-6 ${isSelected ? option.color : 'text-muted-foreground'}`} />
                      </div>
                      <div className="text-left">
                        <p className={`font-semibold ${isSelected ? option.color : 'text-foreground'}`}>
                          {option.label}
                        </p>
                        <p className="text-sm text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <Button
              variant="hero"
              className="w-full"
              disabled={!selectedConfidence || isSaving}
              onClick={handleConfidenceSubmit}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Complete Topic
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
};

export default Quiz;
