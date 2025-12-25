import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import AppLayout from '@/components/AppLayout';
import { useToast } from '@/hooks/use-toast';
import { 
  BookMarked, CheckCircle, Trash2, RefreshCcw, 
  Loader2, AlertCircle, Brain
} from 'lucide-react';

interface Mistake {
  id: string;
  question: string;
  user_answer: string;
  correct_answer: string;
  explanation: string | null;
  reviewed: boolean;
  created_at: string;
  topic: {
    name: string;
    chapter: {
      name: string;
      subject: {
        name: string;
        color: string;
      };
    };
  };
}

const Mistakes = () => {
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unreviewed'>('all');

  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchMistakes();
    }
  }, [user]);

  const fetchMistakes = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('mistakes')
        .select(`
          id,
          question,
          user_answer,
          correct_answer,
          explanation,
          reviewed,
          created_at,
          topic:topics (
            name,
            chapter:chapters (
              name,
              subject:subjects (
                name,
                color
              )
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMistakes((data as unknown as Mistake[]) || []);
    } catch (error) {
      console.error('Error fetching mistakes:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsReviewed = async (id: string) => {
    try {
      await supabase
        .from('mistakes')
        .update({ reviewed: true })
        .eq('id', id);

      setMistakes(mistakes.map(m => m.id === id ? { ...m, reviewed: true } : m));
      toast({
        title: 'Marked as fixed',
        description: 'Great job understanding this mistake!',
      });
    } catch (error) {
      console.error('Error updating mistake:', error);
    }
  };

  const deleteMistake = async (id: string) => {
    try {
      await supabase
        .from('mistakes')
        .delete()
        .eq('id', id);

      setMistakes(mistakes.filter(m => m.id !== id));
      toast({
        title: 'Mistake removed',
        description: 'The mistake has been deleted from your notebook.',
      });
    } catch (error) {
      console.error('Error deleting mistake:', error);
    }
  };

  const filteredMistakes = filter === 'unreviewed' 
    ? mistakes.filter(m => !m.reviewed)
    : mistakes;

  const unreviewedCount = mistakes.filter(m => !m.reviewed).length;

  // Group mistakes by subject, then by topic
  const groupedMistakes = filteredMistakes.reduce((acc, mistake) => {
    const subjectName = mistake.topic.chapter.subject.name;
    const topicName = mistake.topic.name;
    const subjectColor = mistake.topic.chapter.subject.color;

    if (!acc[subjectName]) {
      acc[subjectName] = { color: subjectColor, topics: {} };
    }
    if (!acc[subjectName].topics[topicName]) {
      acc[subjectName].topics[topicName] = [];
    }
    acc[subjectName].topics[topicName].push(mistake);
    return acc;
  }, {} as Record<string, { color: string; topics: Record<string, Mistake[]> }>);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <BookMarked className="w-6 h-6 text-accent" />
            Mistake Notebook
          </h1>
          <p className="text-muted-foreground mt-1">Learn from your errors</p>
        </div>

        {/* Stats Card */}
        <Card className="shadow-card border-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{mistakes.length}</p>
                  <p className="text-sm text-muted-foreground">Total mistakes</p>
                </div>
              </div>
              {unreviewedCount > 0 && (
                <Badge variant="destructive" className="text-sm">
                  {unreviewedCount} to fix
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Filter Buttons */}
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All ({mistakes.length})
          </Button>
          <Button
            variant={filter === 'unreviewed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('unreviewed')}
          >
            <RefreshCcw className="w-4 h-4 mr-1" />
            Unfixed ({unreviewedCount})
          </Button>
        </div>

        {/* Mistakes List */}
        {filteredMistakes.length === 0 ? (
          <Card className="shadow-card border-0">
            <CardContent className="p-8 text-center">
              <Brain className="w-16 h-16 text-accent mx-auto mb-4" />
              <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                {filter === 'unreviewed' ? 'All caught up!' : 'No mistakes yet!'}
              </h3>
              <p className="text-muted-foreground">
                {filter === 'unreviewed' 
                  ? 'You\'ve reviewed all your mistakes. Great job!'
                  : 'Complete some quizzes to start tracking your learning.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedMistakes).map(([subjectName, subjectData]) => {
              const subjectMistakeCount = Object.values(subjectData.topics).flat().length;
              return (
                <div key={subjectName} className="space-y-3">
                  {/* Subject Header */}
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: subjectData.color }}
                    />
                    <h2 className="font-display font-semibold text-foreground">
                      {subjectName}
                    </h2>
                    <Badge variant="outline" className="text-xs">
                      {subjectMistakeCount} {subjectMistakeCount === 1 ? 'mistake' : 'mistakes'}
                    </Badge>
                  </div>

                  {/* Topics within Subject */}
                  {Object.entries(subjectData.topics).map(([topicName, topicMistakes]) => (
                    <Card key={topicName} className="shadow-card border-0 overflow-hidden">
                      <div className="px-4 py-3 border-b border-border/50 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-foreground">{topicName}</p>
                          <Badge 
                            variant="secondary" 
                            className="text-xs"
                            style={{ 
                              backgroundColor: `${subjectData.color}20`,
                              color: subjectData.color
                            }}
                          >
                            {topicMistakes.length}
                          </Badge>
                        </div>
                      </div>
                      
                      <Accordion type="single" collapsible className="divide-y divide-border/30">
                        {topicMistakes.map((mistake) => (
                          <AccordionItem
                            key={mistake.id}
                            value={mistake.id}
                            className="border-0"
                          >
                            <AccordionTrigger className={`px-4 py-3 hover:no-underline ${mistake.reviewed ? 'opacity-60' : ''}`}>
                              <div className="flex items-start gap-3 text-left flex-1">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    {mistake.reviewed && (
                                      <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Fixed
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="font-medium text-foreground line-clamp-2 text-sm">
                                    {mistake.question}
                                  </p>
                                </div>
                              </div>
                            </AccordionTrigger>
                            
                            <AccordionContent>
                              <CardContent className="pt-0 px-4 pb-4">
                                <div className="space-y-4">
                                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                                    <p className="text-xs text-destructive font-medium mb-1">Your Answer</p>
                                    <p className="text-foreground">{mistake.user_answer}</p>
                                  </div>
                                  
                                  <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                                    <p className="text-xs text-success font-medium mb-1">Correct Answer</p>
                                    <p className="text-foreground">{mistake.correct_answer}</p>
                                  </div>
                                  
                                  {mistake.explanation && (
                                    <div className="p-3 rounded-lg bg-muted">
                                      <p className="text-xs text-muted-foreground font-medium mb-1">Explanation</p>
                                      <p className="text-foreground text-sm">{mistake.explanation}</p>
                                    </div>
                                  )}
                                  
                                  <div className="flex gap-2">
                                    {!mistake.reviewed && (
                                      <Button
                                        variant="success"
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => markAsReviewed(mistake.id)}
                                      >
                                        <CheckCircle className="w-4 h-4 mr-1" />
                                        Mark as Fixed
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteMistake(mistake.id)}
                                    >
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </Card>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Mistakes;
