import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AppLayout from '@/components/AppLayout';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, 
  Clock, BookMarked, Brain, CheckCircle, Loader2
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';

interface Task {
  id: string;
  scheduled_date: string;
  duration_minutes: number;
  task_type: string;
  is_completed: boolean;
  topic: {
    name: string;
    chapter: {
      subject: {
        name: string;
        color: string;
      };
    };
  };
}

const CalendarPage = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user, currentMonth]);

  const fetchTasks = async () => {
    if (!user) return;

    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    try {
      const { data, error } = await supabase
        .from('study_tasks')
        .select(`
          id,
          scheduled_date,
          duration_minutes,
          task_type,
          is_completed,
          topic:topics (
            name,
            chapter:chapters (
              subject:subjects (
                name,
                color
              )
            )
          )
        `)
        .eq('user_id', user.id)
        .gte('scheduled_date', start.toISOString().split('T')[0])
        .lte('scheduled_date', end.toISOString().split('T')[0])
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      setTasks((data as unknown as Task[]) || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const getTasksForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return tasks.filter(t => t.scheduled_date === dateStr);
  };

  const selectedDateTasks = getTasksForDate(selectedDate);

  const getDateStatus = (date: Date) => {
    const dateTasks = getTasksForDate(date);
    if (dateTasks.length === 0) return 'none';
    if (dateTasks.every(t => t.is_completed)) return 'completed';
    if (dateTasks.some(t => t.is_completed)) return 'partial';
    return 'pending';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="bg-gradient-primary text-primary-foreground p-6 rounded-b-3xl">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <CalendarIcon className="w-6 h-6" />
          Study Calendar
        </h1>
        <p className="text-primary-foreground/70 mt-1">Plan your learning journey</p>
      </header>

      <div className="px-4 -mt-6 space-y-4">
        {/* Calendar Card */}
        <Card className="shadow-card border-0 animate-fade-up">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <CardTitle className="font-display">
                {format(currentMonth, 'MMMM yyyy')}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center text-xs text-muted-foreground font-medium py-2">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before the first of the month */}
              {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              
              {days.map((day) => {
                const status = getDateStatus(day);
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                const dayTasks = getTasksForDate(day);
                
                let bgClass = '';
                if (isSelected) {
                  bgClass = 'bg-primary text-primary-foreground';
                } else if (status === 'completed') {
                  bgClass = 'bg-success/20 text-success';
                } else if (status === 'partial') {
                  bgClass = 'bg-warning/20 text-warning';
                } else if (status === 'pending') {
                  bgClass = 'bg-accent/20 text-accent';
                }
                
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center transition-all duration-200 ${bgClass} ${
                      isToday && !isSelected ? 'ring-2 ring-primary' : ''
                    } hover:scale-105`}
                  >
                    <span className={`text-sm font-medium ${isSelected ? '' : 'text-foreground'}`}>
                      {format(day, 'd')}
                    </span>
                    {dayTasks.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {dayTasks.slice(0, 3).map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-1 h-1 rounded-full ${isSelected ? 'bg-primary-foreground' : 'bg-current'}`} 
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected Date Tasks */}
        <Card className="shadow-card border-0 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <CardHeader>
            <CardTitle className="font-display text-lg">
              {format(selectedDate, 'EEEE, MMMM d')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedDateTasks.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No tasks scheduled for this day</p>
              </div>
            ) : (
              selectedDateTasks.map((task) => (
                <div
                  key={task.id}
                  className={`p-4 rounded-xl border ${
                    task.is_completed ? 'bg-success/5 border-success/20' : 'bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${task.topic.chapter.subject.color}20` }}
                    >
                      {task.is_completed ? (
                        <CheckCircle className="w-5 h-5 text-success" />
                      ) : task.task_type === 'revision' ? (
                        <Brain className="w-5 h-5" style={{ color: task.topic.chapter.subject.color }} />
                      ) : (
                        <BookMarked className="w-5 h-5" style={{ color: task.topic.chapter.subject.color }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          style={{ 
                            borderColor: task.topic.chapter.subject.color, 
                            color: task.topic.chapter.subject.color 
                          }}
                        >
                          {task.topic.chapter.subject.name}
                        </Badge>
                        {task.task_type === 'revision' && (
                          <Badge variant="secondary" className="text-xs">Revision</Badge>
                        )}
                        {task.is_completed && (
                          <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                            Done
                          </Badge>
                        )}
                      </div>
                      <p className={`font-medium ${task.is_completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {task.topic.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {task.duration_minutes} minutes
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default CalendarPage;
