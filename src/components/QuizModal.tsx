import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { X, Loader2, CheckCircle2, XCircle, Sparkles, ArrowRight } from 'lucide-react';

interface Question {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  topic: {
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
  };
  onComplete: (score: number, quizId: string) => void;
}

const QuizModal = ({ isOpen, onClose, topic, onComplete }: QuizModalProps) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [quizId, setQuizId] = useState<string | null>(null);
  
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      generateQuiz();
    }
  }, [isOpen]);

  const generateQuiz = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Create quiz record
      const { data: quizData, error: quizError } = await supabase
        .from('quizzes')
        .insert({
          user_id: user.id,
          topic_id: topic.id,
        })
        .select()
        .single();

      if (quizError) throw quizError;
      setQuizId(quizData.id);

      // Generate questions via edge function
      const response = await supabase.functions.invoke('generate-quiz', {
        body: {
          topicName: topic.name,
          topicContent: topic.content,
          chapterName: topic.chapter.name,
          subjectName: topic.chapter.subject.name,
        },
      });

      if (response.error) throw response.error;

      const generatedQuestions = response.data.questions as Question[];
      setQuestions(generatedQuestions);

      // Save questions to database
      const questionsToInsert = generatedQuestions.map(q => ({
        quiz_id: quizData.id,
        question: q.question,
        options: q.options,
        correct_answer: q.correctAnswer,
        explanation: q.explanation,
      }));

      await supabase.from('quiz_questions').insert(questionsToInsert);

    } catch (error) {
      console.error('Error generating quiz:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate quiz. Please try again.',
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    setAnswers([...answers, index]);
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
    } else {
      // Calculate score
      const correctCount = answers.reduce((acc, ans, idx) => {
        return acc + (ans === questions[idx].correctAnswer ? 1 : 0);
      }, 0);
      // Include current answer
      const finalCorrect = correctCount + (selectedAnswer === questions[currentIndex].correctAnswer ? 1 : 0);
      const scorePercent = Math.round((finalCorrect / questions.length) * 100);

      // Save mistakes
      if (user && quizId) {
        const allAnswers = [...answers, selectedAnswer];
        const mistakes = questions
          .map((q, idx) => ({ ...q, userAnswer: allAnswers[idx], idx }))
          .filter(q => q.userAnswer !== q.correctAnswer);

        if (mistakes.length > 0) {
          // Get question IDs from database
          const { data: questionData } = await supabase
            .from('quiz_questions')
            .select('id, question')
            .eq('quiz_id', quizId);

          const mistakesToInsert = mistakes.map(m => {
            const dbQuestion = questionData?.find(q => q.question === m.question);
            return {
              user_id: user.id,
              topic_id: topic.id,
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
      }

      setShowResult(true);
      setTimeout(() => {
        onComplete(scorePercent, quizId || '');
      }, 2000);
    }
  };

  if (!isOpen) return null;

  const currentQuestion = questions[currentIndex];
  const isCorrect = selectedAnswer === currentQuestion?.correctAnswer;
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="fixed inset-0 bg-foreground/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-card border-0 animate-slide-in-right rounded-t-3xl sm:rounded-3xl">
        {loading ? (
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-accent animate-pulse" />
            </div>
            <h3 className="text-xl font-display font-bold text-foreground mb-2">Generating Quiz</h3>
            <p className="text-muted-foreground mb-4">AI is creating personalized questions...</p>
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          </CardContent>
        ) : showResult ? (
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-success flex items-center justify-center mx-auto mb-4 animate-bounce-in">
              <CheckCircle2 className="w-10 h-10 text-accent-foreground" />
            </div>
            <h3 className="text-2xl font-display font-bold text-foreground mb-2">Quiz Complete!</h3>
            <p className="text-lg text-muted-foreground">Great job on completing the quiz!</p>
          </CardContent>
        ) : currentQuestion ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-muted-foreground">{topic.chapter.subject.name}</p>
                  <p className="font-semibold text-foreground">{topic.name}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Question {currentIndex + 1} of {questions.length}
              </p>
            </div>

            {/* Question */}
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
                            ? 'bg-success text-accent-foreground' 
                            : showFeedback && isSelected 
                            ? 'bg-destructive text-accent-foreground'
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

              {/* Next Button */}
              {selectedAnswer !== null && (
                <Button 
                  variant="hero" 
                  className="w-full animate-fade-up"
                  onClick={handleNext}
                >
                  {currentIndex < questions.length - 1 ? (
                    <>
                      Next Question
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  ) : (
                    'Finish Quiz'
                  )}
                </Button>
              )}
            </CardContent>
          </>
        ) : null}
      </Card>
    </div>
  );
};

export default QuizModal;
