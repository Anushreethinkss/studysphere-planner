import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Clock, CheckCircle2, Play, Pause, RotateCcw } from 'lucide-react';

interface RevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  topic: {
    id: string;
    name: string;
    content: string | null;
    status: string;
    chapter: {
      name: string;
      subject: {
        name: string;
        color: string;
      };
    };
  };
}

const RevisionModal = ({ isOpen, onClose, onComplete, topic }: RevisionModalProps) => {
  const [checklist, setChecklist] = useState<boolean[]>([false, false, false, false]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerRunning) {
      interval = setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setChecklist([false, false, false, false]);
      setSeconds(0);
      setTimerRunning(false);
    }
  }, [isOpen]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const checklistItems = [
    'Reviewed key concepts',
    'Understood formulas/definitions',
    'Practiced examples mentally',
    'Feel confident about this topic'
  ];

  const completedCount = checklist.filter(Boolean).length;
  const progressPercent = (completedCount / checklist.length) * 100;

  const handleChecklistChange = (index: number) => {
    const newChecklist = [...checklist];
    newChecklist[index] = !newChecklist[index];
    setChecklist(newChecklist);
  };

  const handleComplete = () => {
    onComplete();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-accent" />
            Revise: {topic.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Topic Info */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge 
              variant="outline" 
              style={{ borderColor: topic.chapter.subject.color, color: topic.chapter.subject.color }}
            >
              {topic.chapter.subject.name}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              {topic.chapter.name}
            </Badge>
          </div>

          {/* Topic Summary */}
          {topic.content && (
            <div className="bg-muted/50 rounded-xl p-4 max-h-40 overflow-y-auto">
              <h4 className="font-semibold text-sm text-foreground mb-2">Topic Summary</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {topic.content.slice(0, 500)}
                {topic.content.length > 500 && '...'}
              </p>
            </div>
          )}

          {/* Timer */}
          <div className="bg-card border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Study Timer</span>
              </div>
              <span className="text-2xl font-mono font-bold text-foreground">
                {formatTime(seconds)}
              </span>
            </div>
            <div className="flex gap-2 mt-3">
              <Button 
                variant={timerRunning ? "outline" : "accent"} 
                size="sm" 
                onClick={() => setTimerRunning(!timerRunning)}
                className="flex-1"
              >
                {timerRunning ? (
                  <>
                    <Pause className="w-4 h-4 mr-1" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-1" />
                    Start
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSeconds(0)}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm text-foreground">Revision Checklist</h4>
              <span className="text-xs text-muted-foreground">{completedCount}/{checklist.length}</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            <div className="space-y-2">
              {checklistItems.map((item, index) => (
                <label 
                  key={index} 
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <Checkbox 
                    checked={checklist[index]} 
                    onCheckedChange={() => handleChecklistChange(index)}
                  />
                  <span className={`text-sm ${checklist[index] ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {item}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              variant="accent" 
              onClick={handleComplete} 
              className="flex-1"
              disabled={completedCount < 2}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Mark Complete
            </Button>
          </div>
          {completedCount < 2 && (
            <p className="text-xs text-muted-foreground text-center">
              Complete at least 2 checklist items to mark as done
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RevisionModal;