import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        title: 'Marked as reviewed',
        description: 'Great job reviewing this mistake!',
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
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

      <div className="px-4 -mt-6 space-y-4">
        {/* Stats Card */}
        <Card className="shadow-card border-0 animate-fade-up">
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
                  {unreviewedCount} to review
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
            Unreviewed ({unreviewedCount})
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
          <Accordion type="single" collapsible className="space-y-3">
            {filteredMistakes.map((mistake, index) => (
              <AccordionItem
                key={mistake.id}
                value={mistake.id}
                className="border-0 animate-fade-up"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <Card className={`shadow-card border-0 overflow-hidden ${mistake.reviewed ? 'opacity-70' : ''}`}>
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-start gap-3 text-left">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${mistake.topic.chapter.subject.color}20` }}
                      >
                        <BookMarked 
                          className="w-5 h-5" 
                          style={{ color: mistake.topic.chapter.subject.color }} 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge 
                            variant="outline" 
                            className="text-xs"
                            style={{ 
                              borderColor: mistake.topic.chapter.subject.color, 
                              color: mistake.topic.chapter.subject.color 
                            }}
                          >
                            {mistake.topic.chapter.subject.name}
                          </Badge>
                          {mistake.reviewed && (
                            <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Reviewed
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium text-foreground line-clamp-2">
                          {mistake.question}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {mistake.topic.name}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  
                  <AccordionContent>
                    <CardContent className="pt-0 px-4 pb-4">
                      <div className="space-y-4 ml-13">
                        {/* Your Answer */}
                        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                          <p className="text-xs text-destructive font-medium mb-1">Your Answer</p>
                          <p className="text-foreground">{mistake.user_answer}</p>
                        </div>
                        
                        {/* Correct Answer */}
                        <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                          <p className="text-xs text-success font-medium mb-1">Correct Answer</p>
                          <p className="text-foreground">{mistake.correct_answer}</p>
                        </div>
                        
                        {/* Explanation */}
                        {mistake.explanation && (
                          <div className="p-3 rounded-lg bg-muted">
                            <p className="text-xs text-muted-foreground font-medium mb-1">Explanation</p>
                            <p className="text-foreground text-sm">{mistake.explanation}</p>
                          </div>
                        )}
                        
                        {/* Actions */}
                        <div className="flex gap-2">
                          {!mistake.reviewed && (
                            <Button
                              variant="success"
                              size="sm"
                              className="flex-1"
                              onClick={() => markAsReviewed(mistake.id)}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Mark Reviewed
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
                </Card>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </AppLayout>
  );
};

export default Mistakes;
